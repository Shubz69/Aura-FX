/**
 * Community moderation engine — pure evaluation (no DB).
 * Returns violations to apply strikes/XP in the message handler.
 */

const defaultRules = require('./rules.default');

function loadRules() {
  try {
    // Optional override path for future: process.env.COMMUNITY_MODERATION_RULES_PATH
    return defaultRules;
  } catch {
    return defaultRules;
  }
}

function normalizeRole(role) {
  return (role || '').toString().toUpperCase().trim();
}

function isPrivileged(rules, role) {
  const r = normalizeRole(role);
  const list = rules.privilegedRoles || ['ADMIN', 'SUPER_ADMIN'];
  return list.map((x) => String(x).toUpperCase()).includes(r);
}

/**
 * Extract candidate URLs / domains from text (best-effort; avoids blocking "e.g." false positives minimally).
 */
function findExternalUrls(text) {
  if (!text || typeof text !== 'string') return [];

  const found = [];
  const push = (raw) => {
    const t = raw.replace(/[),.;]+$/, '').trim();
    if (t.length > 3) found.push(t);
  };

  // Explicit schemes
  const schemeRe = /https?:\/\/[^\s<>"')]+/gi;
  let m;
  while ((m = schemeRe.exec(text)) !== null) push(m[0]);

  // www. ...
  const wwwRe = /\bwww\.[^\s<>"')]+/gi;
  while ((m = wwwRe.exec(text)) !== null) push(m[0]);

  // bare domain.tld/path (common TLDs)
  const bareRe =
    /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])\.(?:com|net|org|io|co|gg|me|app|tv|link|xyz|finance|club|info|dev|ai)(?:\/[^\s<>"')]*)?/gi;
  while ((m = bareRe.exec(text)) !== null) push(m[0]);

  return [...new Set(found)];
}

function hostnameFromCandidate(raw) {
  try {
    let s = raw.trim();
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s.replace(/^www\./i, 'www.');
    const u = new URL(s);
    return (u.hostname || '').toLowerCase();
  } catch {
    const cleaned = raw.replace(/^https?:\/\//i, '').split(/[/\s]/)[0] || '';
    return cleaned.toLowerCase();
  }
}

function isAllowedHost(hostname, allowedList) {
  if (!hostname) return false;
  const host = hostname.toLowerCase();
  for (const entry of allowedList || []) {
    const e = String(entry).toLowerCase();
    if (host === e || host.endsWith('.' + e.replace(/^\*\./, ''))) return true;
  }
  return false;
}

function evaluatePatternRules(rules, text) {
  const violations = [];
  const list = rules.patternRules || [];
  for (const rule of list) {
    try {
      const re = new RegExp(rule.test, rule.flags || 'i');
      if (re.test(text)) {
        violations.push({
          ruleId: rule.id,
          strikes: Number(rule.strikes) || 1,
          xpPenalty: Number(rule.xpPenalty) || 0,
          publicMessage: rule.publicMessage || 'This message violates community rules.',
        });
      }
    } catch (e) {
      console.warn('moderation pattern rule invalid:', rule?.id, e.message);
    }
  }
  return violations;
}

/**
 * @param {string} content - message body
 * @param {{ role?: string }} sender
 * @returns {{ allowed: boolean, violations: Array, skipReason?: string }}
 */
function moderateMessage(content, sender = {}) {
  const rules = loadRules();
  const role = sender.role;

  if (isPrivileged(rules, role)) {
    return { allowed: true, violations: [], skipReason: 'privileged_role' };
  }

  const text = (content || '').toString();
  const linkViolations = [];
  const allowedHosts = rules.allowedLinkHosts || [];

  // 1) Link policy: any non-allowlisted URL is blocked for regular users
  const candidates = findExternalUrls(text);
  const hasDisallowedLink = candidates.some((c) => {
    const host = hostnameFromCandidate(c);
    return host && !isAllowedHost(host, allowedHosts);
  });
  if (hasDisallowedLink) {
    const d = rules.defaults?.unauthorizedLink || { strikes: 1, xpPenalty: 15, ruleId: 'unauthorized_link' };
    linkViolations.push({
      ruleId: d.ruleId || 'unauthorized_link',
      strikes: Number(d.strikes) || 1,
      xpPenalty: Number(d.xpPenalty) || 0,
      publicMessage:
        'Links are not allowed unless posted by an admin. Remove the link and try again.',
    });
  }

  // 2) Pattern rules (wording / behaviour — add your full list in rules.default.js)
  const patternViolations = evaluatePatternRules(rules, text);

  const violations = dedupeViolations([...linkViolations, ...patternViolations]);

  if (violations.length === 0) {
    return { allowed: true, violations: [] };
  }

  return { allowed: false, violations };
}

function dedupeViolations(list) {
  const seen = new Set();
  const out = [];
  for (const v of list) {
    const id = (v.ruleId || '').toString();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(v);
  }
  return out;
}

function aggregatePenalties(violations) {
  let strikes = 0;
  let xpPenalty = 0;
  const ruleIds = [];
  for (const v of violations) {
    strikes += v.strikes || 0;
    xpPenalty += v.xpPenalty || 0;
    if (v.ruleId) ruleIds.push(v.ruleId);
  }
  const publicMessage =
    (violations[0] && violations[0].publicMessage) || 'Your message was blocked by the moderation system.';
  return { strikes, xpPenalty, ruleIds, publicMessage };
}

module.exports = {
  moderateMessage,
  aggregatePenalties,
  findExternalUrls,
  loadRules,
  isPrivileged,
  dedupeViolations,
};

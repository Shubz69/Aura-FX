'use strict';

/**
 * Normalizes Trader Desk brief plain-text / markdown for storage and preview:
 * removes asterisks and dash-like separators, restores readable sentence case when the model
 * returns shoutcase, preserves markdown headings (# … ## …).
 */

function stripAsterisks(text) {
  return String(text || '').replace(/\*/g, '');
}

function collapseCommaRuns(text) {
  return String(text || '')
    .replace(/,\s*,+/g, ', ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n');
}

/** Separator cleanup on a single line (preserves newlines via caller). */
function normalizeSeparatorsLine(line) {
  let L = String(line || '');
  L = L.replace(/[\u2014\u2013]/g, ', ');
  while (/\s-\s/.test(L)) {
    L = L.replace(/\s-\s/g, ', ');
  }
  // Keep line-leading "- word" as Markdown list syntax for ReactMarkdown (do not replace with •).
  return L;
}

function normalizeSeparatorsPreserveNewlines(text) {
  return String(text || '')
    .split('\n')
    .map(normalizeSeparatorsLine)
    .join('\n');
}

function isMostlyUppercase(s) {
  const letters = [...String(s)].filter((c) => /[a-zA-Z]/.test(c));
  if (letters.length < 10) return false;
  const up = letters.filter((c) => c === c.toUpperCase()).length;
  return up / letters.length >= 0.72;
}

function toSentenceCaseBlock(block) {
  const raw = String(block || '').trim();
  if (!raw || !isMostlyUppercase(raw)) return block;
  let lower = raw.toLowerCase();
  const parts = lower.split(/(?<=[.!?])\s+/);
  const rebuilt = parts
    .filter(Boolean)
    .map((sent) => {
      const t = sent.trim();
      if (!t.length) return '';
      return t.charAt(0).toUpperCase() + t.slice(1);
    })
    .join(' ');
  return rebuilt;
}

function transformPlainBlock(block) {
  const b = String(block || '');
  if (!b.trim()) return block;
  const paras = b.split(/\n\n+/);
  return paras.map((p) => toSentenceCaseBlock(p)).join('\n\n');
}

function applySentenceCaseOutsideHeadings(text) {
  const lines = String(text || '').split('\n');
  const chunks = [];
  let buf = [];
  const flush = () => {
    if (buf.length) {
      chunks.push({ kind: 'plain', text: buf.join('\n') });
      buf = [];
    }
  };
  for (const line of lines) {
    if (/^\s*#{1,6}\s/.test(line)) {
      flush();
      chunks.push({ kind: 'heading', text: line });
    } else {
      buf.push(line);
    }
  }
  flush();
  return chunks
    .map((c) => (c.kind === 'heading' ? c.text : transformPlainBlock(c.text)))
    .join('\n');
}

/**
 * Full pass for automated brief bodies (markdown-friendly).
 * @param {{ preserveEmphasis?: boolean }} [opts] — when true, keep `*` so **bold** survives for ReactMarkdown preview.
 */
function polishBriefMarkdown(markdown, opts = {}) {
  let t = opts.preserveEmphasis ? String(markdown || '') : stripAsterisks(markdown || '');
  t = t.replace(/^\s*---+?\s*$/gm, '');
  t = normalizeSeparatorsPreserveNewlines(t);
  t = collapseCommaRuns(t);
  t = applySentenceCaseOutsideHeadings(t);
  return String(t || '').trim();
}

module.exports = {
  polishBriefMarkdown,
};

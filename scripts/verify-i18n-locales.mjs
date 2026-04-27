/**
 * Verifies all locale common.json files have identical key paths to English.
 *
 * Flags:
 * - --skip-mirror-english — disable the check that fails when v===en for a non-en locale (minus allowlists).
 *
 * Always: key-path parity with en, non-empty string leaves for non-en, and mirror-English (unless skipped).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const localesRoot = path.join(root, 'src', 'i18n', 'locales');
/** Reject non-en strings that still equal English (minus allowlists). On by default; use --skip-mirror-english to disable. */
const mirrorEnglish = !process.argv.includes('--skip-mirror-english');

const BRAND_KEY_SUBSTR = ['slides.auraAI', 'slides.courses.statBadge', 'marketing.brand', 'wordmark', 'loadingBrand', 'auraAnalysis', 'Aura', 'TradingView', 'Binance', 'Coinbase', 'Bloomberg', 'Reuters', 'Glitch', 'A7FX', 'C & S', 'MFA', 'GDPR', 'PPTX', 'PowerPoint', 'GIF', 'GIFs', 'KB', 'MetaTrader', 'Twelve Data', 'CDN'];

/** Identical to English is acceptable for any locale (typography, brand, decorative UI). */
const IDENTICAL_OK_KEYS = new Set([
  'common.dash',
  'loadingSpinner.title',
  'loadingSpinner.percent',
  /** Em dash placeholder; same glyph is correct in every script. */
  'traderDeck.eta.emDash',
  /** Macro timing headline glue; same separator in every script. */
  'traderDeck.macroGen.sep',
]);

/**
 * Some locales use the same spelling as English for loanwords/cognates (e.g. French "Menu", "Performance").
 * Strict mode skips v===en for these key+language pairs only.
 */
/** Category/badge strings often match English (acronyms, loanwords); strict mode allows v===en here. */
/** Minimal allowlist: brand-like keys, acronyms, or intentional cross-locale identical tokens (e.g. @mention slug). */
const STRICT_IDENTICAL_OK_KEYS = new Set([
  'community.toast.xpAwarded',
  'community.badge.admin',
  'community.badge.premium',
  'community.badge.elite',
  'community.category.elite',
  'community.category.general',
  'community.category.premium',
  'community.category.trading',
  'community.category.forums',
  'community.channelMgr.optGeneral',
  'community.channelMgr.optPremium',
  'community.channelMgr.optForums',
  'community.channelMgr.description',
  'community.mention.slugFallback',
  'community.subModal.premiumCardTitle',
  'community.subModal.eliteCardTitle',
  'community.planName.premium',
  'community.planName.a7fx',
  'community.editChannel.catA7fx',
]);

const IDENTICAL_OK_BY_LANG = {
  es: new Set(['community.editChannel.catGeneral', 'community.editChannel.catPremium']),
  fr: new Set([
    'traderDeck.city.sydney',
    'traderDeck.city.tokyo',
    'traderDeck.city.newYork',
    'traderDeck.sessionContext.newYork',
    'traderDeck.sessionShort.new_york',
    'common.article',
    'navbar.journal',
    'navbar.messages',
    'navbar.menu',
    'home.desk.performance',
    'home.desk.conviction',
    'home.desk.discipline',
    'home.desk.notes',
    'home.desk.journalButton',
    'home.desk.tradeTag',
    'home.tradeMarkets.forexTitle',
    'home.tradeMarkets.cryptoTitle',
    'home.tradeMarkets.indicesTitle',
    'home.desk.pnl',
    'community.editChannel.catForums',
    'community.editChannel.catPremium',
    'community.editChannel.description',
  ]),
  pt: new Set([
    'community.editChannel.catPremium',
    'community.subModal.badgeElite',
    'traderDeck.city.dubai',
    'traderDeck.city.sydney',
  ]),
};

function flattenKeys(obj, prefix = '') {
  const keys = [];
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const k of Object.keys(obj).sort()) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
        keys.push(...flattenKeys(obj[k], p));
      } else {
        keys.push(p);
      }
    }
  }
  return keys;
}

function getLeaf(obj, dotted) {
  const parts = dotted.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

function loadLocale(code) {
  const fp = path.join(localesRoot, code, 'common.json');
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

const ALLOWED = new Set(['en', 'zh-CN', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ur']);
const codes = fs
  .readdirSync(localesRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory() && ALLOWED.has(d.name))
  .map((d) => d.name)
  .sort();

if (!codes.includes('en')) {
  console.error('Missing en locale');
  process.exit(1);
}

const en = loadLocale('en');
const enKeys = flattenKeys(en);
const enSet = new Set(enKeys);
let failed = false;

for (const code of codes) {
  if (code === 'en') continue;
  let tree;
  try {
    tree = loadLocale(code);
  } catch (e) {
    console.error(`Failed to load ${code}:`, e.message);
    failed = true;
    continue;
  }
  const keys = flattenKeys(tree);
  if (keys.length !== enKeys.length) {
    console.error(`${code}: key count ${keys.length} !== en ${enKeys.length}`);
    failed = true;
  }
  const set = new Set(keys);
  for (const k of enSet) {
    if (!set.has(k)) {
      console.error(`${code}: missing key path ${k}`);
      failed = true;
    }
  }
  for (const k of set) {
    if (!enSet.has(k)) {
      console.error(`${code}: extra key path ${k}`);
      failed = true;
    }
  }
  for (const k of enKeys) {
    const ev = getLeaf(en, k);
    const v = getLeaf(tree, k);
    if (typeof ev === 'string' && typeof v === 'string' && v.trim().length === 0 && ev.trim().length > 0) {
      console.error(`${code}: empty translation for required key ${k}`);
      failed = true;
    }
  }
  if (mirrorEnglish) {
    for (const k of enKeys) {
      const ev = getLeaf(en, k);
      const v = getLeaf(tree, k);
      if (typeof ev !== 'string' || typeof v !== 'string') continue;
      if (v === ev && v.trim().length > 0) {
        const deskGlueMirrorOk =
          code !== 'hi' &&
          (k.startsWith('traderDeck.macroGen.') ||
            k.startsWith('traderDeck.structureMap.') ||
            k.startsWith('traderDeck.riskRadar.'));
        const allow =
          IDENTICAL_OK_KEYS.has(k) ||
          STRICT_IDENTICAL_OK_KEYS.has(k) ||
          IDENTICAL_OK_BY_LANG[code]?.has(k) ||
          deskGlueMirrorOk ||
          BRAND_KEY_SUBSTR.some((s) => k.includes(s) || v.includes(s));
        if (!allow) {
          console.error(`${code}: value still English for ${k}`);
          failed = true;
        }
      }
    }
  }
}

if (failed) process.exit(1);
console.log(
  `i18n locale key parity OK (${codes.length} locales, ${enKeys.length} leaf keys).` +
    (mirrorEnglish ? ' Non-empty + mirror-English checks passed.' : ' Mirror-English check skipped (--skip-mirror-english).')
);

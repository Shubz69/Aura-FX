import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const localesRoot = path.join(root, 'src', 'i18n', 'locales');

const args = process.argv.slice(2);
const langsArg = args.find((a) => a.startsWith('--langs=')) || '--langs=hi,es';
const langs = langsArg.replace('--langs=', '').split(',').map((s) => s.trim()).filter(Boolean);

const ALLOW_VALUE_PATTERNS = [
  /AURA TERMINAL™/i,
  /A7FX/i,
  /https?:\/\//i,
  /[A-Z]{2,5}(?:\/[A-Z]{2,5})?/, // ticker-like
  /^[@#]\w+/,
  /\.(png|jpg|jpeg|gif|webp|svg|pdf|js|ts|tsx|jsx|json)$/i,
];

const ALLOW_KEY_PATTERNS = [
  /^common\.dash$/,
  /^traderDeck\.eta\.emDash$/,
  /^traderDeck\.macroGen\.sep$/,
  /^home\.slides\.courses\.statBadge$/,
  /^home\.marketing\.partner/,
  /^home\.marketing\.poweredByStrong$/,
  /^community\.pptxPowerPoint$/,
  /^community\.mention\.slugFallback$/,
  /^community\.channelMgr\.opt/,
  /^community\.badge\.(premium|admin)$/,
  /^community\.editChannel\.cat/,
  /^traderDeck\.macroGen\./,
  /^traderDeck\.structureMap\./,
  /^traderDeck\.riskRadar\./,
  /brand/i,
  /wordmark/i,
  /username/i,
  /ticker/i,
  /instrument/i,
  /url/i,
  /legal/i,
  /api/i,
  /code/i,
  /file/i,
];

function flatten(obj, prefix = '', out = {}) {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      const next = prefix ? `${prefix}.${k}` : k;
      flatten(v, next, out);
    }
    return out;
  }
  out[prefix] = obj;
  return out;
}

function loadLocale(code) {
  const fp = path.join(localesRoot, code, 'common.json');
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function isAllowed(key, value) {
  return ALLOW_KEY_PATTERNS.some((r) => r.test(key)) || ALLOW_VALUE_PATTERNS.some((r) => r.test(value));
}

const en = flatten(loadLocale('en'));
let failed = false;

for (const lng of langs) {
  const tree = flatten(loadLocale(lng));
  for (const [key, enValue] of Object.entries(en)) {
    const lv = tree[key];
    if (typeof enValue !== 'string' || typeof lv !== 'string') continue;
    if (!enValue.trim()) continue;
    if (lv === enValue && !isAllowed(key, lv)) {
      failed = true;
      console.error(`${lng}: static English remains at ${key}`);
    }
  }
}

if (failed) process.exit(1);
console.log(`Static-English audit passed for: ${langs.join(', ')}`);

/**
 * Community message translation: protect sensitive spans, call provider, restore.
 * Provider: explicit mock (COMMUNITY_TRANSLATE_PROVIDER=mock), Google, or LibreTranslate.
 * Without a real provider (and not mock), returns { translated: false } — no fake MT in production.
 */

const PL = (i, tag) => `\u27e6${tag}${i}\u27e7`;

const SUPPORTED = new Set(['en', 'zh-CN', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ur']);

function normalizeLang(code) {
  if (!code || typeof code !== 'string') return 'en';
  const c = code.trim();
  if (SUPPORTED.has(c)) return c;
  if (c.toLowerCase().startsWith('zh')) return 'zh-CN';
  return 'en';
}

function useMockProvider() {
  return (process.env.COMMUNITY_TRANSLATE_PROVIDER || '').toLowerCase().trim() === 'mock';
}

function hasRealTranslationProvider() {
  const googleKey = process.env.GOOGLE_TRANSLATE_API_KEY || process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY;
  const libreUrl = process.env.LIBRETRANSLATE_API_URL;
  return !!(googleKey || libreUrl);
}

/**
 * Replace URLs, fenced code blocks, inline code, $TICKER, @mentions, and **trading-domain** spans
 * with placeholders so generic MT does not literal-translate them (Long→longue, SL→es, etc.).
 * Restored verbatim after translation — preserves international desk terminology (English) where standard.
 *
 * Long/Short: freezes LONG/SHORT/Long/Short and common phrases ("going long", "stay short") to avoid
 * false positives like "how long" (lowercase "long" alone is not frozen).
 *
 * @returns {{ masked: string, tokens: string[] }}
 */
function protectForTranslation(text) {
  const tokens = [];
  let s = String(text || '');

  const push = (raw) => {
    const i = tokens.length;
    tokens.push(raw);
    return PL(i, 'X');
  };

  s = s.replace(/```[\s\S]*?```/g, (m) => push(m));
  s = s.replace(/`[^`\n]+`/g, (m) => push(m));
  s = s.replace(/\[FILE:[^\]]+\]/gi, (m) => push(m));
  s = s.replace(/https?:\/\/[^\s]+|www\.[^\s]+/gi, (m) => push(m));
  s = s.replace(/\$[A-Za-z]{1,10}\b/g, (m) => push(m));
  s = s.replace(/#[\w\u0600-\u06FF]{1,64}\b/g, (m) => push(m));
  s = s.replace(/@[\w.-]{1,64}\b/g, (m) => push(m));

  // ── Trading / market terminology (longer phrases first) ─────────────────
  s = s.replace(/\b(order\s+flow)\b/gi, (m) => push(m));
  s = s.replace(/\b(stop\s+loss|take\s+profit)\b/gi, (m) => push(m));
  s = s.replace(/\b(breakout|liquidity)\b/gi, (m) => push(m));
  s = s.replace(/\b(p\s*&\s*l|pnl)\b/gi, (m) => push(m));
  s = s.replace(/\b(sl|tp)\b/gi, (m) => push(m));
  s = s.replace(/\b(LONG|SHORT)\b/g, (m) => push(m));
  s = s.replace(/\b(Long|Short)\b/g, (m) => push(m));
  s = s.replace(
    /\b(going|gone|stay(?:ing)?|hold(?:ing)?|ran|run|stayed|remain(?:s|ed)?)\s+(long|short)\b/gi,
    (m) => push(m)
  );

  return { masked: s, tokens };
}

function unprotectAfterTranslation(translated, tokens) {
  let out = String(translated || '');
  for (let i = 0; i < tokens.length; i += 1) {
    out = out.split(PL(i, 'X')).join(tokens[i]);
    out = out.split(PL(i, 'X').normalize('NFC')).join(tokens[i]);
  }
  return out;
}

async function translateGoogle(masked, source, target, apiKey) {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: masked,
      source: source === 'auto' ? undefined : source,
      target,
      format: 'text',
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Google translate HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const tr = data?.data?.translations?.[0]?.translatedText;
  if (!tr) throw new Error('Google translate: empty response');
  return tr;
}

async function translateLibre(masked, source, target, baseUrl) {
  const u = baseUrl.replace(/\/$/, '') + '/translate';
  const res = await fetch(u, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: masked,
      source: source === 'auto' ? 'auto' : source,
      target,
      format: 'text',
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Libre translate HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data && typeof data.translatedText === 'string') return data.translatedText;
  throw new Error('Libre translate: invalid response');
}

/** Deterministic mock for tests / explicit COMMUNITY_TRANSLATE_PROVIDER=mock only. */
function translateMock(masked, source, target) {
  const s = normalizeLang(source);
  const t = normalizeLang(target);
  if (s === t) return masked;
  if (s === 'es' && t === 'hi') {
    return `[HI] ${masked.replace(/hola/gi, 'नमस्ते')}`;
  }
  if (s === 'hi' && t === 'en') {
    return `[EN] ${masked}`;
  }
  return `[${t}] ${masked}`;
}

/**
 * @param {{ text: string, sourceLanguage: string, targetLanguage: string }} opts
 * @returns {Promise<{ text: string, translated: boolean }>}
 */
async function translateMessageText(opts) {
  const sourceLanguage = normalizeLang(opts.sourceLanguage);
  const targetLanguage = normalizeLang(opts.targetLanguage);
  const text = String(opts.text || '');
  if (!text.trim() || sourceLanguage === targetLanguage) {
    return { text, translated: false };
  }

  const { masked, tokens } = protectForTranslation(text);
  const googleKey = process.env.GOOGLE_TRANSLATE_API_KEY || process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY;
  const libreUrl = process.env.LIBRETRANSLATE_API_URL;

  const mock = useMockProvider();
  const real = hasRealTranslationProvider();

  if (!mock && !real) {
    return { text, translated: false };
  }

  let raw;
  try {
    if (mock) {
      raw = translateMock(masked, sourceLanguage, targetLanguage);
    } else if (googleKey) {
      raw = await translateGoogle(masked, sourceLanguage, targetLanguage, googleKey);
    } else {
      raw = await translateLibre(masked, sourceLanguage, targetLanguage, libreUrl);
    }
  } catch {
    return { text, translated: false };
  }

  return { text: unprotectAfterTranslation(raw, tokens), translated: true };
}

module.exports = {
  normalizeLang,
  protectForTranslation,
  unprotectAfterTranslation,
  translateMessageText,
  useMockProvider,
  hasRealTranslationProvider,
  SUPPORTED,
};

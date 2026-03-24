const KEY = 'aura-trader-passport-pending';

/**
 * Convert a data: URL to Blob without fetch() — CSP connect-src blocks fetch(data:...).
 */
export function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new Error('Invalid data URL');
  }
  const comma = dataUrl.indexOf(',');
  if (comma === -1) throw new Error('Invalid data URL');
  const header = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  let mime = 'image/png';
  const mimeMatch = /^data:([^;,]+)/.exec(header);
  if (mimeMatch) mime = mimeMatch[1];

  if (/;base64/i.test(header)) {
    const binary = atob(body);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  const decoded = decodeURIComponent(body);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Store passport share payload (memory + sessionStorage fallback). */
export function setTraderPassportShare(payload) {
  if (!payload || typeof payload.dataUrl !== 'string') return;
  if (typeof window !== 'undefined') {
    window.__auraTraderPassportStash = payload;
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota or private mode */
  }
}

/**
 * Take pending passport payload once. Prefer in-memory stash (Strict Mode safe when restored on cancel).
 */
export function popTraderPassportShare() {
  if (typeof window !== 'undefined' && window.__auraTraderPassportStash) {
    const s = window.__auraTraderPassportStash;
    delete window.__auraTraderPassportStash;
    try {
      sessionStorage.removeItem(KEY);
    } catch { /* ignore */ }
    return s;
  }
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

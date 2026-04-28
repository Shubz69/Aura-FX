/**
 * Client-side cache for community message runtime translations (per messageId + targetLanguage).
 * Values: { text: string, translated: boolean } — translated=false means show original only (no fake MT).
 */

const mem = new Map();

export function cacheKey(messageId, targetLanguage) {
  return `${String(messageId)}:${String(targetLanguage)}`;
}

export function getCachedTranslation(messageId, targetLanguage) {
  return mem.get(cacheKey(messageId, targetLanguage)) ?? null;
}

export function setCachedTranslation(messageId, targetLanguage, payload) {
  mem.set(cacheKey(messageId, targetLanguage), payload);
}

/** Clear all cached targets for a message (e.g. after edit). */
export function invalidateMessageTranslation(messageId) {
  const prefix = `${String(messageId)}:`;
  for (const k of mem.keys()) {
    if (k.startsWith(prefix)) mem.delete(k);
  }
}

export function clearTranslationCache() {
  mem.clear();
}

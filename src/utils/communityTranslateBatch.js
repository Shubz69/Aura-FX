/**
 * Debounced batching for POST /api/translate-messages.
 */

import Api from '../services/Api';
import { getCachedTranslation, setCachedTranslation, cacheKey } from './communityMessageTranslationCache';

const DEBOUNCE_MS = 220;
const MAX_BATCH = 20;

/** @type {Map<string, { messageId: number, text: string, sourceLanguage: string, targetLanguage: string, cbs: Array<(p: { text: string, translated: boolean }) => void> }>} */
const pending = new Map();
let timer = null;

function scheduleFlush() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
}

function flush() {
  timer = null;
  if (pending.size === 0) return;
  const all = Array.from(pending.values());
  pending.clear();

  const byTarget = new Map();
  for (const v of all) {
    if (!byTarget.has(v.targetLanguage)) byTarget.set(v.targetLanguage, []);
    byTarget.get(v.targetLanguage).push(v);
  }

  for (const [targetLanguage, list] of byTarget) {
    for (let i = 0; i < list.length; i += MAX_BATCH) {
      const chunk = list.slice(i, i + MAX_BATCH);
      const items = chunk.map((v) => ({
        messageId: v.messageId,
        text: v.text,
        sourceLanguage: v.sourceLanguage,
      }));

      void Api.translateMessages({ targetLanguage, items })
        .then((res) => {
          const results = res?.data?.results;
          const byId = new Map();
          if (Array.isArray(results)) {
            for (const r of results) {
              byId.set(Number(r.messageId), r);
            }
          }
          for (const v of chunk) {
            const r = byId.get(v.messageId);
            const payload = r
              ? {
                  text: r.translatedText != null ? String(r.translatedText) : v.text,
                  translated: r.translated !== false,
                }
              : { text: v.text, translated: false };
            setCachedTranslation(v.messageId, targetLanguage, payload);
            v.cbs.forEach((cb) => {
              try {
                cb(payload);
              } catch {
                /* ignore */
              }
            });
          }
        })
        .catch(() => {
          for (const v of chunk) {
            const payload = { text: v.text, translated: false };
            v.cbs.forEach((cb) => {
              try {
                cb(payload);
              } catch {
                /* ignore */
              }
            });
          }
        });
    }
  }
}

/**
 * Queue a translation; resolves with { text, translated } when batch returns (or from client cache).
 */
export function scheduleCommunityTranslate({ messageId, text, sourceLanguage, targetLanguage }) {
  const hit = getCachedTranslation(messageId, targetLanguage);
  if (hit) return Promise.resolve(hit);

  return new Promise((resolve) => {
    const key = cacheKey(messageId, targetLanguage);
    let entry = pending.get(key);
    if (!entry) {
      entry = {
        messageId,
        text,
        sourceLanguage,
        targetLanguage,
        cbs: [],
      };
      pending.set(key, entry);
    }
    entry.text = text;
    entry.sourceLanguage = sourceLanguage;
    entry.cbs.push(resolve);
    scheduleFlush();
  });
}

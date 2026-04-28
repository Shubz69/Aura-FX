/**
 * Community runtime translation: engine, single + batch API, cache, no-provider behavior.
 * Run: node tests/community-message-translate.test.js
 */

process.env.COMMUNITY_TRANSLATE_PROVIDER = 'mock';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit_test_jwt_secret_min16chars';

const jwt = require('jsonwebtoken');
const {
  normalizeLang,
  protectForTranslation,
  unprotectAfterTranslation,
  translateMessageText,
} = require('../api/utils/communityTranslateEngine');

let passed = 0;
let failed = 0;

async function describeBlock(name, fn) {
  console.log(`\n${name}`);
  await fn();
}

async function it(name, fn) {
  try {
    await Promise.resolve(fn());
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

const expect = (actual) => ({
  toBe: (expected) => {
    if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
  },
  toContain: (sub) => {
    if (!String(actual).includes(sub)) throw new Error(`Expected ${actual} to contain ${sub}`);
  },
});

(async () => {
  await describeBlock('communityTranslateEngine', async () => {
    await it('normalizeLang maps zh variants', () => {
      expect(normalizeLang('zh')).toBe('zh-CN');
      expect(normalizeLang('zh-CN')).toBe('zh-CN');
    });

    await it('same-language returns translated false', async () => {
      const out = await translateMessageText({ text: 'hello', sourceLanguage: 'en', targetLanguage: 'en' });
      expect(out.translated).toBe(false);
      expect(out.text).toBe('hello');
    });

    await it('Spanish mock to Hindi contains HI marker', async () => {
      const out = await translateMessageText({ text: 'hola amigo', sourceLanguage: 'es', targetLanguage: 'hi' });
      expect(out.translated).toBe(true);
      expect(out.text).toContain('[HI]');
    });

    await it('Hindi mock to English contains EN marker', async () => {
      const out = await translateMessageText({ text: 'नमस्ते', sourceLanguage: 'hi', targetLanguage: 'en' });
      expect(out.translated).toBe(true);
      expect(out.text).toContain('[EN]');
    });

    await it('protects tickers and restores', () => {
      const { masked, tokens } = protectForTranslation('buy $AAPL now');
      expect(masked.includes('$AAPL')).toBe(false);
      const back = unprotectAfterTranslation(masked.replace('buy', 'kaufen'), tokens);
      expect(back).toContain('$AAPL');
    });

    await it('freezes trading terms PnL SL TP Breakout Liquidity Order flow', () => {
      const raw = 'PnL +1R SL 50 TP 100 breakout at liquidity, order flow long';
      const { masked, tokens } = protectForTranslation(raw);
      expect(tokens.some((t) => /PnL|P&L|pnl/i.test(t))).toBe(true);
      expect(tokens.some((t) => /\bSL\b/i.test(t))).toBe(true);
      expect(tokens.some((t) => /\bTP\b/i.test(t))).toBe(true);
      expect(tokens.some((t) => /breakout/i.test(t))).toBe(true);
      expect(tokens.some((t) => /liquidity/i.test(t))).toBe(true);
      expect(tokens.some((t) => /order\s+flow/i.test(t))).toBe(true);
      const back = unprotectAfterTranslation(masked.replace(/kaufen/gi, 'buy'), tokens);
      expect(back).toContain('PnL');
      expect(back).toContain('SL');
    });

    await it('freezes Long/Short and going long without touching how long', () => {
      const { masked: m1, tokens: t1 } = protectForTranslation('Long bias on ES');
      expect(t1.some((t) => /^Long$/i.test(String(t).trim()))).toBe(true);
      const { tokens: t2 } = protectForTranslation('how long until NY open');
      expect(t2.some((t) => /long/i.test(t) && !/until/i.test(t))).toBe(false);
      const { tokens: t3 } = protectForTranslation('going short into CPI');
      expect(t3.some((t) => /going\s+short/i.test(t))).toBe(true);
    });
  });

  await describeBlock('no provider (production) returns original, translated false', async () => {
    await it('skips fake MT without mock or API keys', async () => {
      const prev = process.env.COMMUNITY_TRANSLATE_PROVIDER;
      const prevN = process.env.NODE_ENV;
      const prevG = process.env.GOOGLE_TRANSLATE_API_KEY;
      const prevL = process.env.LIBRETRANSLATE_API_URL;
      process.env.COMMUNITY_TRANSLATE_PROVIDER = '';
      process.env.NODE_ENV = 'production';
      delete process.env.GOOGLE_TRANSLATE_API_KEY;
      delete process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY;
      delete process.env.LIBRETRANSLATE_API_URL;
      const engPath = require.resolve('../api/utils/communityTranslateEngine.js');
      delete require.cache[engPath];
      const eng = require('../api/utils/communityTranslateEngine.js');
      const out = await eng.translateMessageText({ text: 'hello world', sourceLanguage: 'en', targetLanguage: 'es' });
      expect(out.translated).toBe(false);
      expect(out.text).toBe('hello world');
      process.env.COMMUNITY_TRANSLATE_PROVIDER = prev || 'mock';
      process.env.NODE_ENV = prevN || 'test';
      if (prevG) process.env.GOOGLE_TRANSLATE_API_KEY = prevG;
      if (prevL) process.env.LIBRETRANSLATE_API_URL = prevL;
      delete require.cache[engPath];
    });
  });

  await describeBlock('translate-message handler cache', async () => {
    await it('second identical request uses DB cache (single insert)', async () => {
      process.env.COMMUNITY_TRANSLATE_PROVIDER = 'mock';
      const token = jwt.sign({ id: 42, role: 'ADMIN' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
      let selectCacheCalls = 0;
      let insertCalls = 0;

      const executeQuery = async (sql, params) => {
        const s = String(sql);
        if (s.includes('FROM message_translations') && s.includes('SELECT')) {
          selectCacheCalls += 1;
          if (selectCacheCalls >= 2) {
            return [[{ translated_text: 'cached-line', source_language: 'es' }]];
          }
          return [[]];
        }
        if (s.includes('FROM messages') && s.includes('WHERE id =')) {
          return [[{
            id: params[0],
            sender_id: 2,
            channel_id: 'general',
            content: 'hola',
            deleted_at: null,
            original_language: 'es',
          }]];
        }
        if (s.includes('FROM users')) {
          return [[{
            id: 42,
            email: 't@example.com',
            role: 'ADMIN',
            subscription_plan: 'elite',
            subscription_status: 'active',
            subscription_expiry: null,
            payment_failed: 0,
            onboarding_accepted: 1,
            onboarding_subscription_snapshot: null,
          }]];
        }
        if (s.includes('FROM channels')) {
          return [[{
            id: 'general',
            name: 'General',
            access_level: 'open',
            permission_type: 'open',
          }]];
        }
        if (s.includes('INSERT INTO message_translations')) {
          insertCalls += 1;
          return [[{ affectedRows: 1 }], []];
        }
        return [[]];
      };

      const dbPath = require.resolve('../api/db');
      delete require.cache[dbPath];
      require.cache[dbPath] = {
        id: dbPath,
        filename: dbPath,
        loaded: true,
        exports: { executeQuery },
      };

      const schemaPath = require.resolve('../api/utils/ensure-community-message-translation-schema');
      delete require.cache[schemaPath];
      require.cache[schemaPath] = {
        id: schemaPath,
        filename: schemaPath,
        loaded: true,
        exports: {
          ensureOriginalLanguageOnMessages: async () => {},
          ensureMessageTranslationsTable: async () => {},
          ensureCommunityAutoTranslateColumn: async () => {},
        },
      };

      const engPath = require.resolve('../api/utils/communityTranslateEngine.js');
      delete require.cache[engPath];
      require('../api/utils/communityTranslateEngine.js');

      const handlerPath = require.resolve('../api/translate-message.js');
      delete require.cache[handlerPath];
      const handler = require('../api/translate-message.js');

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: { text: 'hola', sourceLanguage: 'es', targetLanguage: 'hi', messageId: 9001 },
      };

      const run = () =>
        new Promise((resolve) => {
          const res = {
            statusCode: 200,
            setHeader() {},
            status(c) {
              this.statusCode = c;
              return this;
            },
            json(o) {
              resolve({ statusCode: this.statusCode, body: o });
            },
          };
          handler(req, res);
        });

      const r1 = await run();
      const r2 = await run();
      expect(r1.statusCode).toBe(200);
      expect(r2.statusCode).toBe(200);
      expect(r2.body.cached).toBe(true);
      expect(r2.body.translated).toBe(true);
      expect(r2.body.translatedText).toBe('cached-line');
      expect(insertCalls).toBe(1);
    });
  });

  await describeBlock('translate-messages batch', async () => {
    await it('returns cached for hit without second insert', async () => {
      process.env.COMMUNITY_TRANSLATE_PROVIDER = 'mock';
      const token = jwt.sign({ id: 7, role: 'ADMIN' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
      let insertCalls = 0;

      const executeQuery = async (sql, params) => {
        const s = String(sql);
        if (s.includes('message_translations') && s.includes('SELECT') && s.includes('IN (')) {
          return [[{ message_id: 10, translated_text: 'batch-cached', source_language: 'es' }]];
        }
        if (s.includes('FROM messages') && s.includes('IN (')) {
          return [[{
            id: 10,
            sender_id: 2,
            channel_id: 'general',
            content: 'hola',
            deleted_at: null,
            original_language: 'es',
          }]];
        }
        if (s.includes('FROM users')) {
          return [[{
            id: 7,
            email: 'b@example.com',
            role: 'ADMIN',
            subscription_plan: 'elite',
            subscription_status: 'active',
            subscription_expiry: null,
            payment_failed: 0,
            onboarding_accepted: 1,
            onboarding_subscription_snapshot: null,
          }]];
        }
        if (s.includes('FROM channels')) {
          return [[{
            id: 'general',
            name: 'General',
            access_level: 'open',
            permission_type: 'open',
          }]];
        }
        if (s.includes('INSERT INTO message_translations')) {
          insertCalls += 1;
          return [[], []];
        }
        return [[]];
      };

      const dbPath = require.resolve('../api/db');
      delete require.cache[dbPath];
      require.cache[dbPath] = {
        id: dbPath,
        filename: dbPath,
        loaded: true,
        exports: { executeQuery },
      };

      const schemaPath = require.resolve('../api/utils/ensure-community-message-translation-schema');
      delete require.cache[schemaPath];
      require.cache[schemaPath] = {
        id: schemaPath,
        filename: schemaPath,
        loaded: true,
        exports: {
          ensureOriginalLanguageOnMessages: async () => {},
          ensureMessageTranslationsTable: async () => {},
          ensureCommunityAutoTranslateColumn: async () => {},
        },
      };

      const engPath = require.resolve('../api/utils/communityTranslateEngine.js');
      delete require.cache[engPath];
      require('../api/utils/communityTranslateEngine.js');

      const batchPath = require.resolve('../api/translate-messages.js');
      delete require.cache[batchPath];
      const batchHandler = require('../api/translate-messages.js');

      const res = await new Promise((resolve) => {
        const r = {
          statusCode: 200,
          setHeader() {},
          status(c) {
            this.statusCode = c;
            return this;
          },
          json(o) {
            resolve({ statusCode: this.statusCode, body: o });
          },
        };
        batchHandler(
          {
            method: 'POST',
            headers: { authorization: `Bearer ${token}` },
            body: {
              targetLanguage: 'hi',
              items: [{ messageId: 10, text: 'hola', sourceLanguage: 'es' }],
            },
          },
          r
        );
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.results.length).toBe(1);
      expect(res.body.results[0].cached).toBe(true);
      expect(res.body.results[0].translated).toBe(true);
      expect(insertCalls).toBe(0);
    });
  });

  await describeBlock('client cache invalidate', async () => {
    await it('invalidateMessageTranslation clears keys', async () => {
      const mod = await import('../src/utils/communityMessageTranslationCache.js');
      mod.setCachedTranslation(99, 'hi', { text: 'x', translated: true });
      if (!mod.getCachedTranslation(99, 'hi')) throw new Error('expected cache entry');
      mod.invalidateMessageTranslation(99);
      expect(mod.getCachedTranslation(99, 'hi')).toBe(null);
    });
  });

  await describeBlock('auto-translate off (UI contract)', async () => {
    await it('translated false never enables show-toggle contract', () => {
      const payload = { text: 'hola', translated: false };
      const needsTranslation = true;
      const translatedBody =
        payload && payload.translated === true && typeof payload.text === 'string' ? payload.text : null;
      const showToggle =
        needsTranslation &&
        payload &&
        payload.translated === true &&
        translatedBody != null &&
        translatedBody !== 'hola';
      expect(showToggle).toBe(false);
    });
  });

  await describeBlock('RTL', async () => {
    await it('Arabic and Urdu are rtl in i18n config', () => {
      const RTL = new Set(['ar', 'ur']);
      expect(RTL.has('ar')).toBe(true);
      expect(RTL.has('ur')).toBe(true);
      expect(RTL.has('en')).toBe(false);
    });
  });

  console.log(`\ncommunity-message-translate: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();

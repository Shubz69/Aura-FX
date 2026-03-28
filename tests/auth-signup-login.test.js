/**
 * Auth signup / login unit & handler smoke tests (no real DB).
 * Run: node tests/auth-signup-login.test.js
 * Or:  npm run test:auth
 */

const bcrypt = require('bcrypt');
const {
  looksLikeBcryptHash,
  verifyPasswordWithOptionalRehash,
} = require('../api/utils/loginPassword');
const {
  normalizePhoneE164,
  checkPhoneAlreadyRegistered,
} = require('../api/utils/signupEligibility');

let passed = 0;
let failed = 0;

async function describe(name, fn) {
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
  toBeTruthy: () => {
    if (!actual) throw new Error(`Expected truthy, got ${actual}`);
  },
  toBeFalsy: () => {
    if (actual) throw new Error(`Expected falsy, got ${actual}`);
  },
});

function createRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader() {},
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(o) {
      this.body = o;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function loadLoginWithMockPool(mockConn) {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit_test_jwt_secret_min16chars';
  const loginPath = require.resolve('../api/auth/login.js');
  const dbPath = require.resolve('../api/db');
  delete require.cache[loginPath];
  delete require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      getDbConnection: async () => mockConn,
    },
  };
  return require(loginPath);
}

(async () => {
  await describe('loginPassword', async () => {
    await it('detects bcrypt hashes', async () => {
      const h = await bcrypt.hash('x', 4);
      expect(looksLikeBcryptHash(h)).toBeTruthy();
      expect(looksLikeBcryptHash('plaintext')).toBeFalsy();
    });

    await it('verifies bcrypt password', async () => {
      const h = await bcrypt.hash('mypass123', 4);
      const r = await verifyPasswordWithOptionalRehash('mypass123', h);
      if (!r.ok || r.rehash) throw new Error('expected bcrypt ok, no rehash');
    });

    await it('legacy plaintext yields rehash', async () => {
      const r = await verifyPasswordWithOptionalRehash('plain', 'plain');
      if (!r.ok || !r.rehash) throw new Error('expected legacy ok + rehash');
      if (!looksLikeBcryptHash(r.rehash)) throw new Error('rehash should be bcrypt');
    });

    await it('rejects wrong bcrypt password', async () => {
      const h = await bcrypt.hash('a', 4);
      const r = await verifyPasswordWithOptionalRehash('b', h);
      if (r.ok) throw new Error('expected fail');
    });
  });

  await describe('signupEligibility', async () => {
    await it('normalizes 10-digit US to +1', async () => {
      expect(normalizePhoneE164('5555551234')).toBe('+15555551234');
    });

    await it('normalizes leading-country UK style digits', async () => {
      expect(normalizePhoneE164('447414845542')).toBe('+447414845542');
    });

    await it('checkPhoneAlreadyRegistered when row exists', async () => {
      const conn = {
        async execute() {
          return [[{ id: 1 }]];
        },
      };
      const t = await checkPhoneAlreadyRegistered(conn, '+447414845542');
      expect(t).toBeTruthy();
    });

    await it('checkPhoneAlreadyRegistered when no row', async () => {
      const conn = {
        async execute() {
          return [[]];
        },
      };
      const t = await checkPhoneAlreadyRegistered(conn, '+447414845542');
      expect(t).toBeFalsy();
    });
  });

  const bcryptUser = {
    id: 42,
    email: 'user@test.com',
    username: 'cooluser',
    name: 'U',
    avatar: null,
    password: null,
    role: 'USER',
    subscription_status: 'inactive',
    subscription_expiry: null,
    subscription_plan: '',
    payment_failed: 0,
    timezone: 'UTC',
  };

  const legacyUser = {
    id: 43,
    email: 'old@test.com',
    username: 'olduser',
    name: 'Old',
    avatar: null,
    password: 'legacyPlain1',
    role: 'USER',
    subscription_status: 'inactive',
    subscription_expiry: null,
    subscription_plan: '',
    payment_failed: 0,
    timezone: 'UTC',
  };

  await describe('login handler (mock DB)', async () => {
    bcryptUser.password = await bcrypt.hash('correctHorse', 4);

    await it('200 + token when logging in with email', async () => {
      const conn = {
        async execute(sql) {
          if (sql.includes('FROM users')) return [[bcryptUser]];
          if (sql.includes('UPDATE users SET last_seen')) return [{ affectedRows: 1 }];
          if (sql.includes('UPDATE users SET timezone')) return [{ affectedRows: 1 }];
          return [[]];
        },
        release() {},
      };
      const login = await loadLoginWithMockPool(conn);
      const res = createRes();
      const req = {
        method: 'POST',
        headers: {
          origin: 'https://auraterminal.ai',
          'x-forwarded-for': `10.0.0.${Date.now() % 200}`,
        },
        body: { email: 'user@test.com', password: 'correctHorse' },
        socket: {},
      };
      await login(req, res);
      if (res.statusCode !== 200) throw new Error(`status ${res.statusCode} ${JSON.stringify(res.body)}`);
      if (!res.body.token || !res.body.success) throw new Error('missing token');
    });

    await it('200 when logging in with username (same user)', async () => {
      const conn = {
        async execute(sql) {
          if (sql.includes('FROM users')) return [[bcryptUser]];
          if (sql.includes('UPDATE users SET last_seen')) return [{ affectedRows: 1 }];
          if (sql.includes('UPDATE users SET timezone')) return [{ affectedRows: 1 }];
          return [[]];
        },
        release() {},
      };
      const login = await loadLoginWithMockPool(conn);
      const res = createRes();
      const req = {
        method: 'POST',
        headers: {
          origin: 'https://auraterminal.ai',
          'x-forwarded-for': `10.0.1.${Date.now() % 200}`,
        },
        body: { email: 'cooluser', password: 'correctHorse' },
        socket: {},
      };
      await login(req, res);
      if (res.statusCode !== 200) throw new Error(`status ${res.statusCode}`);
      if (!res.body.token) throw new Error('missing token');
    });

    await it('404 when no user', async () => {
      const conn = {
        async execute(sql) {
          if (sql.includes('FROM users')) return [[]];
          return [[]];
        },
        release() {},
      };
      const login = await loadLoginWithMockPool(conn);
      const res = createRes();
      const req = {
        method: 'POST',
        headers: {
          origin: 'https://auraterminal.ai',
          'x-forwarded-for': `10.0.2.${Date.now() % 200}`,
        },
        body: { email: 'nobody@test.com', password: 'x' },
        socket: {},
      };
      await login(req, res);
      if (res.statusCode !== 404) throw new Error(`expected 404 got ${res.statusCode}`);
    });

    await it('401 wrong password', async () => {
      const conn = {
        async execute(sql) {
          if (sql.includes('FROM users')) return [[bcryptUser]];
          return [[]];
        },
        release() {},
      };
      const login = await loadLoginWithMockPool(conn);
      const res = createRes();
      const req = {
        method: 'POST',
        headers: {
          origin: 'https://auraterminal.ai',
          'x-forwarded-for': `10.0.3.${Date.now() % 200}`,
        },
        body: { email: 'user@test.com', password: 'wrong' },
        socket: {},
      };
      await login(req, res);
      if (res.statusCode !== 401) throw new Error(`expected 401 got ${res.statusCode}`);
    });

    await it('legacy password triggers rehash update', async () => {
      let sawPasswordUpdate = false;
      const conn = {
        async execute(sql, params) {
          if (sql.includes('FROM users')) return [[legacyUser]];
          if (sql.includes('UPDATE users SET last_seen')) return [{ affectedRows: 1 }];
          if (sql.includes('UPDATE users SET timezone')) return [{ affectedRows: 1 }];
          if (sql.includes('UPDATE users SET password')) {
            sawPasswordUpdate = true;
            if (!params[0] || !looksLikeBcryptHash(params[0])) throw new Error('expected bcrypt in update');
            return [{ affectedRows: 1 }];
          }
          return [[]];
        },
        release() {},
      };
      const login = await loadLoginWithMockPool(conn);
      const res = createRes();
      const req = {
        method: 'POST',
        headers: {
          origin: 'https://auraterminal.ai',
          'x-forwarded-for': `10.0.4.${Date.now() % 200}`,
        },
        body: { login: 'old@test.com', password: 'legacyPlain1' },
        socket: {},
      };
      await login(req, res);
      if (res.statusCode !== 200) throw new Error(`status ${res.statusCode}`);
      if (!sawPasswordUpdate) throw new Error('expected password rehash update');
    });
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

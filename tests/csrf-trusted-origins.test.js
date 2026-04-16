/**
 * CSRF trusted-origin defaults (apex + localhost + Vercel preview rules).
 * Run: node tests/csrf-trusted-origins.test.js
 */

function reloadCsrf() {
  const resolved = require.resolve('../api/utils/csrf');
  delete require.cache[resolved];
  return require('../api/utils/csrf');
}

let passed = 0;
function ok(name) {
  passed++;
  console.log(`  ✅ ${name}`);
}
function fail(name, err) {
  console.log(`  ❌ ${name}: ${err.message}`);
  process.exitCode = 1;
}

try {
  delete process.env.CSRF_TRUSTED_ORIGINS;
  delete process.env.FRONTEND_URL;
  delete process.env.VERCEL_ENV;
  delete process.env.ALLOW_VERCEL_PREVIEW_CSRF;

  const csrf = reloadCsrf();
  const list = csrf.getTrustedOrigins();

  if (!list.includes('https://auraterminal.ai')) fail('apex in defaults', new Error('missing apex'));
  else ok('defaults include https://auraterminal.ai');

  if (!list.includes('https://www.auraterminal.ai')) fail('www in defaults', new Error('missing www'));
  else ok('defaults include https://www.auraterminal.ai');

  if (!csrf.isTrustedOrigin('https://auraterminal.ai')) fail('apex trusted', new Error('apex not trusted'));
  else ok('isTrustedOrigin(https://auraterminal.ai)');

  process.env.VERCEL_ENV = 'production';
  const csrfProd = reloadCsrf();
  if (csrfProd.isTrustedOrigin('https://some-app.vercel.app')) {
    fail('preview blocked in production', new Error('vercel.app should not trust in production'));
  } else ok('*.vercel.app not trusted when VERCEL_ENV=production');

  process.env.VERCEL_ENV = 'preview';
  const csrfPreview = reloadCsrf();
  if (!csrfPreview.isTrustedOrigin('https://aura-branch-abc123.vercel.app')) {
    fail('preview allowed', new Error('vercel.app should trust in preview'));
  } else ok('*.vercel.app trusted when VERCEL_ENV=preview');

  process.env.ALLOW_VERCEL_PREVIEW_CSRF = 'true';
  delete process.env.VERCEL_ENV;
  const csrfFlag = reloadCsrf();
  if (!csrfFlag.isTrustedOrigin('https://x.vercel.app')) {
    fail('ALLOW flag', new Error('vercel.app should trust when ALLOW_VERCEL_PREVIEW_CSRF=true'));
  } else ok('*.vercel.app trusted when ALLOW_VERCEL_PREVIEW_CSRF=true');

  console.log(`\nResults: ${passed} passed`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}

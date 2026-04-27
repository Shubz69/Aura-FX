/**
 * @jest-environment node
 */
const { spawnSync } = require('child_process');
const path = require('path');

describe('i18n locales', () => {
  it('all locale files have identical key paths to English', () => {
    const script = path.join(__dirname, '..', 'scripts', 'verify-i18n-locales.mjs');
    const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    if (r.status !== 0) {
      // eslint-disable-next-line no-console
      console.error(r.stdout || '', r.stderr || '');
    }
    expect(r.status).toBe(0);
  });

  it('strict mode: no unintended English copy in non-English locales', () => {
    const script = path.join(__dirname, '..', 'scripts', 'verify-i18n-locales.mjs');
    const r = spawnSync(process.execPath, [script, '--strict-english'], { encoding: 'utf8' });
    if (r.status !== 0) {
      // eslint-disable-next-line no-console
      console.error(r.stdout || '', r.stderr || '');
    }
    expect(r.status).toBe(0);
  });
});

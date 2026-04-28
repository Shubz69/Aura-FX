/**
 * @jest-environment node
 */
const { spawnSync } = require('child_process');
const path = require('path');

describe('i18n static English audit', () => {
  it('fails if non-exempt English remains for hi/es', () => {
    const script = path.join(__dirname, '..', 'scripts', 'audit-static-english.mjs');
    const r = spawnSync(process.execPath, [script, '--langs=hi,es'], { encoding: 'utf8' });
    if (r.status !== 0) {
      // eslint-disable-next-line no-console
      console.error(r.stdout || '', r.stderr || '');
    }
    expect(r.status).toBe(0);
  });
});

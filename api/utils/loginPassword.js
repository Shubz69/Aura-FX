const bcrypt = require('bcrypt');

function looksLikeBcryptHash(stored) {
  const s = String(stored || '');
  return s.length >= 59 && /^\$2[aby]?\$\d{2}\$/.test(s);
}

/**
 * Verify password; supports bcrypt and legacy plaintext (rehash to bcrypt on success).
 */
async function verifyPasswordWithOptionalRehash(plain, stored) {
  const s = String(stored || '');
  if (!s) return { ok: false, rehash: null };
  if (looksLikeBcryptHash(s)) {
    try {
      const ok = await bcrypt.compare(plain, s);
      return { ok, rehash: null };
    } catch (e) {
      console.warn('bcrypt.compare failed:', e.message);
      return { ok: false, rehash: null };
    }
  }
  const ok = plain === s;
  if (!ok) return { ok: false, rehash: null };
  const rehash = await bcrypt.hash(plain, 10);
  return { ok: true, rehash };
}

module.exports = {
  looksLikeBcryptHash,
  verifyPasswordWithOptionalRehash,
};

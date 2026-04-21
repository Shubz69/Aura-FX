/**
 * Production-only: POST ensure-admin, POST thread message (admin), GET messages (user).
 * Reads tokens from Playwright storage states.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
const ADMIN_STATE = path.join(root, 'e2e/reports/auraterminal-admin.json');
const USER_STATE = path.join(root, 'e2e/reports/auraterminal-normal-user.json');
const OUT = path.join(root, 'e2e/reports/post-deploy-thread-api-verify.json');

function tokenFromState(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const origin = (raw?.origins || []).find((o) => o.origin === BASE) || (raw?.origins || [])[0];
  const entry = (origin?.localStorage || []).find((x) => x.name === 'token');
  return entry?.value || '';
}

function userIdFromState(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const origin = (raw?.origins || []).find((o) => o.origin === BASE) || (raw?.origins || [])[0];
  const entry = (origin?.localStorage || []).find((x) => x.name === 'user');
  if (!entry?.value) return null;
  try {
    const u = JSON.parse(entry.value);
    return u?.id != null ? Number(u.id) : null;
  } catch {
    return null;
  }
}

async function main() {
  if (!fs.existsSync(ADMIN_STATE)) throw new Error(`Missing ${ADMIN_STATE}`);
  if (!fs.existsSync(USER_STATE)) throw new Error(`Missing ${USER_STATE}`);
  const adminToken = tokenFromState(ADMIN_STATE);
  const userToken = tokenFromState(USER_STATE);
  const targetUserId = userIdFromState(USER_STATE);
  if (!adminToken || !userToken || !targetUserId) {
    throw new Error('Could not read admin/user token or user id from storage states');
  }

  const api = (p) => `${BASE}${p.startsWith('/') ? p : `/${p}`}`;

  const ensureRes = await fetch(api('/api/messages/threads/ensure-admin'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId: targetUserId }),
  });
  const ensureJson = await ensureRes.json().catch(() => ({}));
  const threadId = ensureJson?.thread?.id;
  const ensureOk = ensureRes.ok && threadId;

  const marker = `POST_DEPLOY_API_${Date.now()}`;
  let postStatus = null;
  let postOk = false;
  let getStatus = null;
  let getOk = false;
  let foundMarker = false;

  if (threadId) {
    const postRes = await fetch(api(`/api/messages/threads/${threadId}/messages`), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: marker }),
    });
    postStatus = postRes.status;
    const postJson = await postRes.json().catch(() => ({}));
    postOk = postRes.ok && (postJson?.success === true || postJson?.created);

    const getRes = await fetch(api(`/api/messages/threads/${threadId}/messages?limit=50`), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Cache-Control': 'no-cache',
      },
    });
    getStatus = getRes.status;
    const getJson = await getRes.json().catch(() => ({}));
    const rows = Array.isArray(getJson?.messages) ? getJson.messages : [];
    foundMarker = rows.some((m) => String(m?.body || '') === marker);
    getOk = getRes.ok && foundMarker;
  }

  const out = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    ensureAdmin: { ok: ensureOk, status: ensureRes.status, threadId: threadId || null },
    postThreadMessage: { ok: postOk, status: postStatus, threadId: threadId || null },
    getThreadMessages: { ok: getOk, status: getStatus, foundSentBody: foundMarker },
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log(JSON.stringify(out, null, 2));
  if (!ensureOk || !postOk || !getOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

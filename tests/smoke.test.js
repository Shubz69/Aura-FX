// Minimal integration smoke test for threads and channels
const axios = require('axios');
const io = require('socket.io-client');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:8080';

function makeMockToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `${header}.${body}.sig`;
}

(async () => {
  try {
    // Create mock admin/user tokens
    const adminToken = makeMockToken({ sub: 'ADMIN', role: 'ADMIN', email: 'admin@example.com' });
    const userToken = makeMockToken({ sub: '2', role: 'USER', email: 'user@example.com' });

    // Ensure user thread
    const threadResp = await axios.post(`${BASE}/api/threads/ensure`, {}, { headers: { Authorization: `Bearer ${userToken}` } });
    const threadId = threadResp.data.thread.id;

    // Connect sockets
    const adminSock = io(BASE, { auth: { userId: 'ADMIN', role: 'ADMIN' }, transports: ['websocket'] });
    const userSock = io(BASE, { auth: { userId: '2', role: 'USER' }, transports: ['websocket'] });

    await new Promise(r => adminSock.on('connect', r));
    await new Promise(r => userSock.on('connect', r));

    adminSock.emit('thread:join', { threadId });
    userSock.emit('thread:join', { threadId });

    const messagePromise = new Promise(resolve => {
      adminSock.on('thread:new_message', ({ message }) => resolve(message));
    });

    // User sends message
    await axios.post(`${BASE}/api/threads/${threadId}/messages`, { body: 'hello from test' }, { headers: { Authorization: `Bearer ${userToken}` } });
    const received = await Promise.race([
      messagePromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout waiting for message')), 5000))
    ]);

    if (!received || received.body !== 'hello from test') throw new Error('Message mismatch');

    // Channel send/receive
    adminSock.emit('channel:join', { channelId: 'general' });
    const chanPromise = new Promise(resolve => {
      adminSock.on('channel:new_message', ({ message }) => resolve(message));
    });
    await axios.post(`${BASE}/api/channels/general/messages`, { body: 'hello channel' }, { headers: { Authorization: `Bearer ${userToken}` } });
    const chanMsg = await Promise.race([
      chanPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout waiting for channel message')), 5000))
    ]);
    if (!chanMsg || chanMsg.body !== 'hello channel') throw new Error('Channel message mismatch');

    console.log('Smoke test passed.');
    process.exit(0);
  } catch (e) {
    console.error('Smoke test failed:', e);
    process.exit(1);
  }
})();



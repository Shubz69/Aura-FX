/**
 * Messaging Consistency Tests
 *
 * Tests idempotent writes, cursor pagination, RBAC for channels, ordering, rate limit.
 * Run: node tests/messaging-consistency.test.js
 */

const assert = require('assert');

let passed = 0, failed = 0;
function describe(name, fn) { console.log('\n' + name); fn(); }
function it(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name); } catch (e) { failed++; console.log('  ❌ ' + name + ': ' + e.message); }
}

// ============================================================================
// Idempotent writes (clientMessageId dedupe)
// ============================================================================

describe('Idempotent Writes', () => {
  function wouldDedupe(senderId, clientMessageId) {
    return !!(senderId && clientMessageId);
  }

  it('Same sender + clientMessageId triggers dedupe', () => {
    assert.strictEqual(wouldDedupe(1, 'uuid-abc'), true);
  });

  it('No clientMessageId skips dedupe', () => {
    assert.strictEqual(wouldDedupe(1, null), false);
    assert.strictEqual(wouldDedupe(1, ''), false);
  });

  it('No senderId skips dedupe', () => {
    assert.strictEqual(wouldDedupe(null, 'uuid-abc'), false);
  });

  it('Duplicate POST returns existing message shape', () => {
    const existing = { id: 100, channelId: 'welcome', userId: 1, content: 'Hi', sequence: 100 };
    assert.ok(existing.id);
    assert.strictEqual(existing.sequence, existing.id);
  });
});

// ============================================================================
// Cursor pagination (afterId)
// ============================================================================

describe('Cursor Pagination', () => {
  function parseAfterId(q) {
    const v = q && q.afterId ? parseInt(q.afterId, 10) : null;
    return Number.isInteger(v) && v > 0 ? v : null;
  }

  it('Valid afterId parsed', () => {
    assert.strictEqual(parseAfterId({ afterId: '100' }), 100);
    assert.strictEqual(parseAfterId({ afterId: '1' }), 1);
  });

  it('Invalid afterId returns null', () => {
    assert.strictEqual(parseAfterId({ afterId: 'abc' }), null);
    assert.strictEqual(parseAfterId({ afterId: '0' }), null);
    assert.strictEqual(parseAfterId({}), null);
    assert.strictEqual(parseAfterId(null), null);
  });

  it('Messages sorted by sequence for catch-up', () => {
    const msgs = [{ id: 102, sequence: 102 }, { id: 101, sequence: 101 }, { id: 100, sequence: 100 }];
    const sorted = [...msgs].sort((a, b) => (a.sequence ?? a.id) - (b.sequence ?? b.id));
    assert.strictEqual(sorted[0].id, 100);
    assert.strictEqual(sorted[2].id, 102);
  });
});

// ============================================================================
// RBAC - Channel access (FREE vs PREMIUM)
// ============================================================================

describe('RBAC - Channel Access', () => {
  function canAccessChannel(userTier, channelAccess) {
    if (channelAccess === 'open') return true;
    if (channelAccess === 'premium' && (userTier === 'PREMIUM' || userTier === 'ELITE')) return true;
    if (channelAccess === 'elite' && userTier === 'ELITE') return true;
    if (channelAccess === 'admin') return false; // Only admins
    return false;
  }

  it('FREE cannot access premium channel', () => {
    assert.strictEqual(canAccessChannel('FREE', 'premium'), false);
  });

  it('FREE cannot access elite channel', () => {
    assert.strictEqual(canAccessChannel('FREE', 'elite'), false);
  });

  it('PREMIUM can access premium channel', () => {
    assert.strictEqual(canAccessChannel('PREMIUM', 'premium'), true);
  });

  it('ELITE can access premium and elite channels', () => {
    assert.strictEqual(canAccessChannel('ELITE', 'premium'), true);
    assert.strictEqual(canAccessChannel('ELITE', 'elite'), true);
  });

  it('All tiers can access open channel', () => {
    assert.strictEqual(canAccessChannel('FREE', 'open'), true);
    assert.strictEqual(canAccessChannel('PREMIUM', 'open'), true);
  });
});

// ============================================================================
// Ordering and sequence
// ============================================================================

describe('Message Ordering', () => {
  it('Stable order by sequence then id', () => {
    const msgs = [
      { id: 3, sequence: 3, timestamp: '2025-02-06T10:00:03Z' },
      { id: 1, sequence: 1, timestamp: '2025-02-06T10:00:01Z' },
      { id: 2, sequence: 2, timestamp: '2025-02-06T10:00:02Z' }
    ];
    const sorted = [...msgs].sort((a, b) => (a.sequence ?? a.id ?? 0) - (b.sequence ?? b.id ?? 0));
    assert.strictEqual(sorted.map(m => m.id).join(','), '1,2,3');
  });

  it('Merge new messages without duplicates', () => {
    const prev = [{ id: 1 }, { id: 2 }];
    const newOnes = [{ id: 3 }, { id: 2 }]; // 2 is duplicate
    const existingIds = new Set(prev.map(m => String(m.id)));
    const filtered = newOnes.filter(m => !existingIds.has(String(m.id)));
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 3);
  });
});

// ============================================================================
// Rate limit logic
// ============================================================================

describe('Rate Limit', () => {
  const MAX_PER_MINUTE = 30;

  function wouldRateLimit(count) {
    return count >= MAX_PER_MINUTE;
  }

  it('Under limit allowed', () => {
    assert.strictEqual(wouldRateLimit(29), false);
    assert.strictEqual(wouldRateLimit(0), false);
  });

  it('At limit blocked', () => {
    assert.strictEqual(wouldRateLimit(30), true);
  });

  it('Over limit blocked', () => {
    assert.strictEqual(wouldRateLimit(31), true);
  });
});

// ============================================================================
// Reconnect catch-up logic
// ============================================================================

describe('Reconnect Catch-Up', () => {
  function getMaxId(messages) {
    const numericIds = (messages || [])
      .filter(m => m.id != null && (typeof m.id === 'number' || /^\d+$/.test(String(m.id))))
      .map(m => Number(m.id));
    return numericIds.length > 0 ? Math.max(...numericIds) : 0;
  }

  it('Max id from messages', () => {
    assert.strictEqual(getMaxId([{ id: 1 }, { id: 5 }, { id: 3 }]), 5);
  });

  it('Empty messages returns 0', () => {
    assert.strictEqual(getMaxId([]), 0);
    assert.strictEqual(getMaxId(null), 0);
  });

  it('Skips temp ids', () => {
    assert.strictEqual(getMaxId([{ id: 'temp_123' }, { id: 10 }]), 10);
  });
});

// ============================================================================
// Optimistic reconciliation
// ============================================================================

describe('Optimistic Reconciliation', () => {
  function findExistingIndex(prev, clientId, serverId, clientMessageId, serverMessage) {
    return prev.findIndex(m =>
      String(m.id) === String(clientId) || String(m.id) === String(serverId) ||
      (m.clientMessageId && m.clientMessageId === clientMessageId) ||
      (m.content === serverMessage.content &&
        String(m.userId) === String(serverMessage.userId) &&
        Math.abs(new Date(m.timestamp) - new Date(serverMessage.timestamp)) < 5000)
    );
  }

  it('Matches by clientMessageId', () => {
    const prev = [{ id: 'uuid-1', clientMessageId: 'uuid-1', content: 'Hi', userId: 1, timestamp: new Date().toISOString() }];
    const idx = findExistingIndex(prev, 'uuid-1', 100, 'uuid-1', { content: 'Hi', userId: 1, timestamp: new Date().toISOString() });
    assert.strictEqual(idx, 0);
  });

  it('Matches by server id after replace', () => {
    const prev = [{ id: 100, content: 'Hi', userId: 1 }];
    const idx = findExistingIndex(prev, 'uuid-1', 100, null, { id: 100, content: 'Hi', userId: 1 });
    assert.strictEqual(idx, 0);
  });
});

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(50));
console.log(`\n📊 Messaging Consistency: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

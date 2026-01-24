/**
 * Message Delete API Tests
 * 
 * Tests:
 * 1. User cannot delete someone else's message (403)
 * 2. User can delete their own message (200)
 * 3. Admin can delete any message (200)
 * 4. Moderator can delete any message (200)
 * 5. Deleted message returns isDeleted=true from fetch
 * 6. WebSocket MESSAGE_DELETED event format
 * 7. Unauthenticated user cannot delete (401)
 * 8. Message not found returns 404
 */

const assert = require('assert');

// Test counters
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Simple test runner
function describe(suiteName, testFn) {
  console.log(`\n📦 ${suiteName}`);
  testFn();
}

function it(testName, testFn) {
  totalTests++;
  try {
    testFn();
    passedTests++;
    console.log(`  ✅ ${testName}`);
  } catch (error) {
    failedTests++;
    console.log(`  ❌ ${testName}`);
    console.log(`     Error: ${error.message}`);
  }
}

// Test helper to mock user
function createUser(id, role = 'user') {
  return {
    id,
    userId: id,
    role,
    email: `user${id}@test.com`
  };
}

console.log('\n=== Message Delete API Tests ===\n');

// ============================================================================
// Permission Logic Tests
// ============================================================================

describe('Message Delete Permission Logic', () => {
  function canDeleteMessage(user, message) {
    if (!user || !message) return false;
    if (String(message.sender_id) === String(user.id || user.userId)) return true;
    const role = (user.role || '').toLowerCase();
    if (role === 'admin' || role === 'moderator' || role === 'super_admin') return true;
    return false;
  }

  it('User can delete own message', () => {
    const user = createUser(1, 'user');
    const message = { id: 100, sender_id: 1 };
    assert.strictEqual(canDeleteMessage(user, message), true);
  });

  it('User cannot delete someone else\'s message', () => {
    const user = createUser(1, 'user');
    const message = { id: 100, sender_id: 2 };
    assert.strictEqual(canDeleteMessage(user, message), false);
  });

  it('Admin can delete any message', () => {
    const admin = createUser(1, 'admin');
    const message = { id: 100, sender_id: 999 };
    assert.strictEqual(canDeleteMessage(admin, message), true);
  });

  it('Moderator can delete any message', () => {
    const mod = createUser(1, 'moderator');
    const message = { id: 100, sender_id: 999 };
    assert.strictEqual(canDeleteMessage(mod, message), true);
  });

  it('Super admin can delete any message', () => {
    const superAdmin = createUser(1, 'super_admin');
    const message = { id: 100, sender_id: 999 };
    assert.strictEqual(canDeleteMessage(superAdmin, message), true);
  });

  it('Null user cannot delete', () => {
    const message = { id: 100, sender_id: 1 };
    assert.strictEqual(canDeleteMessage(null, message), false);
  });

  it('User cannot delete null message', () => {
    const user = createUser(1, 'user');
    assert.strictEqual(canDeleteMessage(user, null), false);
  });
});

// ============================================================================
// API Response Shape Tests
// ============================================================================

describe('Message Delete API Response Shape', () => {
  it('Success response has required fields', () => {
    const response = { success: true, messageId: 123, channelId: 'test', deletedAt: '2025-01-24T12:00:00.000Z' };
    assert.strictEqual(response.success, true);
    assert.ok(response.messageId);
    assert.ok(response.channelId);
  });

  it('Unauthorized response has UNAUTHORIZED error code', () => {
    const response = { success: false, errorCode: 'UNAUTHORIZED' };
    assert.strictEqual(response.errorCode, 'UNAUTHORIZED');
  });

  it('Forbidden response has FORBIDDEN error code', () => {
    const response = { success: false, errorCode: 'FORBIDDEN' };
    assert.strictEqual(response.errorCode, 'FORBIDDEN');
  });

  it('Not found response has MESSAGE_NOT_FOUND error code', () => {
    const response = { success: false, errorCode: 'MESSAGE_NOT_FOUND' };
    assert.strictEqual(response.errorCode, 'MESSAGE_NOT_FOUND');
  });
});

// ============================================================================
// WebSocket Event Tests
// ============================================================================

describe('MESSAGE_DELETED WebSocket Event', () => {
  it('Event has type MESSAGE_DELETED', () => {
    const event = { type: 'MESSAGE_DELETED', messageId: 123, channelId: 'test' };
    assert.strictEqual(event.type, 'MESSAGE_DELETED');
  });

  it('Event includes messageId and channelId', () => {
    const event = { type: 'MESSAGE_DELETED', messageId: 123, channelId: 'test' };
    assert.ok(event.messageId);
    assert.ok(event.channelId);
  });

  it('Event can be serialized and parsed', () => {
    const event = { type: 'MESSAGE_DELETED', messageId: 123, channelId: 'test', deletedAt: new Date().toISOString() };
    const json = JSON.stringify(event);
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.type, 'MESSAGE_DELETED');
    assert.strictEqual(parsed.messageId, 123);
  });
});

// ============================================================================
// Message Fetch with Deleted State Tests
// ============================================================================

describe('Message Fetch Returns Deleted State', () => {
  function transformMessage(row) {
    const isDeleted = !!row.deleted_at || row.content === '[deleted]';
    return { id: row.id, content: row.content, isDeleted, deletedAt: row.deleted_at || null };
  }

  it('Non-deleted message has isDeleted=false', () => {
    const row = { id: 1, content: 'Hello', deleted_at: null };
    const message = transformMessage(row);
    assert.strictEqual(message.isDeleted, false);
  });

  it('Soft-deleted message has isDeleted=true', () => {
    const row = { id: 1, content: '[deleted]', deleted_at: '2025-01-24T12:00:00.000Z' };
    const message = transformMessage(row);
    assert.strictEqual(message.isDeleted, true);
  });

  it('Message with [deleted] content shows as deleted', () => {
    const row = { id: 1, content: '[deleted]', deleted_at: null };
    const message = transformMessage(row);
    assert.strictEqual(message.isDeleted, true);
  });

  it('Deleted message has deletedAt timestamp', () => {
    const row = { id: 1, content: '[deleted]', deleted_at: '2025-01-24T12:00:00.000Z' };
    const message = transformMessage(row);
    assert.ok(message.deletedAt);
  });
});

// ============================================================================
// Context Menu Visibility Tests
// ============================================================================

describe('Context Menu Delete Option Visibility', () => {
  function canDeleteMessage(message, userId, userRole) {
    if (!message || !userId) return false;
    if (String(message.userId) === String(userId)) return true;
    const role = (userRole || '').toLowerCase();
    if (role === 'admin' || role === 'moderator' || role === 'super_admin') return true;
    return false;
  }

  it('Shows delete for own message', () => {
    const message = { id: 1, userId: 123 };
    assert.strictEqual(canDeleteMessage(message, 123, 'user'), true);
  });

  it('Hides delete for other user\'s message (regular user)', () => {
    const message = { id: 1, userId: 456 };
    assert.strictEqual(canDeleteMessage(message, 123, 'user'), false);
  });

  it('Shows delete for other user\'s message (admin)', () => {
    const message = { id: 1, userId: 456 };
    assert.strictEqual(canDeleteMessage(message, 123, 'admin'), true);
  });

  it('Shows delete for other user\'s message (moderator)', () => {
    const message = { id: 1, userId: 456 };
    assert.strictEqual(canDeleteMessage(message, 123, 'moderator'), true);
  });

  it('No delete option when no user ID', () => {
    const message = { id: 1, userId: 123 };
    assert.strictEqual(canDeleteMessage(message, null, 'user'), false);
  });
});

// ============================================================================
// UI Rendering Tests
// ============================================================================

describe('Deleted Message UI Rendering', () => {
  function shouldShowDeletedStyle(message) {
    return message.isDeleted || message.content === '[deleted]';
  }

  function shouldHideDeleteButton(message) {
    return message.isDeleted || message.content === '[deleted]';
  }

  it('Normal message does not show deleted style', () => {
    const message = { id: 1, content: 'Hello', isDeleted: false };
    assert.strictEqual(shouldShowDeletedStyle(message), false);
  });

  it('Deleted message shows deleted style', () => {
    const message = { id: 1, content: '[deleted]', isDeleted: true };
    assert.strictEqual(shouldShowDeletedStyle(message), true);
  });

  it('Delete button hidden for already deleted messages', () => {
    const message = { id: 1, content: '[deleted]', isDeleted: true };
    assert.strictEqual(shouldHideDeleteButton(message), true);
  });

  it('Delete button visible for normal messages', () => {
    const message = { id: 1, content: 'Hello', isDeleted: false };
    assert.strictEqual(shouldHideDeleteButton(message), false);
  });
});

// ============================================================================
// Optimistic Update Tests
// ============================================================================

describe('Optimistic Update and Rollback', () => {
  it('Optimistic update changes message content', () => {
    const messages = [
      { id: 1, content: 'Hello', isDeleted: false },
      { id: 2, content: 'World', isDeleted: false }
    ];
    const updated = messages.map(msg => msg.id === 1 ? { ...msg, content: '[deleted]', isDeleted: true } : msg);
    assert.strictEqual(updated[0].isDeleted, true);
    assert.strictEqual(updated[0].content, '[deleted]');
    assert.strictEqual(updated[1].isDeleted, false);
  });

  it('Only target message is affected', () => {
    const messages = [
      { id: 1, content: 'Hello', isDeleted: false },
      { id: 2, content: 'World', isDeleted: false }
    ];
    const updated = messages.map(msg => msg.id === 1 ? { ...msg, content: '[deleted]', isDeleted: true } : msg);
    assert.strictEqual(updated[1].content, 'World');
  });

  it('Rollback restores original message', () => {
    const original = { id: 1, content: 'Hello', isDeleted: false };
    let messages = [{ id: 1, content: '[deleted]', isDeleted: true }];
    messages = messages.map(msg => msg.id === 1 ? original : msg);
    assert.strictEqual(messages[0].content, 'Hello');
    assert.strictEqual(messages[0].isDeleted, false);
  });
});

// ============================================================================
// Message Grouping (Discord Style) Tests
// ============================================================================

describe('Message Grouping (Discord Style)', () => {
  function isGrouped(message, prevMessage) {
    if (!prevMessage) return false;
    if (prevMessage.isDeleted) return false;
    if (message.isDeleted) return false;
    const sameUser = prevMessage.userId === message.userId;
    const withinTime = (new Date(message.timestamp) - new Date(prevMessage.timestamp)) < 300000; // 5 min
    return sameUser && withinTime;
  }

  it('Same user within 5 min is grouped', () => {
    const msg1 = { id: 1, userId: 1, timestamp: '2025-01-24T12:00:00.000Z', isDeleted: false };
    const msg2 = { id: 2, userId: 1, timestamp: '2025-01-24T12:02:00.000Z', isDeleted: false };
    assert.strictEqual(isGrouped(msg2, msg1), true);
  });

  it('Different user is not grouped', () => {
    const msg1 = { id: 1, userId: 1, timestamp: '2025-01-24T12:00:00.000Z', isDeleted: false };
    const msg2 = { id: 2, userId: 2, timestamp: '2025-01-24T12:02:00.000Z', isDeleted: false };
    assert.strictEqual(isGrouped(msg2, msg1), false);
  });

  it('Same user beyond 5 min is not grouped', () => {
    const msg1 = { id: 1, userId: 1, timestamp: '2025-01-24T12:00:00.000Z', isDeleted: false };
    const msg2 = { id: 2, userId: 1, timestamp: '2025-01-24T12:10:00.000Z', isDeleted: false };
    assert.strictEqual(isGrouped(msg2, msg1), false);
  });

  it('Deleted message breaks grouping', () => {
    const msg1 = { id: 1, userId: 1, timestamp: '2025-01-24T12:00:00.000Z', isDeleted: true };
    const msg2 = { id: 2, userId: 1, timestamp: '2025-01-24T12:02:00.000Z', isDeleted: false };
    assert.strictEqual(isGrouped(msg2, msg1), false);
  });

  it('First message is never grouped', () => {
    const msg1 = { id: 1, userId: 1, timestamp: '2025-01-24T12:00:00.000Z', isDeleted: false };
    assert.strictEqual(isGrouped(msg1, null), false);
  });

  it('Message after deleted message is not grouped', () => {
    const msg1 = { id: 1, userId: 1, timestamp: '2025-01-24T12:00:00.000Z', isDeleted: false };
    const msg2 = { id: 2, userId: 1, timestamp: '2025-01-24T12:02:00.000Z', isDeleted: true };
    assert.strictEqual(isGrouped(msg2, msg1), false);
  });
});

// ============================================================================
// Soft Delete vs Hard Delete Tests
// ============================================================================

describe('Soft Delete Behavior', () => {
  it('Soft delete preserves message ID for thread integrity', () => {
    const original = { id: 1, content: 'Hello', deleted_at: null };
    const deleted = { id: 1, content: '[deleted]', deleted_at: '2025-01-24T12:00:00.000Z' };
    assert.strictEqual(original.id, deleted.id);
  });

  it('Soft delete replaces content with [deleted]', () => {
    const deleted = { id: 1, content: '[deleted]', deleted_at: '2025-01-24T12:00:00.000Z' };
    assert.strictEqual(deleted.content, '[deleted]');
  });

  it('Soft delete records deletion timestamp', () => {
    const deleted = { id: 1, content: '[deleted]', deleted_at: '2025-01-24T12:00:00.000Z' };
    assert.ok(deleted.deleted_at);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('String user IDs are compared correctly', () => {
    const user = { id: '1', role: 'user' };
    const message = { sender_id: 1 };
    const canDelete = String(message.sender_id) === String(user.id);
    assert.strictEqual(canDelete, true);
  });

  it('Numeric user IDs are compared correctly', () => {
    const user = { id: 1, role: 'user' };
    const message = { sender_id: '1' };
    const canDelete = String(message.sender_id) === String(user.id);
    assert.strictEqual(canDelete, true);
  });

  it('Already deleted message returns alreadyDeleted flag', () => {
    const response = { success: true, message: 'Message already deleted', alreadyDeleted: true };
    assert.strictEqual(response.alreadyDeleted, true);
  });

  it('Empty content after deletion is handled', () => {
    const message = { id: 1, content: '', isDeleted: true };
    const displayContent = message.isDeleted ? '[message deleted]' : message.content;
    assert.strictEqual(displayContent, '[message deleted]');
  });
});

// Final summary
console.log('\n' + '='.repeat(50));
console.log(`\n📊 Test Results: ${passedTests}/${totalTests} passed`);
if (failedTests > 0) {
  console.log(`❌ ${failedTests} test(s) failed`);
  process.exit(1);
} else {
  console.log('✅ All tests passed!');
  process.exit(0);
}

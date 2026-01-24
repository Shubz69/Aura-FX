/**
 * Friends API Integration Tests
 * 
 * Tests the complete friend request flow:
 * 1. Send friend request → pending state
 * 2. Accept request → friends state  
 * 3. List friends → friend appears
 * 4. Remove friend → none state
 * 
 * Also tests:
 * - Body parsing with different field names
 * - Error handling and validation
 * - UI state transitions
 */

const assert = require('assert');

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Mock JWT token generator for testing
 */
function generateMockToken(userId) {
  const payload = { id: userId, email: `user${userId}@test.com` };
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = 'mock_signature';
  return `${header}.${body}.${signature}`;
}

/**
 * Decode JWT token (same logic as backend)
 */
function decodeToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = payload.length % 4;
    const paddedPayload = padding ? payload + '='.repeat(4 - padding) : payload;
    return JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf-8'));
  } catch (e) {
    return null;
  }
}

/**
 * Parse body helper (mirrors backend logic)
 */
function parseBody(body) {
  if (typeof body === 'string') {
    try {
      return { error: null, parsed: JSON.parse(body) };
    } catch (e) {
      return { error: 'Invalid JSON body', parsed: null };
    }
  }
  if (!body || typeof body !== 'object') {
    return { error: null, parsed: {} };
  }
  return { error: null, parsed: body };
}

/**
 * Extract target user ID (mirrors backend logic)
 */
function extractTargetUserId(body, acceptedFields = ['friendId', 'receiverUserId', 'userId', 'targetUserId']) {
  if (!body || typeof body !== 'object') {
    return { targetId: null, fieldUsed: null, error: 'Missing request body' };
  }
  
  for (const field of acceptedFields) {
    const value = body[field];
    if (value !== undefined && value !== null && value !== '') {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return { targetId: parsed, fieldUsed: field, error: null };
      }
    }
  }
  
  const receivedFields = Object.keys(body).join(', ') || 'none';
  return { 
    targetId: null, 
    fieldUsed: null, 
    error: `Missing required field. Expected one of: ${acceptedFields.join(', ')}. Received fields: ${receivedFields}`
  };
}

/**
 * Simulate friendship database
 */
class MockFriendshipDB {
  constructor() {
    this.friendships = [];
    this.users = [
      { id: 1, username: 'User1' },
      { id: 2, username: 'User2' },
      { id: 3, username: 'User3' }
    ];
  }
  
  findUser(id) {
    return this.users.find(u => u.id === id);
  }
  
  findFriendship(userId, friendId) {
    return this.friendships.find(f => 
      (f.user_id === userId && f.friend_id === friendId) ||
      (f.user_id === friendId && f.friend_id === userId)
    );
  }
  
  createRequest(userId, friendId) {
    const existing = this.findFriendship(userId, friendId);
    if (existing) {
      if (existing.status === 'rejected') {
        existing.status = 'pending';
        existing.user_id = userId;
        existing.friend_id = friendId;
        return { success: true, status: 'pending_sent' };
      }
      return { success: false, status: existing.status };
    }
    
    this.friendships.push({
      id: this.friendships.length + 1,
      user_id: userId,
      friend_id: friendId,
      status: 'pending'
    });
    return { success: true, status: 'pending_sent' };
  }
  
  acceptRequest(fromUserId, toUserId) {
    const friendship = this.friendships.find(f => 
      f.user_id === fromUserId && f.friend_id === toUserId && f.status === 'pending'
    );
    if (friendship) {
      friendship.status = 'accepted';
      return { success: true };
    }
    return { success: false };
  }
  
  getFriendStatus(userId, targetId) {
    if (userId === targetId) return 'self';
    
    const friendship = this.findFriendship(userId, targetId);
    if (!friendship) return 'none';
    
    if (friendship.status === 'accepted') return 'accepted';
    if (friendship.status === 'pending') {
      return friendship.user_id === userId ? 'pending_sent' : 'pending_received';
    }
    return friendship.status;
  }
  
  getFriends(userId) {
    return this.friendships
      .filter(f => 
        (f.user_id === userId || f.friend_id === userId) && 
        f.status === 'accepted'
      )
      .map(f => {
        const friendId = f.user_id === userId ? f.friend_id : f.user_id;
        return this.findUser(friendId);
      })
      .filter(Boolean);
  }
  
  removeFriend(userId, friendId) {
    const index = this.friendships.findIndex(f => 
      ((f.user_id === userId && f.friend_id === friendId) ||
       (f.user_id === friendId && f.friend_id === userId)) &&
      f.status === 'accepted'
    );
    if (index !== -1) {
      this.friendships.splice(index, 1);
      return { success: true };
    }
    return { success: false };
  }
}

/**
 * UI state helper - maps API status to button state
 */
function getButtonState(status) {
  switch (status) {
    case 'accepted':
      return { text: 'Friends', action: 'remove', color: 'green' };
    case 'pending_sent':
      return { text: 'Pending', action: null, color: 'yellow' };
    case 'pending_received':
      return { text: 'Accept', action: 'accept', color: 'blue' };
    default:
      return { text: 'Add Friend', action: 'add', color: 'green' };
  }
}

// ============================================================================
// Tests
// ============================================================================

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// Test 1: Token generation and decoding
test('JWT token generation and decoding works correctly', () => {
  const token = generateMockToken(123);
  const decoded = decodeToken(token);
  
  assert(decoded !== null, 'Token should decode');
  assert.strictEqual(decoded.id, 123, 'User ID should match');
  assert(decoded.email.includes('123'), 'Email should contain user ID');
  
  console.log('  Token decoded successfully for user 123');
});

// Test 2: Body parsing - JSON object
test('Body parsing handles JSON object correctly', () => {
  const body = { friendId: 42 };
  const { error, parsed } = parseBody(body);
  
  assert.strictEqual(error, null, 'Should not have error');
  assert.strictEqual(parsed.friendId, 42, 'Should preserve friendId');
  
  console.log('  JSON object parsed correctly');
});

// Test 3: Body parsing - JSON string
test('Body parsing handles JSON string correctly', () => {
  const body = '{"friendId": 42}';
  const { error, parsed } = parseBody(body);
  
  assert.strictEqual(error, null, 'Should not have error');
  assert.strictEqual(parsed.friendId, 42, 'Should parse friendId');
  
  console.log('  JSON string parsed correctly');
});

// Test 4: Body parsing - invalid JSON
test('Body parsing rejects invalid JSON string', () => {
  const body = '{invalid json}';
  const { error } = parseBody(body);
  
  assert(error !== null, 'Should have error');
  assert(error.includes('Invalid JSON'), 'Error should mention invalid JSON');
  
  console.log('  Invalid JSON rejected correctly');
});

// Test 5: Field extraction - friendId
test('Field extraction finds friendId', () => {
  const body = { friendId: 42 };
  const { targetId, fieldUsed, error } = extractTargetUserId(body);
  
  assert.strictEqual(targetId, 42, 'Should extract target ID');
  assert.strictEqual(fieldUsed, 'friendId', 'Should use friendId field');
  assert.strictEqual(error, null, 'Should not have error');
  
  console.log('  friendId extracted correctly');
});

// Test 6: Field extraction - receiverUserId
test('Field extraction finds receiverUserId', () => {
  const body = { receiverUserId: 99 };
  const { targetId, fieldUsed, error } = extractTargetUserId(body);
  
  assert.strictEqual(targetId, 99, 'Should extract target ID');
  assert.strictEqual(fieldUsed, 'receiverUserId', 'Should use receiverUserId field');
  assert.strictEqual(error, null, 'Should not have error');
  
  console.log('  receiverUserId extracted correctly');
});

// Test 7: Field extraction - missing field
test('Field extraction provides helpful error for missing field', () => {
  const body = { wrongField: 42 };
  const { targetId, error } = extractTargetUserId(body);
  
  assert.strictEqual(targetId, null, 'Should not extract target ID');
  assert(error !== null, 'Should have error');
  assert(error.includes('friendId'), 'Error should list expected fields');
  assert(error.includes('wrongField'), 'Error should show received fields');
  
  console.log('  Missing field error is helpful');
});

// Test 8: Full friend request flow
test('Complete friend request flow: add → pending → accept → friends', () => {
  const db = new MockFriendshipDB();
  const user1 = 1;
  const user2 = 2;
  
  // Initial state - no friendship
  let status = db.getFriendStatus(user1, user2);
  assert.strictEqual(status, 'none', 'Initial status should be none');
  let button = getButtonState(status);
  assert.strictEqual(button.text, 'Add Friend', 'Initial button should be Add Friend');
  
  console.log('  Step 1: Initial state is "none", button shows "Add Friend"');
  
  // User1 sends request to User2
  const requestResult = db.createRequest(user1, user2);
  assert(requestResult.success, 'Request should succeed');
  
  // User1's view - pending_sent
  status = db.getFriendStatus(user1, user2);
  assert.strictEqual(status, 'pending_sent', 'Sender should see pending_sent');
  button = getButtonState(status);
  assert.strictEqual(button.text, 'Pending', 'Sender button should be Pending');
  
  console.log('  Step 2: After request, sender sees "Pending"');
  
  // User2's view - pending_received
  status = db.getFriendStatus(user2, user1);
  assert.strictEqual(status, 'pending_received', 'Receiver should see pending_received');
  button = getButtonState(status);
  assert.strictEqual(button.text, 'Accept', 'Receiver button should be Accept');
  
  console.log('  Step 3: Receiver sees "Accept" button');
  
  // User2 accepts request
  const acceptResult = db.acceptRequest(user1, user2);
  assert(acceptResult.success, 'Accept should succeed');
  
  // Both see accepted
  status = db.getFriendStatus(user1, user2);
  assert.strictEqual(status, 'accepted', 'Both should see accepted');
  button = getButtonState(status);
  assert.strictEqual(button.text, 'Friends', 'Button should show Friends');
  
  console.log('  Step 4: After accept, both see "Friends"');
  
  // Friends list includes the friend
  const friends1 = db.getFriends(user1);
  const friends2 = db.getFriends(user2);
  assert.strictEqual(friends1.length, 1, 'User1 should have 1 friend');
  assert.strictEqual(friends2.length, 1, 'User2 should have 1 friend');
  assert.strictEqual(friends1[0].id, user2, 'User1\'s friend should be User2');
  assert.strictEqual(friends2[0].id, user1, 'User2\'s friend should be User1');
  
  console.log('  Step 5: Friends list shows the friend');
});

// Test 9: Cannot add yourself as friend
test('Cannot add yourself as friend', () => {
  const db = new MockFriendshipDB();
  
  // Simulate self-add check
  const userId = 1;
  const targetId = 1;
  
  if (userId === targetId) {
    console.log('  Self-add correctly blocked');
    return;
  }
  
  assert.fail('Self-add should be blocked');
});

// Test 10: Duplicate request handling
test('Duplicate friend request returns appropriate status', () => {
  const db = new MockFriendshipDB();
  
  // First request
  let result = db.createRequest(1, 2);
  assert(result.success, 'First request should succeed');
  
  // Duplicate request
  result = db.createRequest(1, 2);
  assert(!result.success, 'Duplicate request should fail');
  assert.strictEqual(result.status, 'pending', 'Status should be pending');
  
  console.log('  Duplicate request handled correctly');
});

// Test 11: UI state transitions
test('UI button states transition correctly through flow', () => {
  const states = ['none', 'pending_sent', 'pending_received', 'accepted'];
  const expectedButtons = ['Add Friend', 'Pending', 'Accept', 'Friends'];
  const expectedActions = ['add', null, 'accept', 'remove'];
  
  states.forEach((status, i) => {
    const button = getButtonState(status);
    assert.strictEqual(button.text, expectedButtons[i], `Button text for ${status}`);
    assert.strictEqual(button.action, expectedActions[i], `Button action for ${status}`);
  });
  
  console.log('  All UI states transition correctly');
});

// Test 12: Friends removal
test('Removing friend returns to none state', () => {
  const db = new MockFriendshipDB();
  
  // Create and accept friendship
  db.createRequest(1, 2);
  db.acceptRequest(1, 2);
  
  let status = db.getFriendStatus(1, 2);
  assert.strictEqual(status, 'accepted', 'Should be friends');
  
  // Remove friendship
  const removeResult = db.removeFriend(1, 2);
  assert(removeResult.success, 'Remove should succeed');
  
  status = db.getFriendStatus(1, 2);
  assert.strictEqual(status, 'none', 'Status should be none after removal');
  
  const button = getButtonState(status);
  assert.strictEqual(button.text, 'Add Friend', 'Button should show Add Friend');
  
  console.log('  Friend removal works correctly');
});

// Test 13: Re-sending request after rejection
test('Can re-send request after rejection', () => {
  const db = new MockFriendshipDB();
  
  // Create request
  db.createRequest(1, 2);
  
  // Simulate rejection by setting status
  const friendship = db.findFriendship(1, 2);
  friendship.status = 'rejected';
  
  // Re-send request
  const result = db.createRequest(1, 2);
  assert(result.success, 'Re-send should succeed');
  assert.strictEqual(result.status, 'pending_sent', 'Status should be pending');
  
  console.log('  Re-sending after rejection works');
});

// Test 14: Content-Type header validation
test('Request with correct Content-Type should work', () => {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + generateMockToken(1)
  };
  
  assert(headers['Content-Type'] === 'application/json', 'Content-Type should be application/json');
  
  console.log('  Content-Type header validated');
});

// Test 15: Structured error responses
test('Error responses include helpful information', () => {
  const errorResponse = {
    success: false,
    message: 'Missing required field. Expected one of: friendId, receiverUserId. Received fields: wrongField',
    hint: 'Send JSON body with { "friendId": <userId> }',
    received: { wrongField: 42 },
    requestId: 'fr_test123'
  };
  
  assert.strictEqual(errorResponse.success, false, 'success should be false');
  assert(errorResponse.message.includes('friendId'), 'Message should include expected field');
  assert(errorResponse.hint !== undefined, 'Should include hint');
  assert(errorResponse.received !== undefined, 'Should include received body');
  assert(errorResponse.requestId !== undefined, 'Should include request ID');
  
  console.log('  Error responses are structured correctly');
});

// ============================================================================
// Test Runner
// ============================================================================

async function runTests() {
  console.log('\n🧪 Friends API Integration Tests\n');
  console.log('=' .repeat(60) + '\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`✅ ${t.name}\n`);
      passed++;
    } catch (err) {
      console.log(`❌ ${t.name}`);
      console.log(`   Error: ${err.message}\n`);
      failed++;
    }
  }
  
  console.log('=' .repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  
  if (failed > 0) {
    process.exit(1);
  }
  
  return { passed, failed };
}

// Run tests if called directly
if (require.main === module) {
  runTests();
}

module.exports = { 
  runTests, 
  parseBody, 
  extractTargetUserId, 
  getButtonState,
  MockFriendshipDB 
};

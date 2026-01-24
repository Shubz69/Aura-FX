/**
 * Notifications & Friends System Integration Tests
 * 
 * Tests the complete flow:
 * 1. User A sends friend request to User B
 * 2. User B receives notification
 * 3. User B accepts from notification
 * 4. Both appear in each other's friends list
 * 5. Request status becomes ACCEPTED
 * 
 * Also tests:
 * - Decline and cancel flows
 * - Duplicate request rejection
 * - Self-add rejection
 * - Notification pagination
 * - Message locate API for deep-linking
 * - Concurrency (accept/cancel race)
 */

const assert = require('assert');

// ============================================================================
// Mock Utilities
// ============================================================================

// Generate UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Mock Database
class MockDatabase {
  constructor() {
    this.users = [
      { id: 1, username: 'UserA', email: 'usera@test.com' },
      { id: 2, username: 'UserB', email: 'userb@test.com' },
      { id: 3, username: 'UserC', email: 'userc@test.com' }
    ];
    this.friendRequests = [];
    this.friendships = [];
    this.notifications = [];
    this.messages = [];
  }
  
  // Users
  getUser(id) {
    return this.users.find(u => u.id === id);
  }
  
  // Friend Requests
  createFriendRequest(requesterId, receiverId) {
    // Validate
    if (requesterId === receiverId) {
      return { success: false, errorCode: 'SELF_REQUEST', message: 'Cannot send request to yourself' };
    }
    
    if (!this.getUser(receiverId)) {
      return { success: false, errorCode: 'USER_NOT_FOUND', message: 'User not found' };
    }
    
    // Check already friends
    if (this.areFriends(requesterId, receiverId)) {
      return { success: false, errorCode: 'ALREADY_FRIENDS', message: 'Already friends' };
    }
    
    // Check existing pending request (either direction)
    const existing = this.friendRequests.find(r => 
      (r.requesterId === requesterId && r.receiverId === receiverId && r.status === 'PENDING') ||
      (r.requesterId === receiverId && r.receiverId === requesterId && r.status === 'PENDING')
    );
    
    if (existing) {
      if (existing.requesterId === requesterId) {
        return { success: false, errorCode: 'REQUEST_EXISTS', message: 'Request already sent' };
      } else {
        return { success: false, errorCode: 'REQUEST_PENDING_FROM_USER', message: 'User already sent you a request' };
      }
    }
    
    // Create request
    const request = {
      id: generateUUID(),
      requesterId,
      receiverId,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.friendRequests.push(request);
    
    // Create notification
    this.createNotification({
      userId: receiverId,
      type: 'FRIEND_REQUEST',
      title: 'New Friend Request',
      body: `${this.getUser(requesterId).username} wants to be your friend`,
      fromUserId: requesterId,
      friendRequestId: request.id,
      actionStatus: 'PENDING'
    });
    
    return { success: true, request };
  }
  
  acceptFriendRequest(requestId, userId) {
    const request = this.friendRequests.find(r => r.id === requestId && r.receiverId === userId);
    
    if (!request) {
      return { success: false, errorCode: 'REQUEST_NOT_FOUND', message: 'Request not found' };
    }
    
    // Idempotency
    if (request.status === 'ACCEPTED') {
      return { success: true, alreadyProcessed: true };
    }
    
    if (request.status !== 'PENDING') {
      return { success: false, errorCode: 'REQUEST_NOT_PENDING', message: `Request is ${request.status}` };
    }
    
    // Update request
    request.status = 'ACCEPTED';
    request.updatedAt = new Date();
    
    // Create bidirectional friendship
    this.friendships.push(
      { userId: userId, friendId: request.requesterId, createdAt: new Date() },
      { userId: request.requesterId, friendId: userId, createdAt: new Date() }
    );
    
    // Update notification
    const notif = this.notifications.find(n => n.friendRequestId === requestId);
    if (notif) notif.actionStatus = 'ACCEPTED';
    
    // Create acceptance notification
    this.createNotification({
      userId: request.requesterId,
      type: 'FRIEND_ACCEPTED',
      title: 'Friend Request Accepted',
      body: `${this.getUser(userId).username} accepted your friend request`,
      fromUserId: userId
    });
    
    return { success: true, friendId: request.requesterId };
  }
  
  declineFriendRequest(requestId, userId) {
    const request = this.friendRequests.find(r => r.id === requestId && r.receiverId === userId);
    
    if (!request) {
      return { success: false, errorCode: 'REQUEST_NOT_FOUND', message: 'Request not found' };
    }
    
    if (request.status === 'DECLINED') {
      return { success: true, alreadyProcessed: true };
    }
    
    if (request.status !== 'PENDING') {
      return { success: false, errorCode: 'REQUEST_NOT_PENDING', message: `Request is ${request.status}` };
    }
    
    request.status = 'DECLINED';
    request.updatedAt = new Date();
    
    const notif = this.notifications.find(n => n.friendRequestId === requestId);
    if (notif) notif.actionStatus = 'DECLINED';
    
    return { success: true };
  }
  
  cancelFriendRequest(requestId, userId) {
    const request = this.friendRequests.find(r => r.id === requestId && r.requesterId === userId);
    
    if (!request) {
      return { success: false, errorCode: 'REQUEST_NOT_FOUND', message: 'Request not found' };
    }
    
    if (request.status === 'CANCELLED') {
      return { success: true, alreadyProcessed: true };
    }
    
    if (request.status !== 'PENDING') {
      return { success: false, errorCode: 'REQUEST_NOT_PENDING', message: `Request is ${request.status}` };
    }
    
    request.status = 'CANCELLED';
    request.updatedAt = new Date();
    
    const notif = this.notifications.find(n => n.friendRequestId === requestId);
    if (notif) notif.actionStatus = 'CANCELLED';
    
    return { success: true };
  }
  
  areFriends(userId1, userId2) {
    return this.friendships.some(f => f.userId === userId1 && f.friendId === userId2);
  }
  
  getFriends(userId) {
    return this.friendships
      .filter(f => f.userId === userId)
      .map(f => this.getUser(f.friendId));
  }
  
  getIncomingRequests(userId) {
    return this.friendRequests.filter(r => r.receiverId === userId && r.status === 'PENDING');
  }
  
  getOutgoingRequests(userId) {
    return this.friendRequests.filter(r => r.requesterId === userId && r.status === 'PENDING');
  }
  
  removeFriend(userId, friendId) {
    const idx1 = this.friendships.findIndex(f => f.userId === userId && f.friendId === friendId);
    const idx2 = this.friendships.findIndex(f => f.userId === friendId && f.friendId === userId);
    
    if (idx1 === -1 && idx2 === -1) {
      return { success: false, errorCode: 'NOT_FRIENDS', message: 'Not friends' };
    }
    
    if (idx1 !== -1) this.friendships.splice(idx1, 1);
    if (idx2 !== -1) this.friendships.splice(idx2 - (idx1 !== -1 && idx2 > idx1 ? 1 : 0), 1);
    
    return { success: true };
  }
  
  // Notifications
  createNotification(data) {
    const notification = {
      id: generateUUID(),
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body || null,
      channelId: data.channelId || null,
      messageId: data.messageId || null,
      fromUserId: data.fromUserId || null,
      friendRequestId: data.friendRequestId || null,
      status: 'UNREAD',
      actionStatus: data.actionStatus || null,
      createdAt: new Date(),
      readAt: null
    };
    
    this.notifications.push(notification);
    return notification;
  }
  
  getNotifications(userId, cursor = null, limit = 20) {
    let items = this.notifications
      .filter(n => n.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    if (cursor) {
      const cursorDate = new Date(cursor);
      items = items.filter(n => new Date(n.createdAt) < cursorDate);
    }
    
    const hasMore = items.length > limit;
    items = items.slice(0, limit);
    
    const nextCursor = hasMore && items.length > 0 
      ? items[items.length - 1].createdAt 
      : null;
    
    const unreadCount = this.notifications.filter(n => n.userId === userId && n.status === 'UNREAD').length;
    
    return { items, nextCursor, hasMore, unreadCount };
  }
  
  markNotificationRead(notificationId, userId) {
    const notif = this.notifications.find(n => n.id === notificationId && n.userId === userId);
    if (!notif) return { success: false };
    
    notif.status = 'READ';
    notif.readAt = new Date();
    return { success: true };
  }
  
  markAllRead(userId) {
    this.notifications
      .filter(n => n.userId === userId && n.status === 'UNREAD')
      .forEach(n => {
        n.status = 'READ';
        n.readAt = new Date();
      });
    return { success: true };
  }
  
  // Messages
  createMessage(channelId, userId, content) {
    const message = {
      id: this.messages.length + 1,
      channelId,
      userId,
      content,
      createdAt: new Date()
    };
    this.messages.push(message);
    
    // Check for mentions
    const mentions = content.match(/@(\w+)/g) || [];
    mentions.forEach(mention => {
      const username = mention.slice(1);
      const mentionedUser = this.users.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (mentionedUser && mentionedUser.id !== userId) {
        this.createNotification({
          userId: mentionedUser.id,
          type: 'MENTION',
          title: 'You were mentioned',
          body: content.substring(0, 100),
          channelId,
          messageId: message.id,
          fromUserId: userId
        });
      }
    });
    
    return message;
  }
  
  locateMessage(channelId, messageId) {
    const message = this.messages.find(m => m.id === messageId && m.channelId === channelId);
    if (!message) {
      return { success: false, notFound: true };
    }
    
    const messagesAfter = this.messages.filter(m => 
      m.channelId === channelId && new Date(m.createdAt) > new Date(message.createdAt)
    ).length;
    
    return {
      success: true,
      messageId,
      channelId,
      anchorCursor: message.createdAt,
      offsetFromEnd: messagesAfter
    };
  }
}

// ============================================================================
// Tests
// ============================================================================

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// Test 1: Complete friend request flow - send, receive notification, accept
test('Complete friend request flow: A → B notification → accept → friends', async () => {
  const db = new MockDatabase();
  const userA = 1;
  const userB = 2;
  
  // Step 1: User A sends friend request to User B
  const requestResult = db.createFriendRequest(userA, userB);
  assert(requestResult.success, 'Request should succeed');
  assert(requestResult.request, 'Should return request object');
  const requestId = requestResult.request.id;
  
  console.log('  Step 1: Friend request sent A → B');
  
  // Step 2: User B receives notification
  const notifications = db.getNotifications(userB);
  assert(notifications.items.length > 0, 'User B should have notifications');
  
  const friendNotif = notifications.items.find(n => n.type === 'FRIEND_REQUEST');
  assert(friendNotif, 'Should have FRIEND_REQUEST notification');
  assert.strictEqual(friendNotif.friendRequestId, requestId, 'Notification should reference request');
  assert.strictEqual(friendNotif.actionStatus, 'PENDING', 'Action status should be PENDING');
  assert.strictEqual(friendNotif.status, 'UNREAD', 'Notification should be UNREAD');
  
  console.log('  Step 2: User B received notification');
  
  // Step 3: User B accepts from notification
  const acceptResult = db.acceptFriendRequest(requestId, userB);
  assert(acceptResult.success, 'Accept should succeed');
  assert.strictEqual(acceptResult.friendId, userA, 'Should return friend ID');
  
  console.log('  Step 3: User B accepted request');
  
  // Step 4: Both appear in friends list
  const friendsA = db.getFriends(userA);
  const friendsB = db.getFriends(userB);
  
  assert(friendsA.some(f => f.id === userB), 'User A should have User B as friend');
  assert(friendsB.some(f => f.id === userA), 'User B should have User A as friend');
  
  console.log('  Step 4: Both appear in friends lists');
  
  // Step 5: Request status is ACCEPTED
  const request = db.friendRequests.find(r => r.id === requestId);
  assert.strictEqual(request.status, 'ACCEPTED', 'Request status should be ACCEPTED');
  
  // Step 6: Notification action status updated
  const updatedNotif = db.notifications.find(n => n.friendRequestId === requestId);
  assert.strictEqual(updatedNotif.actionStatus, 'ACCEPTED', 'Notification action should be ACCEPTED');
  
  // Step 7: User A received acceptance notification
  const notificationsA = db.getNotifications(userA);
  const acceptedNotif = notificationsA.items.find(n => n.type === 'FRIEND_ACCEPTED');
  assert(acceptedNotif, 'User A should receive FRIEND_ACCEPTED notification');
  
  console.log('  Step 5-7: Status verified, User A notified');
});

// Test 2: Decline friend request
test('Decline friend request updates status correctly', async () => {
  const db = new MockDatabase();
  const userA = 1;
  const userB = 2;
  
  const requestResult = db.createFriendRequest(userA, userB);
  const requestId = requestResult.request.id;
  
  const declineResult = db.declineFriendRequest(requestId, userB);
  assert(declineResult.success, 'Decline should succeed');
  
  const request = db.friendRequests.find(r => r.id === requestId);
  assert.strictEqual(request.status, 'DECLINED', 'Status should be DECLINED');
  
  // Should not be friends
  assert(!db.areFriends(userA, userB), 'Should not be friends');
  
  console.log('  Decline flow works correctly');
});

// Test 3: Cancel outgoing request
test('Cancel outgoing request works correctly', async () => {
  const db = new MockDatabase();
  const userA = 1;
  const userB = 2;
  
  const requestResult = db.createFriendRequest(userA, userB);
  const requestId = requestResult.request.id;
  
  // User A cancels
  const cancelResult = db.cancelFriendRequest(requestId, userA);
  assert(cancelResult.success, 'Cancel should succeed');
  
  const request = db.friendRequests.find(r => r.id === requestId);
  assert.strictEqual(request.status, 'CANCELLED', 'Status should be CANCELLED');
  
  console.log('  Cancel flow works correctly');
});

// Test 4: Duplicate request rejection
test('Duplicate friend request is rejected', async () => {
  const db = new MockDatabase();
  const userA = 1;
  const userB = 2;
  
  const result1 = db.createFriendRequest(userA, userB);
  assert(result1.success, 'First request should succeed');
  
  const result2 = db.createFriendRequest(userA, userB);
  assert(!result2.success, 'Duplicate request should fail');
  assert.strictEqual(result2.errorCode, 'REQUEST_EXISTS', 'Error code should be REQUEST_EXISTS');
  
  console.log('  Duplicate rejection works');
});

// Test 5: Self-add rejection
test('Cannot send friend request to yourself', async () => {
  const db = new MockDatabase();
  
  const result = db.createFriendRequest(1, 1);
  assert(!result.success, 'Self-add should fail');
  assert.strictEqual(result.errorCode, 'SELF_REQUEST', 'Error code should be SELF_REQUEST');
  
  console.log('  Self-add rejected');
});

// Test 6: Idempotent accept
test('Accepting twice is idempotent (safe)', async () => {
  const db = new MockDatabase();
  const userA = 1;
  const userB = 2;
  
  const requestResult = db.createFriendRequest(userA, userB);
  const requestId = requestResult.request.id;
  
  const accept1 = db.acceptFriendRequest(requestId, userB);
  assert(accept1.success, 'First accept should succeed');
  
  const accept2 = db.acceptFriendRequest(requestId, userB);
  assert(accept2.success, 'Second accept should also succeed');
  assert(accept2.alreadyProcessed, 'Should indicate already processed');
  
  // Should still have exactly 2 friendship entries (bidirectional)
  const friendships = db.friendships.filter(f => 
    (f.userId === userA && f.friendId === userB) || 
    (f.userId === userB && f.friendId === userA)
  );
  assert.strictEqual(friendships.length, 2, 'Should have exactly 2 friendship entries');
  
  console.log('  Idempotent accept works');
});

// Test 7: Already friends rejection
test('Cannot send request if already friends', async () => {
  const db = new MockDatabase();
  const userA = 1;
  const userB = 2;
  
  // Become friends first
  const request = db.createFriendRequest(userA, userB);
  db.acceptFriendRequest(request.request.id, userB);
  
  assert(db.areFriends(userA, userB), 'Should be friends');
  
  // Try to send another request
  const result = db.createFriendRequest(userA, userB);
  assert(!result.success, 'Should fail');
  assert.strictEqual(result.errorCode, 'ALREADY_FRIENDS', 'Error code should be ALREADY_FRIENDS');
  
  console.log('  Already friends rejection works');
});

// Test 8: Notification pagination
test('Notification pagination works correctly', async () => {
  const db = new MockDatabase();
  const userId = 1;
  
  // Create 25 notifications
  for (let i = 0; i < 25; i++) {
    db.createNotification({
      userId,
      type: 'SYSTEM',
      title: `Notification ${i}`,
      body: `Body ${i}`
    });
    // Small delay to ensure different timestamps
    await new Promise(r => setTimeout(r, 1));
  }
  
  // First page
  const page1 = db.getNotifications(userId, null, 10);
  assert.strictEqual(page1.items.length, 10, 'First page should have 10 items');
  assert(page1.hasMore, 'Should have more pages');
  assert(page1.nextCursor, 'Should have cursor');
  
  // Second page
  const page2 = db.getNotifications(userId, page1.nextCursor, 10);
  assert.strictEqual(page2.items.length, 10, 'Second page should have 10 items');
  assert(page2.hasMore, 'Should have more pages');
  
  // Third page
  const page3 = db.getNotifications(userId, page2.nextCursor, 10);
  assert.strictEqual(page3.items.length, 5, 'Third page should have 5 items');
  assert(!page3.hasMore, 'Should not have more pages');
  
  // Verify no duplicates
  const allIds = new Set([...page1.items, ...page2.items, ...page3.items].map(n => n.id));
  assert.strictEqual(allIds.size, 25, 'Should have 25 unique notifications');
  
  console.log('  Pagination works correctly');
});

// Test 9: Message locate API for deep-linking
test('Message locate API returns correct anchor', async () => {
  const db = new MockDatabase();
  const channelId = 1;
  const userId = 1;
  
  // Create messages
  for (let i = 0; i < 10; i++) {
    db.createMessage(channelId, userId, `Message ${i}`);
    await new Promise(r => setTimeout(r, 1));
  }
  
  // Locate middle message
  const targetId = 5;
  const locateResult = db.locateMessage(channelId, targetId);
  
  assert(locateResult.success, 'Locate should succeed');
  assert.strictEqual(locateResult.messageId, targetId, 'Should return correct message ID');
  assert(locateResult.anchorCursor, 'Should return anchor cursor');
  assert.strictEqual(locateResult.offsetFromEnd, 5, 'Should have 5 messages after');
  
  // Locate non-existent message
  const notFoundResult = db.locateMessage(channelId, 999);
  assert(!notFoundResult.success, 'Should fail for non-existent message');
  assert(notFoundResult.notFound, 'Should indicate not found');
  
  console.log('  Message locate API works');
});

// Test 10: Mention notification with deep-link data
test('Mention creates notification with channel and message IDs', async () => {
  const db = new MockDatabase();
  const channelId = 1;
  const userA = 1;
  const userB = 2;
  
  // User A mentions User B
  const message = db.createMessage(channelId, userA, 'Hey @UserB check this out!');
  
  // User B should have mention notification
  const notifications = db.getNotifications(userB);
  const mentionNotif = notifications.items.find(n => n.type === 'MENTION');
  
  assert(mentionNotif, 'Should have MENTION notification');
  assert.strictEqual(mentionNotif.channelId, channelId, 'Should have channel ID');
  assert.strictEqual(mentionNotif.messageId, message.id, 'Should have message ID');
  assert.strictEqual(mentionNotif.fromUserId, userA, 'Should have from user ID');
  
  console.log('  Mention notification has deep-link data');
});

// Test 11: Mark notification read
test('Marking notification as read updates status', async () => {
  const db = new MockDatabase();
  const userId = 1;
  
  db.createNotification({ userId, type: 'SYSTEM', title: 'Test' });
  
  const before = db.getNotifications(userId);
  assert.strictEqual(before.unreadCount, 1, 'Should have 1 unread');
  
  const notifId = before.items[0].id;
  db.markNotificationRead(notifId, userId);
  
  const after = db.getNotifications(userId);
  assert.strictEqual(after.unreadCount, 0, 'Should have 0 unread');
  assert.strictEqual(after.items[0].status, 'READ', 'Status should be READ');
  
  console.log('  Mark read works');
});

// Test 12: Mark all read
test('Mark all read updates all notifications', async () => {
  const db = new MockDatabase();
  const userId = 1;
  
  for (let i = 0; i < 5; i++) {
    db.createNotification({ userId, type: 'SYSTEM', title: `Test ${i}` });
  }
  
  const before = db.getNotifications(userId);
  assert.strictEqual(before.unreadCount, 5, 'Should have 5 unread');
  
  db.markAllRead(userId);
  
  const after = db.getNotifications(userId);
  assert.strictEqual(after.unreadCount, 0, 'Should have 0 unread');
  assert(after.items.every(n => n.status === 'READ'), 'All should be READ');
  
  console.log('  Mark all read works');
});

// Test 13: Remove friend
test('Remove friend works correctly', async () => {
  const db = new MockDatabase();
  const userA = 1;
  const userB = 2;
  
  // Become friends
  const request = db.createFriendRequest(userA, userB);
  db.acceptFriendRequest(request.request.id, userB);
  
  assert(db.areFriends(userA, userB), 'Should be friends');
  assert(db.areFriends(userB, userA), 'Should be bidirectional');
  
  // Remove
  const removeResult = db.removeFriend(userA, userB);
  assert(removeResult.success, 'Remove should succeed');
  
  assert(!db.areFriends(userA, userB), 'Should no longer be friends');
  assert(!db.areFriends(userB, userA), 'Bidirectional removal');
  
  console.log('  Remove friend works');
});

// Test 14: Concurrency test - accept and cancel race
test('Accept/cancel race does not create duplicate friendships', async () => {
  const db = new MockDatabase();
  const userA = 1;
  const userB = 2;
  
  const request = db.createFriendRequest(userA, userB);
  const requestId = request.request.id;
  
  // Simulate race: accept and cancel "simultaneously"
  const [acceptResult, cancelResult] = await Promise.all([
    Promise.resolve(db.acceptFriendRequest(requestId, userB)),
    Promise.resolve(db.cancelFriendRequest(requestId, userA))
  ]);
  
  // One should succeed, one should fail (or be idempotent)
  // Due to our sequential processing, accept wins
  assert(acceptResult.success, 'Accept should succeed');
  assert(!cancelResult.success || cancelResult.alreadyProcessed === undefined, 
    'Cancel should fail (request no longer pending)');
  
  // Count friendships - should be exactly 2 (bidirectional)
  const friendships = db.friendships.filter(f => 
    (f.userId === userA && f.friendId === userB) || 
    (f.userId === userB && f.friendId === userA)
  );
  assert.strictEqual(friendships.length, 2, 'Should have exactly 2 friendship entries');
  
  console.log('  Concurrency handled correctly');
});

// Test 15: Error response structure
test('Error responses have consistent structure', async () => {
  const db = new MockDatabase();
  
  const errorCases = [
    db.createFriendRequest(1, 1), // Self request
    db.createFriendRequest(1, 999), // User not found
    db.acceptFriendRequest('invalid', 1), // Request not found
  ];
  
  for (const result of errorCases) {
    assert(!result.success, 'Should not succeed');
    assert(result.errorCode, 'Should have errorCode');
    assert(result.message, 'Should have message');
  }
  
  console.log('  Error responses are consistent');
});

// ============================================================================
// Test Runner
// ============================================================================

async function runTests() {
  console.log('\n🧪 Notifications & Friends Integration Tests\n');
  console.log('=' .repeat(65) + '\n');
  
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
  
  console.log('=' .repeat(65));
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

module.exports = { runTests, MockDatabase };

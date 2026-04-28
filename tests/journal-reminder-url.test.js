/**
 * Journal reminder deep-link URL helper (no DB).
 * Run: node tests/journal-reminder-url.test.js
 */
const assert = require('assert');
const { journalReminderUrl } = require('../api/journal/journalReminderUrl');

function testWithDate() {
  const u = journalReminderUrl('abc-uuid', '2026-04-15');
  assert.ok(u.startsWith('/journal?'));
  assert.ok(u.includes('reminderTask=abc-uuid'));
  assert.ok(u.includes('reminderDate=2026-04-15'));
  console.log('✅ journalReminderUrl with date');
}

function testWithoutValidDate() {
  const u = journalReminderUrl('tid-1', 'bad');
  assert.ok(u.includes('reminderTask=tid-1'));
  assert.ok(!u.includes('reminderDate=bad'));
  console.log('✅ journalReminderUrl ignores invalid date');
}

testWithDate();
testWithoutValidDate();
console.log('\n✅ All journal-reminder-url tests passed');

/**
 * Online Count Generator Tests
 * Verifies weighted random distribution for "Online Now" count
 */

const assert = require('assert');

/**
 * Generate a weighted random online count between 20-100
 * Biased toward mid-range (35-70) for realistic appearance:
 * - 15% chance: Low range (20-34)
 * - 70% chance: Mid range (35-70)
 * - 15% chance: High range (71-100)
 */
function generateWeightedOnlineCount() {
    const roll = Math.random();
    
    if (roll < 0.15) {
        // Low range: 20-34 (15% chance)
        return Math.floor(Math.random() * 15) + 20;
    } else if (roll < 0.85) {
        // Mid range: 35-70 (70% chance)
        return Math.floor(Math.random() * 36) + 35;
    } else {
        // High range: 71-100 (15% chance)
        return Math.floor(Math.random() * 30) + 71;
    }
}

console.log('\n🧪 Online Count Generator Tests\n');

// Test 1: Always returns integer
console.log('Testing: Always returns an integer...');
for (let i = 0; i < 100; i++) {
    const count = generateWeightedOnlineCount();
    assert(Number.isInteger(count), `Expected integer, got ${count}`);
}
console.log('  ✅ Always returns integer');

// Test 2: Always within 20-100 range
console.log('Testing: Always within 20-100 range...');
for (let i = 0; i < 1000; i++) {
    const count = generateWeightedOnlineCount();
    assert(count >= 20, `Count ${count} is below 20`);
    assert(count <= 100, `Count ${count} is above 100`);
}
console.log('  ✅ Always within 20-100 range');

// Test 3: Distribution is weighted (run many times)
console.log('Testing: Distribution is weighted toward mid-range...');
let lowCount = 0;
let midCount = 0;
let highCount = 0;
const iterations = 10000;

for (let i = 0; i < iterations; i++) {
    const count = generateWeightedOnlineCount();
    if (count >= 20 && count <= 34) lowCount++;
    else if (count >= 35 && count <= 70) midCount++;
    else if (count >= 71 && count <= 100) highCount++;
}

const lowPct = (lowCount / iterations * 100).toFixed(1);
const midPct = (midCount / iterations * 100).toFixed(1);
const highPct = (highCount / iterations * 100).toFixed(1);

console.log(`  Distribution over ${iterations} samples:`);
console.log(`    Low (20-34):   ${lowPct}% (expected ~15%)`);
console.log(`    Mid (35-70):   ${midPct}% (expected ~70%)`);
console.log(`    High (71-100): ${highPct}% (expected ~15%)`);

// Allow 5% tolerance
assert(Math.abs(parseFloat(lowPct) - 15) < 5, `Low range ${lowPct}% too far from 15%`);
assert(Math.abs(parseFloat(midPct) - 70) < 5, `Mid range ${midPct}% too far from 70%`);
assert(Math.abs(parseFloat(highPct) - 15) < 5, `High range ${highPct}% too far from 15%`);
console.log('  ✅ Distribution matches expected weights');

// Test 4: Values change on each call (not cached)
console.log('Testing: Values are not cached (can vary between calls)...');
const values = new Set();
for (let i = 0; i < 100; i++) {
    values.add(generateWeightedOnlineCount());
}
// Should have multiple unique values (not the same value 100 times)
assert(values.size > 5, `Expected variety, got only ${values.size} unique values`);
console.log(`  ✅ Generated ${values.size} unique values across 100 calls`);

// Test 5: Sample outputs for manual verification
console.log('\nSample outputs for manual verification:');
for (let i = 0; i < 10; i++) {
    console.log(`  Refresh ${i + 1}: ${generateWeightedOnlineCount()} online`);
}

console.log('\n✅ All tests passed!\n');

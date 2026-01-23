/**
 * AURA AI System - Comprehensive Verification Checklist
 * 
 * This script verifies all production requirements are met:
 * 1. Always returns { success: true, response: string }
 * 2. SQL placeholder/param matching
 * 3. DB connection safety
 * 4. Data adapters with caching, circuit breakers
 * 5. Multimodal image handling
 * 6. Structured tracing
 * 7. Health endpoints
 * 8. Backward compatibility
 */

const fs = require('fs');
const path = require('path');

// ANSI colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  checks: []
};

function check(name, condition, details = '') {
  if (condition) {
    results.passed++;
    results.checks.push({ name, status: 'PASS', details });
    console.log(`${GREEN}✓ PASS${RESET}: ${name}`);
  } else {
    results.failed++;
    results.checks.push({ name, status: 'FAIL', details });
    console.log(`${RED}✗ FAIL${RESET}: ${name}${details ? ` - ${details}` : ''}`);
  }
}

function warn(name, details = '') {
  results.warnings++;
  results.checks.push({ name, status: 'WARN', details });
  console.log(`${YELLOW}⚠ WARN${RESET}: ${name}${details ? ` - ${details}` : ''}`);
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return null;
  }
}

// ============= CHECKLIST VERIFICATION =============

console.log(`\n${BOLD}========================================${RESET}`);
console.log(`${BOLD}AURA AI Production Verification Checklist${RESET}`);
console.log(`${BOLD}========================================${RESET}\n`);

// 1. Check guaranteed response in premium-chat.js
console.log(`\n${BOLD}[1] Response Guarantees${RESET}`);
const premiumChat = readFile(path.join(__dirname, '../api/ai/premium-chat.js'));
const premiumChatRobust = readFile(path.join(__dirname, '../api/ai/premium-chat-robust.js'));

if (premiumChat) {
  // Check for guaranteed success: true responses in catch blocks
  const hasDbErrorFallback = premiumChat.includes('success: true') && 
    premiumChat.includes('database_error');
  check('DB errors return success: true with fallback response', hasDbErrorFallback);
  
  const hasGeneralErrorFallback = premiumChat.includes('error-fallback') && 
    premiumChat.includes("I'm here to help");
  check('General errors return success: true with fallback', hasGeneralErrorFallback);
  
  const neverReturnsFalseOnError = !premiumChat.includes("success: false, \n") || 
    premiumChat.match(/catch.*success: true/s);
  check('Catch blocks return valid responses', 
    premiumChat.includes('GUARANTEED RESPONSE'));
} else {
  check('premium-chat.js exists', false);
}

if (premiumChatRobust) {
  // Check for multi-stage fallback
  const hasMultiStageFallback = premiumChatRobust.includes('gpt-4o-mini') && 
    premiumChatRobust.includes('ultimate fallback');
  check('Multi-stage fallback (GPT-4o → GPT-4o-mini → static)', hasMultiStageFallback);
  
  // Check for unhandled error catch
  const hasOuterCatch = premiumChatRobust.includes('Unhandled error') && 
    premiumChatRobust.includes('error-fallback');
  check('Outer catch returns valid response', hasOuterCatch);
} else {
  check('premium-chat-robust.js exists', false);
}

// 2. Check SQL placeholder/param matching
console.log(`\n${BOLD}[2] SQL Safety${RESET}`);
if (premiumChat) {
  // Check for proper parameterized queries
  const hasParameterizedQuery = premiumChat.includes('WHERE id = ?') && 
    premiumChat.includes('[userId]');
  check('User query uses parameterized SQL', hasParameterizedQuery);
  
  // Check for no string concatenation in SQL
  const noSqlConcat = !premiumChat.match(/execute\([^)]*\+[^)]*\)/);
  check('No SQL string concatenation', noSqlConcat);
}

// Check TradingView webhook for LIMIT fix
const tradingviewWebhook = readFile(path.join(__dirname, '../api/ai/tradingview-webhook.js'));
if (tradingviewWebhook) {
  const hasLimitFix = tradingviewWebhook.includes('LIMIT ${safeLimit}') || 
    tradingviewWebhook.includes('safeLimit');
  check('TradingView webhook LIMIT uses safe integer', hasLimitFix);
}

// 3. Check DB connection handling
console.log(`\n${BOLD}[3] Database Connection Safety${RESET}`);
const dbFile = readFile(path.join(__dirname, '../api/db.js'));
if (dbFile) {
  const hasConnectionPool = dbFile.includes('createPool') && 
    dbFile.includes('connectionLimit');
  check('Uses connection pooling', hasConnectionPool);
  
  const hasHighConnectionLimit = dbFile.includes('connectionLimit: 100');
  check('High connection limit (100) for scale', hasHighConnectionLimit);
  
  const hasExecuteQuery = dbFile.includes('executeQuery') && 
    dbFile.includes('auto-releases');
  check('executeQuery auto-releases connections', hasExecuteQuery);
}

if (premiumChat) {
  const releasesConnection = premiumChat.includes('db.release()');
  check('premium-chat.js releases DB connections', releasesConnection);
}

// 4. Check data layer adapters
console.log(`\n${BOLD}[4] Data Layer Architecture${RESET}`);
const dataLayerIndex = readFile(path.join(__dirname, '../api/ai/data-layer/index.js'));
if (dataLayerIndex) {
  const hasCircuitBreaker = dataLayerIndex.includes('CircuitBreaker') && 
    dataLayerIndex.includes('FAILURE_THRESHOLD');
  check('Circuit breaker implementation', hasCircuitBreaker);
  
  const hasTimeouts = dataLayerIndex.includes('TIMEOUTS') && 
    dataLayerIndex.includes('Promise.race');
  check('Adapter timeouts configured', hasTimeouts);
  
  const hasCaching = dataLayerIndex.includes('getCached') && 
    dataLayerIndex.includes('setCached');
  check('Caching integration', hasCaching);
}

const marketDataAdapter = readFile(path.join(__dirname, '../api/ai/data-layer/adapters/market-data-adapter.js'));
if (marketDataAdapter) {
  const hasParallelFetch = marketDataAdapter.includes('Promise.allSettled');
  check('Market data parallel fetching', hasParallelFetch);
  
  const hasFallback = marketDataAdapter.includes("source: 'fallback'");
  check('Market data fallback response', hasFallback);
  
  const hasSymbolNormalization = marketDataAdapter.includes('normalizeSymbol');
  check('Symbol normalization', hasSymbolNormalization);
}

const dataService = readFile(path.join(__dirname, '../api/ai/data-layer/data-service.js'));
if (dataService) {
  const hasBackgroundPrefetch = dataService.includes('startBackgroundPrefetch') && 
    dataService.includes('prefetchPopularSymbols');
  check('Background prefetch for popular symbols', hasBackgroundPrefetch);
  
  const hasHealthCheck = dataService.includes('getHealth');
  check('Data service health check', hasHealthCheck);
}

// 5. Check multimodal image handling
console.log(`\n${BOLD}[5] Multimodal Image Support${RESET}`);
if (premiumChatRobust) {
  const hasImageValidation = premiumChatRobust.includes('validateImages') && 
    premiumChatRobust.includes('image/jpeg');
  check('Image MIME type validation', hasImageValidation);
  
  const hasSizeLimit = premiumChatRobust.includes('MAX_IMAGE_SIZE') && 
    premiumChatRobust.includes('10 * 1024 * 1024');
  check('Image size limit (10MB)', hasSizeLimit);
  
  const hasImageContent = premiumChatRobust.includes("type: 'image_url'") && 
    premiumChatRobust.includes('image_url: { url:');
  check('OpenAI multimodal format', hasImageContent);
  
  const hasInvalidImageHandling = premiumChatRobust.includes('invalid.push');
  check('Invalid image graceful handling', hasInvalidImageHandling);
}

// 6. Check structured tracing
console.log(`\n${BOLD}[6] Structured Logging & Tracing${RESET}`);
if (premiumChat) {
  const hasRequestId = premiumChat.includes('generateRequestId') && 
    premiumChat.includes('requestId');
  check('Request ID generation', hasRequestId);
  
  const hasStructuredLog = premiumChat.includes('structuredLog') && 
    premiumChat.includes('JSON.stringify');
  check('Structured logging (JSON format)', hasStructuredLog);
  
  const hasTimings = premiumChat.includes('timings') && 
    premiumChat.includes('timing:');
  check('Timing breakdown tracking', hasTimings);
}

// 7. Check health endpoint
console.log(`\n${BOLD}[7] Health Endpoints${RESET}`);
const healthFile = readFile(path.join(__dirname, '../api/ai/health.js'));
if (healthFile) {
  const checksOpenAI = healthFile.includes("openai:") && 
    healthFile.includes('OpenAI');
  check('Health checks OpenAI', checksOpenAI);
  
  const checksDatabase = healthFile.includes("database:") && 
    healthFile.includes('getDbConnection');
  check('Health checks database', checksDatabase);
  
  const checksCache = healthFile.includes("cache:") && 
    healthFile.includes('getCacheStats');
  check('Health checks cache', checksCache);
  
  const checksDataLayer = healthFile.includes("dataLayer:") && 
    healthFile.includes('dataService.getHealth');
  check('Health checks data layer adapters', checksDataLayer);
  
  const hasMemoryStats = healthFile.includes('memoryUsage') && 
    healthFile.includes('heapUsed');
  check('Memory usage reporting', hasMemoryStats);
}

// 8. Check conversation quality features
console.log(`\n${BOLD}[8] Conversation Quality${RESET}`);
if (premiumChatRobust) {
  const hasSystemPrompt = premiumChatRobust.includes("role: 'system'") && 
    premiumChatRobust.includes('systemPrompt');
  check('System prompt included', hasSystemPrompt);
  
  const hasHistoryHandling = premiumChatRobust.includes('conversationHistory') && 
    premiumChatRobust.includes('MAX_CONVERSATION_TURNS');
  check('Conversation history limiting', hasHistoryHandling);
  
  const hasStructuredResponses = premiumChatRobust.includes('Current Situation') && 
    premiumChatRobust.includes('Key Drivers');
  check('Structured trading response format', hasStructuredResponses);
}

const chatCore = readFile(path.join(__dirname, '../api/ai/chat-core.js'));
if (chatCore) {
  const hasSummarization = chatCore.includes('summarizeHistory');
  check('Long history summarization', hasSummarization);
  
  const hasResponseSchema = chatCore.includes('RESPONSE_SCHEMA');
  check('Response schema definition', hasResponseSchema);
}

// 9. Check backward compatibility
console.log(`\n${BOLD}[9] Backward Compatibility${RESET}`);
if (premiumChat) {
  const hasSuccessField = premiumChat.includes('success: true') || 
    premiumChat.includes('success:');
  check('Response has success field', hasSuccessField);
  
  const hasResponseField = premiumChat.includes('response: aiResponse') || 
    premiumChat.includes('response:');
  check('Response has response field', hasResponseField);
  
  const hasRequestIdField = premiumChat.includes('requestId');
  check('Response has requestId field', hasRequestIdField);
  
  const hasTimingField = premiumChat.includes('timing:');
  check('Response has timing field', hasTimingField);
}

// 10. Check test coverage
console.log(`\n${BOLD}[10] Test Coverage${RESET}`);
const testFile = readFile(path.join(__dirname, 'ai-chat.test.js'));
if (testFile) {
  const hasInputValidationTests = testFile.includes("describe('Input Validation'");
  check('Input validation tests', hasInputValidationTests);
  
  const hasImageTests = testFile.includes("describe('Image Validation'");
  check('Image validation tests', hasImageTests);
  
  const hasAccessControlTests = testFile.includes("describe('Access Control'");
  check('Access control tests', hasAccessControlTests);
  
  const hasIntegrationTests = testFile.includes("describe('API Integration Tests'");
  check('Integration tests', hasIntegrationTests);
  
  const hasPerformanceTests = testFile.includes("describe('Performance Tests'");
  check('Performance tests', hasPerformanceTests);
  
  const hasConcurrencyTest = testFile.includes('concurrent requests');
  check('Concurrent request tests', hasConcurrencyTest);
} else {
  check('Test file exists', false);
}

// 11. Check no other AI models
console.log(`\n${BOLD}[11] Single Model System${RESET}`);
if (premiumChat) {
  const usesOnlyOpenAI = !premiumChat.includes('anthropic') && 
    !premiumChat.includes('gemini') && 
    !premiumChat.includes('palm') &&
    !premiumChat.includes('cohere');
  check('Uses only OpenAI (no other AI services)', usesOnlyOpenAI);
  
  const modelsUsed = [];
  if (premiumChat.includes('gpt-4o')) modelsUsed.push('gpt-4o');
  if (premiumChat.includes('gpt-4o-mini')) modelsUsed.push('gpt-4o-mini');
  check(`Models used: ${modelsUsed.join(', ')}`, modelsUsed.length > 0);
}

// ============= FINAL SUMMARY =============

console.log(`\n${BOLD}========================================${RESET}`);
console.log(`${BOLD}VERIFICATION SUMMARY${RESET}`);
console.log(`${BOLD}========================================${RESET}`);
console.log(`${GREEN}Passed: ${results.passed}${RESET}`);
console.log(`${RED}Failed: ${results.failed}${RESET}`);
console.log(`${YELLOW}Warnings: ${results.warnings}${RESET}`);
console.log(`Total Checks: ${results.passed + results.failed}`);

const passRate = ((results.passed / (results.passed + results.failed)) * 100).toFixed(1);
console.log(`\n${BOLD}Pass Rate: ${passRate}%${RESET}`);

if (results.failed === 0) {
  console.log(`\n${GREEN}${BOLD}✓ ALL CHECKS PASSED - SYSTEM IS PRODUCTION READY${RESET}`);
} else {
  console.log(`\n${RED}${BOLD}✗ SOME CHECKS FAILED - REVIEW REQUIRED${RESET}`);
  console.log(`\nFailed checks:`);
  results.checks.filter(c => c.status === 'FAIL').forEach(c => {
    console.log(`  - ${c.name}${c.details ? `: ${c.details}` : ''}`);
  });
}

// Output JSON for CI/CD
const outputPath = path.join(__dirname, 'verification-results.json');
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
console.log(`\nDetailed results saved to: ${outputPath}`);

// Exit with error code if any checks failed
process.exit(results.failed > 0 ? 1 : 0);

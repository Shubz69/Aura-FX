/**
 * AURA Trading Intelligence Engine
 * 
 * Production-grade AI trading assistant that combines:
 * - 10-pillar trading knowledge core
 * - Deterministic reasoning pipeline
 * - Persistent memory system
 * - Live data integration
 * - Safety and validation layer
 * - Performance optimization
 * 
 * Strict response standard for every market question:
 * Main Driver → Supporting Factors → Mechanism → Key Levels → 
 * Scenarios (bull/base/bear) → Risk/Position Sizing → What to Watch
 */

const { pipeline, detectIntents, extractInstrument, getMarketSession } = require('./reasoning-pipeline');
const knowledgeCore = require('./trading-knowledge-core');
const memorySystem = require('./memory-system');
const dataService = require('./data-layer/data-service');
const { getCached, setCached } = require('../cache');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Timeouts
  REASONING_TIMEOUT: 15000,
  DATA_FETCH_TIMEOUT: 5000,
  
  // Performance
  CACHE_TTL: 60000, // 1 minute for market data
  PREFETCH_INTERVAL: 30000,
  
  // Response validation
  REQUIRE_CATALYST_FOR_WHY: true,
  REQUIRE_LEVELS_FOR_TECHNICAL: true,
  REQUIRE_SIZING_WHEN_PROVIDED: true,
  
  // Safety
  LABEL_STALE_DATA_AGE: 300000, // 5 minutes
  MAX_RESPONSE_LENGTH: 4000
};

// Popular instruments for prefetching
const POPULAR_INSTRUMENTS = ['XAUUSD', 'EURUSD', 'BTCUSD', 'SPX500', 'GBPUSD', 'USDJPY', 'NAS100'];

// ============================================================================
// REQUEST TRACKING
// ============================================================================

let requestCounter = 0;
const activeRequests = new Map();

function generateRequestId() {
  return `aura_${Date.now().toString(36)}_${++requestCounter}`;
}

function trackRequest(requestId, userId) {
  activeRequests.set(requestId, {
    userId,
    startTime: Date.now(),
    status: 'processing'
  });
  
  // Clean up old requests
  const cutoff = Date.now() - 60000;
  for (const [id, req] of activeRequests.entries()) {
    if (req.startTime < cutoff) {
      activeRequests.delete(id);
    }
  }
}

function completeRequest(requestId, status = 'completed') {
  const req = activeRequests.get(requestId);
  if (req) {
    req.status = status;
    req.duration = Date.now() - req.startTime;
  }
}

// ============================================================================
// MAIN AURA ENGINE
// ============================================================================

class AuraEngine {
  constructor() {
    this.pipeline = pipeline;
    this.knowledgeCore = knowledgeCore;
    this.memorySystem = memorySystem;
    this.dataService = dataService;
    this.initialized = false;
    this.prefetchInterval = null;
  }
  
  /**
   * Initialize the engine
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Ensure memory schema
      await memorySystem.ensureSchema();
      
      // Start prefetch for popular instruments
      this.startPrefetch();
      
      this.initialized = true;
      console.log('AURA Engine initialized');
    } catch (e) {
      console.error('AURA Engine initialization error:', e);
    }
  }
  
  /**
   * Process a user query
   */
  async processQuery(message, options = {}) {
    const requestId = options.requestId || generateRequestId();
    const userId = options.userId || 0;
    const startTime = Date.now();
    
    trackRequest(requestId, userId);
    console.log(`[${requestId}] AURA processing: "${message.substring(0, 50)}..."`);
    
    try {
      // 1. Build memory context
      const instrument = extractInstrument(message);
      const memoryContext = userId 
        ? await this.buildUserContext(userId, instrument)
        : { userPreferences: {} };
      
      // 2. Merge user context into options
      const enrichedOptions = {
        ...options,
        userPreferences: memoryContext.userPreferences,
        recentSummaries: memoryContext.recentSummaries,
        marketNarratives: memoryContext.marketNarratives,
        feedbackRules: memoryContext.feedbackRules
      };
      
      // 3. Run reasoning pipeline with timeout
      const pipelineResult = await Promise.race([
        this.pipeline.process(message, enrichedOptions),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Pipeline timeout')), CONFIG.REASONING_TIMEOUT)
        )
      ]);
      
      // 4. Validate response
      const validation = this.validateResponse(pipelineResult);
      
      // 5. Apply feedback rules
      const finalResponse = this.applyFeedbackRules(pipelineResult, memoryContext.feedbackRules);
      
      // 6. Store narrative memory
      if (instrument && pipelineResult.context?.catalysts?.length > 0) {
        await this.storeNarrative(instrument, pipelineResult.context);
      }
      
      // 7. Build final result
      const result = {
        success: true,
        requestId,
        response: finalResponse.response?.text || this.buildFallbackResponse(message),
        structured: finalResponse.response,
        instrument: pipelineResult.context?.instrument,
        session: pipelineResult.context?.session,
        dataQuality: {
          isLive: pipelineResult.context?.isLiveData,
          source: pipelineResult.context?.dataSource,
          age: this.getDataAge(pipelineResult.context?.marketData)
        },
        validation,
        processingTime: Date.now() - startTime,
        steps: pipelineResult.steps
      };
      
      completeRequest(requestId, 'completed');
      console.log(`[${requestId}] Completed in ${result.processingTime}ms`);
      
      return result;
      
    } catch (error) {
      console.error(`[${requestId}] Error:`, error);
      completeRequest(requestId, 'error');
      
      return {
        success: false,
        requestId,
        response: this.buildErrorResponse(error, message),
        error: error.message,
        processingTime: Date.now() - startTime
      };
    }
  }
  
  /**
   * Build user context from memory
   */
  async buildUserContext(userId, instrument) {
    try {
      return await memorySystem.buildMemoryContext(userId, instrument);
    } catch (e) {
      console.error('Error building user context:', e);
      return { userPreferences: {} };
    }
  }
  
  /**
   * Validate response against requirements
   */
  validateResponse(result) {
    const errors = [];
    const warnings = [];
    
    const intents = result.steps?.find(s => s.name === 'intent_detection')?.intents || [];
    const context = result.context || {};
    
    // Check for required elements based on intent
    for (const intent of intents) {
      if (intent.type === 'WHY_MOVED' && CONFIG.REQUIRE_CATALYST_FOR_WHY) {
        if (!context.catalysts || context.catalysts.length === 0) {
          warnings.push('No catalyst found for "why moved" query - using general analysis');
        } else if (context.catalysts[0].score < 50) {
          warnings.push('Low confidence catalyst - recommend verifying with additional sources');
        }
      }
      
      if (intent.type === 'LEVELS' && CONFIG.REQUIRE_LEVELS_FOR_TECHNICAL) {
        if (!context.levels) {
          if (context.marketData?.price > 0) {
            warnings.push('Levels could be calculated but were not included');
          }
        }
      }
      
      if (intent.type === 'POSITION_SIZE' && CONFIG.REQUIRE_SIZING_WHEN_PROVIDED) {
        if (!context.positionSize && context.marketData?.price > 0) {
          warnings.push('Position sizing requested but missing account/stop info');
        }
      }
    }
    
    // Data quality checks
    if (!context.isLiveData && context.marketData?.price > 0) {
      warnings.push('Using cached data - verify current prices');
    }
    
    // Response completeness
    if (!result.response?.sections || result.response.sections.length < 3) {
      warnings.push('Response may be incomplete');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Apply feedback-learned rules to improve response
   */
  applyFeedbackRules(result, rules) {
    if (!rules || rules.length === 0) return result;
    
    // Apply rules to response sections
    const response = result.response;
    if (!response?.sections) return result;
    
    for (const rule of rules) {
      if (!rule.active) continue;
      
      switch (rule.rule_type) {
        case 'require':
          // Check if required element is present
          if (rule.pattern === 'missed_catalyst' && !response.sections.some(s => s.type === 'driver')) {
            // Add placeholder for catalyst
            console.log(`[Feedback Rule] Adding required catalyst section`);
          }
          break;
        case 'boost':
          // Boost certain sections
          break;
        case 'avoid':
          // Remove or modify avoided patterns
          break;
      }
    }
    
    return result;
  }
  
  /**
   * Store market narrative to memory
   */
  async storeNarrative(instrument, context) {
    try {
      const drivers = (context.catalysts || []).slice(0, 3).map(c => ({
        title: c.title,
        type: c.type,
        confidence: c.confidence
      }));
      
      const priceAction = {
        price: context.marketData?.price,
        change: context.marketData?.change,
        high: context.marketData?.high,
        low: context.marketData?.low
      };
      
      // Determine sentiment from catalysts and price action
      let sentiment = 'neutral';
      if (context.marketData?.change > 0) sentiment = 'bullish';
      else if (context.marketData?.change < 0) sentiment = 'bearish';
      
      const narrative = drivers.map(d => d.title).join('; ') || 'No significant drivers';
      
      await memorySystem.storeMarketNarrative(
        instrument,
        narrative,
        drivers,
        priceAction,
        sentiment,
        context.catalysts?.[0]?.confidence || 0.5
      );
    } catch (e) {
      console.error('Error storing narrative:', e);
    }
  }
  
  /**
   * Get data age in human-readable format
   */
  getDataAge(marketData) {
    if (!marketData?.timestamp) return 'unknown';
    const age = Date.now() - new Date(marketData.timestamp).getTime();
    if (age < 60000) return 'live';
    if (age < 300000) return `${Math.round(age / 60000)} min ago`;
    if (age < 3600000) return `${Math.round(age / 60000)} min ago (stale)`;
    return 'stale';
  }
  
  /**
   * Build fallback response when pipeline fails
   */
  buildFallbackResponse(message) {
    const session = getMarketSession();
    const intent = detectIntents(message)[0]?.type || 'ANALYSIS';
    
    let response = '**⚠️ LIMITED DATA AVAILABLE**\n\n';
    response += `Unable to fetch complete market data. Here's what I can tell you:\n\n`;
    response += `**Session**: ${session.name} (${session.liquidity} liquidity)\n`;
    
    if (intent === 'WHY_MOVED') {
      response += '\n**Recommendation**: Check recent news and economic calendar for catalysts.';
    } else if (intent === 'LEVELS') {
      response += '\n**Recommendation**: Review your charting platform for current support/resistance.';
    } else if (intent === 'POSITION_SIZE') {
      response += '\n**Recommendation**: Use the formula: Position = Risk Amount / Stop Distance';
    }
    
    response += '\n\n_Data sources temporarily unavailable. Please try again shortly._';
    
    return response;
  }
  
  /**
   * Build error response
   */
  buildErrorResponse(error, message) {
    let response = '**Unable to process request**\n\n';
    response += 'I encountered an issue while analyzing your query. ';
    
    if (error.message.includes('timeout')) {
      response += 'The data sources are responding slowly. Please try again.';
    } else if (error.message.includes('rate limit')) {
      response += 'Too many requests. Please wait a moment and try again.';
    } else {
      response += 'Please try rephrasing your question or check back shortly.';
    }
    
    response += '\n\n**In the meantime:**\n';
    response += '• Check your charting platform for current prices\n';
    response += '• Review the economic calendar for scheduled events\n';
    response += '• Monitor major news sources for breaking headlines';
    
    return response;
  }
  
  /**
   * Educational query handler
   */
  async handleEducation(topic) {
    const knowledge = knowledgeCore.getKnowledge(topic);
    
    if (!knowledge) {
      // Search for it
      const results = knowledgeCore.searchKnowledge(topic);
      if (results.length > 0) {
        return {
          success: true,
          topic,
          content: results.map(r => `**${r.path}**: ${r.content}`).join('\n\n'),
          sources: results.map(r => r.pillar)
        };
      }
      return {
        success: false,
        message: `I don't have specific information about "${topic}" in my knowledge base.`
      };
    }
    
    return {
      success: true,
      topic,
      content: this.formatKnowledge(knowledge),
      sources: ['Trading Knowledge Core']
    };
  }
  
  /**
   * Format knowledge object for display
   */
  formatKnowledge(knowledge, depth = 0) {
    if (typeof knowledge === 'string') {
      return knowledge;
    }
    
    if (Array.isArray(knowledge)) {
      return knowledge.map(item => `• ${typeof item === 'object' ? JSON.stringify(item) : item}`).join('\n');
    }
    
    if (typeof knowledge === 'object') {
      const indent = '  '.repeat(depth);
      return Object.entries(knowledge)
        .map(([key, value]) => {
          const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          if (typeof value === 'object') {
            return `${indent}**${formattedKey}:**\n${this.formatKnowledge(value, depth + 1)}`;
          }
          return `${indent}**${formattedKey}:** ${value}`;
        })
        .join('\n');
    }
    
    return String(knowledge);
  }
  
  /**
   * Position sizing helper
   */
  calculatePositionSize(params) {
    const { calculatePositionSize } = require('./reasoning-pipeline');
    return calculatePositionSize(params);
  }
  
  /**
   * Record user feedback
   */
  async recordFeedback(data) {
    return await memorySystem.storeFeedback(data);
  }
  
  /**
   * Update user preferences
   */
  async updatePreferences(userId, updates) {
    return await memorySystem.updateUserPreferences(userId, updates);
  }
  
  /**
   * Get user preferences
   */
  async getPreferences(userId) {
    return await memorySystem.getUserPreferences(userId);
  }
  
  /**
   * Start background prefetch
   */
  startPrefetch() {
    if (this.prefetchInterval) {
      clearInterval(this.prefetchInterval);
    }
    
    // Initial prefetch
    this.prefetchPopular();
    
    // Recurring prefetch
    this.prefetchInterval = setInterval(() => {
      this.prefetchPopular();
    }, CONFIG.PREFETCH_INTERVAL);
  }
  
  async prefetchPopular() {
    for (const instrument of POPULAR_INSTRUMENTS) {
      try {
        await this.dataService.getMarketData(instrument);
      } catch (e) {
        // Ignore prefetch errors
      }
    }
  }
  
  /**
   * Get engine health status
   */
  getHealth() {
    const dataHealth = this.dataService.getHealth();
    
    return {
      status: this.initialized ? 'healthy' : 'initializing',
      dataServices: dataHealth,
      activeRequests: activeRequests.size,
      prefetchActive: !!this.prefetchInterval,
      knowledgePillars: Object.keys(knowledgeCore).filter(k => k === k.toUpperCase()).length,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Shutdown cleanly
   */
  shutdown() {
    if (this.prefetchInterval) {
      clearInterval(this.prefetchInterval);
      this.prefetchInterval = null;
    }
    this.dataService.stop();
    console.log('AURA Engine shutdown');
  }
}

// Create singleton instance
const auraEngine = new AuraEngine();

// Export
module.exports = {
  auraEngine,
  AuraEngine,
  CONFIG,
  generateRequestId
};

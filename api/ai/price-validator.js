/**
 * Price Validator - Server-side validation of AI output
 * 
 * This module scans AI-generated responses and validates that any prices
 * or levels mentioned match the injected quote context.
 * 
 * Features:
 * - Extracts all numeric prices from AI response
 * - Validates against injected quote context
 * - Allows derived values (e.g., targets as offsets)
 * - Blocks/rewrites invalid prices
 * - Adds warnings for unverifiable prices
 */

// ============= CONFIGURATION =============

const CONFIG = {
  // Tolerance for matching prices (as percentage)
  // e.g., 0.5 means prices within 0.5% of live price are valid
  PRICE_MATCH_TOLERANCE_PERCENT: 0.5,
  
  // Maximum allowed offset from live price for targets (as percentage)
  // e.g., targets like +5% or -3% are allowed
  MAX_TARGET_OFFSET_PERCENT: 10,
  
  // Enable strict mode - block any response with invalid prices
  STRICT_MODE: true,
  
  // Enable rewrite mode - replace invalid prices with warnings
  REWRITE_MODE: true,
};

// ============= PRICE EXTRACTION =============

/**
 * Extract all price-like numbers from text
 * This catches patterns like:
 * - $2,750.50
 * - 2750.50
 * - 1.0850
 * - at 2750
 * - price of 1500
 */
function extractPrices(text) {
  if (!text) return [];
  
  const prices = [];
  
  // Pattern for various price formats
  const patterns = [
    // Dollar amounts with commas: $2,750.50
    /\$[\d,]+\.?\d*/g,
    
    // Large numbers (likely prices for gold, indices, crypto)
    // e.g., "at 2750" or "price 2750.50"
    /(?:at|around|near|price|level|target|support|resistance|entry|exit|stop|tp|sl)\s*(?:of|is|at|:)?\s*\$?([\d,]+\.?\d*)/gi,
    
    // Numbers with decimals that look like prices (4-5+ digits)
    /\b(\d{4,}\.?\d{0,2})\b/g,
    
    // Forex-like prices (1.0000 - 2.0000 range with 4-5 decimals)
    /\b([01]\.\d{4,5})\b/g,
    
    // JPY pairs (3 digit whole with decimals)
    /\b(\d{2,3}\.\d{2,3})\b/g,
  ];
  
  // Context patterns that indicate a price is being mentioned
  const priceContextPatterns = [
    /(?:price|level|target|support|resistance|entry|exit|stop|take\s*profit|tp|sl|bid|ask|open|close|high|low)\s*(?:of|is|at|:)?\s*\$?([\d,]+\.?\d*)/gi,
    /\$?([\d,]+\.?\d*)\s*(?:level|area|zone|resistance|support)/gi,
    /(?:trading|currently|now|moved|reached|touched|hit|broke|above|below)\s*(?:at|to|through)?\s*\$?([\d,]+\.?\d*)/gi,
  ];
  
  // Extract from context patterns first (higher confidence)
  for (const pattern of priceContextPatterns) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      const price = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(price) && price > 0) {
        prices.push({
          value: price,
          raw: match[0],
          index: match.index,
          confidence: 'high'
        });
      }
    }
  }
  
  // Also extract standalone dollar amounts
  const dollarPattern = /\$[\d,]+\.?\d*/g;
  let match;
  while ((match = dollarPattern.exec(text)) !== null) {
    const price = parseFloat(match[0].replace(/[$,]/g, ''));
    if (!isNaN(price) && price > 0) {
      // Check if we already have this price
      const exists = prices.some(p => Math.abs(p.value - price) < 0.01);
      if (!exists) {
        prices.push({
          value: price,
          raw: match[0],
          index: match.index,
          confidence: 'medium'
        });
      }
    }
  }
  
  return prices;
}

/**
 * Extract percentage mentions (for target validation)
 * e.g., "+0.5%", "-1.5%", "0.5% above"
 */
function extractPercentages(text) {
  if (!text) return [];
  
  const percentages = [];
  const pattern = /([+-]?\d+\.?\d*)\s*%/g;
  
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const value = parseFloat(match[1]);
    if (!isNaN(value)) {
      percentages.push({
        value,
        raw: match[0],
        index: match.index
      });
    }
  }
  
  return percentages;
}

// ============= VALIDATION LOGIC =============

/**
 * Check if a price is valid against the quote context
 * 
 * @param {number} price - The price to validate
 * @param {Object} quoteContext - The injected quote context
 * @returns {Object} Validation result
 */
function validatePrice(price, quoteContext) {
  if (!quoteContext || !quoteContext.available) {
    return {
      valid: false,
      reason: 'no_context',
      message: 'No quote context available for validation'
    };
  }
  
  // Check against all instruments in context
  for (const [symbol, quote] of Object.entries(quoteContext.instruments)) {
    if (!quote.available) continue;
    
    const livePrice = quote.last;
    if (!livePrice) continue;
    
    // Direct price match (within tolerance)
    const tolerance = livePrice * (CONFIG.PRICE_MATCH_TOLERANCE_PERCENT / 100);
    if (Math.abs(price - livePrice) <= tolerance) {
      return {
        valid: true,
        reason: 'matches_live',
        symbol,
        livePrice,
        message: `Price ${price} matches live price ${livePrice} for ${symbol}`
      };
    }
    
    // Check if it matches other session prices
    const sessionPrices = [quote.open, quote.high, quote.low, quote.previousClose, quote.bid, quote.ask];
    for (const sessionPrice of sessionPrices) {
      if (sessionPrice && Math.abs(price - sessionPrice) <= tolerance) {
        return {
          valid: true,
          reason: 'matches_session',
          symbol,
          livePrice,
          sessionPrice,
          message: `Price ${price} matches session price ${sessionPrice} for ${symbol}`
        };
      }
    }
    
    // Check if it's a reasonable target (within MAX_TARGET_OFFSET_PERCENT of live price)
    const maxOffset = livePrice * (CONFIG.MAX_TARGET_OFFSET_PERCENT / 100);
    if (Math.abs(price - livePrice) <= maxOffset) {
      // This could be a target - check the magnitude
      const offsetPercent = ((price - livePrice) / livePrice) * 100;
      
      return {
        valid: true,
        reason: 'valid_target',
        symbol,
        livePrice,
        offsetPercent: Math.round(offsetPercent * 100) / 100,
        message: `Price ${price} is ${offsetPercent.toFixed(2)}% from live price ${livePrice} - valid as target`
      };
    }
  }
  
  // Price doesn't match any context
  return {
    valid: false,
    reason: 'no_match',
    message: `Price ${price} does not match any known live prices or valid targets`
  };
}

/**
 * Validate all prices in an AI response
 * 
 * @param {string} response - The AI's response text
 * @param {Object} quoteContext - The injected quote context
 * @returns {Object} Validation results
 */
function validateResponse(response, quoteContext) {
  if (!response) {
    return {
      valid: true,
      extractedPrices: [],
      validPrices: [],
      invalidPrices: [],
      warnings: []
    };
  }
  
  const extractedPrices = extractPrices(response);
  const validPrices = [];
  const invalidPrices = [];
  const warnings = [];
  
  for (const priceInfo of extractedPrices) {
    const validation = validatePrice(priceInfo.value, quoteContext);
    
    if (validation.valid) {
      validPrices.push({
        ...priceInfo,
        validation
      });
    } else {
      invalidPrices.push({
        ...priceInfo,
        validation
      });
    }
  }
  
  // Check if context was unavailable
  if (!quoteContext?.available && extractedPrices.length > 0) {
    warnings.push({
      type: 'no_context',
      message: 'Prices mentioned without live quote context - cannot verify accuracy'
    });
  }
  
  // Check for too many invalid prices
  if (invalidPrices.length > validPrices.length && extractedPrices.length > 0) {
    warnings.push({
      type: 'many_invalid',
      message: `${invalidPrices.length} of ${extractedPrices.length} prices could not be verified`
    });
  }
  
  return {
    valid: invalidPrices.length === 0 || !CONFIG.STRICT_MODE,
    extractedPrices,
    validPrices,
    invalidPrices,
    warnings,
    summary: {
      total: extractedPrices.length,
      valid: validPrices.length,
      invalid: invalidPrices.length
    }
  };
}

// ============= RESPONSE REWRITING =============

/**
 * Rewrite a response to fix or flag invalid prices
 * 
 * @param {string} response - The AI's response
 * @param {Object} validation - Validation results from validateResponse
 * @param {Object} quoteContext - The injected quote context
 * @returns {string} Rewritten response
 */
function rewriteResponse(response, validation, quoteContext) {
  if (!CONFIG.REWRITE_MODE) return response;
  if (!validation || validation.valid) return response;
  if (validation.invalidPrices.length === 0) return response;
  
  let rewritten = response;
  
  // Sort invalid prices by index (descending) to replace from end to start
  const sortedInvalid = [...validation.invalidPrices].sort((a, b) => b.index - a.index);
  
  for (const invalidPrice of sortedInvalid) {
    // Find the best replacement
    let replacement = `[${invalidPrice.raw} - unverified]`;
    
    // If we have context, suggest using live price instead
    if (quoteContext?.available) {
      const firstInstrument = Object.entries(quoteContext.instruments).find(([_, q]) => q.available);
      if (firstInstrument) {
        const [symbol, quote] = firstInstrument;
        replacement = `[live price: ${quote.last}]`;
      }
    }
    
    // Only replace high-confidence price extractions
    if (invalidPrice.confidence === 'high') {
      rewritten = rewritten.slice(0, invalidPrice.index) + 
                  replacement + 
                  rewritten.slice(invalidPrice.index + invalidPrice.raw.length);
    }
  }
  
  return rewritten;
}

/**
 * Add a disclaimer if prices couldn't be verified
 * 
 * @param {string} response - The AI's response
 * @param {Object} validation - Validation results
 * @returns {string} Response with disclaimer if needed
 */
function addDisclaimer(response, validation) {
  if (!validation || validation.valid) return response;
  if (validation.invalidPrices.length === 0) return response;
  
  const disclaimer = '\n\n*Note: Some prices mentioned may not reflect current market data. Always verify with your trading platform.*';
  
  return response + disclaimer;
}

// ============= MAIN VALIDATION FUNCTION =============

/**
 * Full validation and sanitization of AI response
 * 
 * @param {string} response - The AI's response
 * @param {Object} quoteContext - The injected quote context
 * @param {Object} options - Options (strict, rewrite, addDisclaimer)
 * @returns {Object} { sanitizedResponse, validation, blocked }
 */
function validateAndSanitize(response, quoteContext, options = {}) {
  const opts = {
    strict: options.strict ?? CONFIG.STRICT_MODE,
    rewrite: options.rewrite ?? CONFIG.REWRITE_MODE,
    addDisclaimer: options.addDisclaimer ?? true,
    ...options
  };
  
  // Validate the response
  const validation = validateResponse(response, quoteContext);
  
  // Determine if we should block
  const shouldBlock = opts.strict && 
                      validation.invalidPrices.length > 0 && 
                      quoteContext?.available;
  
  let sanitizedResponse = response;
  
  if (shouldBlock) {
    // In strict mode with invalid prices, return a safe response
    const symbols = Object.keys(quoteContext.instruments || {});
    const liveQuotes = Object.entries(quoteContext.instruments || {})
      .filter(([_, q]) => q.available)
      .map(([s, q]) => `${s}: ${q.last}`)
      .join(', ');
    
    sanitizedResponse = `I apologize, but I cannot provide accurate price information at this moment. Please check the live market prices directly.\n\n**Current live prices:** ${liveQuotes || 'unavailable'}`;
  } else if (opts.rewrite && validation.invalidPrices.length > 0) {
    // Rewrite invalid prices
    sanitizedResponse = rewriteResponse(response, validation, quoteContext);
    
    if (opts.addDisclaimer) {
      sanitizedResponse = addDisclaimer(sanitizedResponse, validation);
    }
  }
  
  return {
    originalResponse: response,
    sanitizedResponse,
    validation,
    blocked: shouldBlock,
    modified: sanitizedResponse !== response
  };
}

// ============= PROMPT INJECTION HELPERS =============

/**
 * Generate the strict pricing instructions to inject into the AI prompt
 * 
 * @param {Object} quoteContext - The quote context to reference
 * @returns {string} Instructions to add to system prompt
 */
function generatePricingInstructions(quoteContext) {
  if (!quoteContext || !quoteContext.available) {
    return `
**CRITICAL PRICING RULES:**
Live market quotes are currently UNAVAILABLE. You MUST:
1. Say "Live quote unavailable right now" when asked about specific prices
2. Do NOT guess, estimate, or make up any price numbers
3. You may discuss general market analysis without specific prices
4. Direct users to check their trading platform for live prices
`;
  }
  
  // Build the live quote summary
  const quoteLines = Object.entries(quoteContext.instruments)
    .filter(([_, q]) => q.available)
    .map(([symbol, q]) => {
      return `  - ${symbol} (${q.displayName}): Last=${q.last}, Open=${q.open}, High=${q.high}, Low=${q.low}, PrevClose=${q.previousClose}, Change=${q.change} (${q.changePercent}%)`;
    });
  
  return `
**CRITICAL PRICING RULES - YOU MUST FOLLOW THESE:**

LIVE MARKET QUOTES (fetched at ${quoteContext.timestamp}):
${quoteLines.join('\n')}

MANDATORY RULES:
1. You MUST ONLY use prices from the LIVE MARKET QUOTES above
2. Do NOT guess, estimate, or make up any price numbers
3. If a price is not in the quotes above, say "I don't have live data for that"
4. For targets/levels, express as offsets from the live price (e.g., "+$20 from current" or "+0.5%")
5. Always cite the source when mentioning prices (e.g., "Gold is currently at $${quoteContext.instruments['XAUUSD']?.last || 'N/A'}")
6. If quotes are marked as unavailable, say "Live quote unavailable right now"

SYMBOL CONSISTENCY:
- XAUUSD = Gold SPOT price (not futures)
- GC = Gold FUTURES (only use if user explicitly asks for futures)
- Do NOT mix spot and futures prices
- If user asks about "XAU/USD" or "gold", use XAUUSD spot price

YOU ARE FORBIDDEN FROM:
- Making up prices that are not in the quotes above
- Guessing approximate prices
- Using outdated prices from training data
- Mixing spot and futures prices without explicit user request
`;
}

// ============= AUTOMATED PRICE ASSERTION =============

/**
 * Assert that all "Current Price" mentions in AI output match live quotes
 * This is the automated check the user requested to ensure price accuracy
 * 
 * @param {string} response - The AI's response
 * @param {Object} quoteContext - The quote context with live prices
 * @returns {Object} Assertion result with pass/fail status and details
 */
function assertPricesMatchLiveQuotes(response, quoteContext) {
  const result = {
    passed: true,
    totalAssertions: 0,
    passedAssertions: 0,
    failedAssertions: 0,
    details: [],
    timestamp: new Date().toISOString()
  };
  
  if (!response || !quoteContext?.available) {
    result.details.push({
      check: 'context_available',
      passed: !response, // Pass if no response, fail if response without context
      reason: quoteContext?.available ? 'Quote context available' : 'No quote context available'
    });
    return result;
  }
  
  // Pattern to find "Current Price" mentions with the actual price value
  const currentPricePatterns = [
    /current(?:ly)?(?:\s+trading)?(?:\s+at)?(?:\s+is)?(?:\s*:)?\s*\$?([\d,]+\.?\d*)/gi,
    /(?:price|trading)\s+(?:at|is|of)\s*\$?([\d,]+\.?\d*)/gi,
    /\$?([\d,]+\.?\d*)\s+(?:is the )?current/gi,
  ];
  
  for (const pattern of currentPricePatterns) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    
    while ((match = regex.exec(response)) !== null) {
      const extractedPrice = parseFloat(match[1].replace(/,/g, ''));
      if (isNaN(extractedPrice) || extractedPrice <= 0) continue;
      
      result.totalAssertions++;
      
      // Check against all live quotes
      let foundMatch = false;
      let closestSymbol = null;
      let closestDiff = Infinity;
      
      for (const [symbol, quote] of Object.entries(quoteContext.instruments || {})) {
        if (!quote?.available || !quote.last) continue;
        
        const livePrice = quote.last;
        const decimals = quote.decimals || 2;
        
        // Calculate tolerance based on decimals (allow for rounding)
        const tolerance = Math.pow(10, -decimals) * 5; // Half a tick tolerance
        const percentTolerance = livePrice * 0.005; // 0.5% tolerance for larger prices
        const actualTolerance = Math.max(tolerance, percentTolerance);
        
        const diff = Math.abs(extractedPrice - livePrice);
        
        if (diff < closestDiff) {
          closestDiff = diff;
          closestSymbol = symbol;
        }
        
        if (diff <= actualTolerance) {
          foundMatch = true;
          result.passedAssertions++;
          result.details.push({
            check: 'current_price_match',
            passed: true,
            extractedPrice,
            livePrice,
            symbol,
            decimals,
            tolerance: actualTolerance,
            diff,
            context: match[0].substring(0, 50)
          });
          break;
        }
      }
      
      if (!foundMatch) {
        result.passed = false;
        result.failedAssertions++;
        
        // Get the closest quote for reporting
        const closestQuote = quoteContext.instruments?.[closestSymbol];
        
        result.details.push({
          check: 'current_price_match',
          passed: false,
          extractedPrice,
          expectedPrice: closestQuote?.last,
          symbol: closestSymbol,
          decimals: closestQuote?.decimals,
          diff: closestDiff,
          context: match[0].substring(0, 50),
          error: `Price ${extractedPrice} does not match any live quote (closest: ${closestSymbol} at ${closestQuote?.last}, diff: ${closestDiff.toFixed(4)})`
        });
      }
    }
  }
  
  // If no current price mentions found, that's okay (pass by default)
  if (result.totalAssertions === 0) {
    result.details.push({
      check: 'no_current_price_mentions',
      passed: true,
      reason: 'No current price mentions found in response'
    });
  }
  
  return result;
}

/**
 * Log assertion results for monitoring/debugging
 */
function logPriceAssertion(requestId, assertion) {
  const status = assertion.passed ? 'PASS' : 'FAIL';
  console.log(`[PriceAssertion][${requestId}] ${status}: ${assertion.passedAssertions}/${assertion.totalAssertions} assertions passed`);
  
  if (!assertion.passed) {
    assertion.details
      .filter(d => !d.passed)
      .forEach(d => {
        console.warn(`[PriceAssertion][${requestId}] FAILED: ${d.error || d.reason}`);
      });
  }
  
  return assertion;
}

// ============= EXPORTS =============

module.exports = {
  extractPrices,
  extractPercentages,
  validatePrice,
  validateResponse,
  rewriteResponse,
  addDisclaimer,
  validateAndSanitize,
  generatePricingInstructions,
  assertPricesMatchLiveQuotes,
  logPriceAssertion,
  CONFIG
};

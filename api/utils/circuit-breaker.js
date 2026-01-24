/**
 * Circuit Breaker Pattern
 * 
 * Prevents cascading failures by:
 * - Tracking failure rates
 * - Opening circuit after threshold
 * - Testing with half-open state
 * - Providing fallback responses
 */

// Circuit states
const STATES = {
  CLOSED: 'closed',      // Normal operation
  OPEN: 'open',          // Failing, reject immediately
  HALF_OPEN: 'half-open' // Testing if service recovered
};

// Circuit storage
const circuits = new Map();

/**
 * Create or get a circuit breaker
 * 
 * @param {string} name - Unique circuit name
 * @param {Object} options - Configuration
 * @returns {Object} Circuit breaker instance
 */
function getCircuit(name, options = {}) {
  if (circuits.has(name)) {
    return circuits.get(name);
  }
  
  const circuit = {
    name,
    state: STATES.CLOSED,
    failures: 0,
    successes: 0,
    lastFailure: null,
    lastSuccess: null,
    
    // Configuration
    failureThreshold: options.failureThreshold || 5,
    successThreshold: options.successThreshold || 2,
    timeout: options.timeout || 30000,       // Reset timeout when open
    halfOpenMax: options.halfOpenMax || 3,   // Max concurrent in half-open
    halfOpenCurrent: 0
  };
  
  circuits.set(name, circuit);
  return circuit;
}

/**
 * Execute a function with circuit breaker protection
 * 
 * @param {string} name - Circuit name
 * @param {Function} fn - Async function to execute
 * @param {Function} fallback - Fallback function if circuit open
 * @param {Object} options - Circuit configuration
 * @returns {Promise} Result of fn or fallback
 */
async function withCircuitBreaker(name, fn, fallback, options = {}) {
  const circuit = getCircuit(name, options);
  const now = Date.now();
  
  // Check circuit state
  if (circuit.state === STATES.OPEN) {
    // Check if timeout has passed
    if (now - circuit.lastFailure > circuit.timeout) {
      // Move to half-open
      circuit.state = STATES.HALF_OPEN;
      circuit.halfOpenCurrent = 0;
    } else {
      // Circuit still open, use fallback
      console.log(`[Circuit ${name}] OPEN - using fallback`);
      return fallback ? fallback() : null;
    }
  }
  
  // In half-open state, limit concurrent requests
  if (circuit.state === STATES.HALF_OPEN) {
    if (circuit.halfOpenCurrent >= circuit.halfOpenMax) {
      console.log(`[Circuit ${name}] HALF-OPEN limit reached - using fallback`);
      return fallback ? fallback() : null;
    }
    circuit.halfOpenCurrent++;
  }
  
  try {
    const result = await fn();
    
    // Success - record it
    circuit.successes++;
    circuit.lastSuccess = now;
    
    if (circuit.state === STATES.HALF_OPEN) {
      circuit.halfOpenCurrent--;
      
      // Check if we should close the circuit
      if (circuit.successes >= circuit.successThreshold) {
        console.log(`[Circuit ${name}] CLOSED - recovered`);
        circuit.state = STATES.CLOSED;
        circuit.failures = 0;
        circuit.successes = 0;
      }
    }
    
    return result;
    
  } catch (error) {
    // Failure - record it
    circuit.failures++;
    circuit.lastFailure = now;
    
    if (circuit.state === STATES.HALF_OPEN) {
      circuit.halfOpenCurrent--;
      // Immediately reopen
      console.log(`[Circuit ${name}] OPEN - failed in half-open`);
      circuit.state = STATES.OPEN;
      circuit.successes = 0;
    } else if (circuit.failures >= circuit.failureThreshold) {
      // Open the circuit
      console.log(`[Circuit ${name}] OPEN - threshold reached (${circuit.failures} failures)`);
      circuit.state = STATES.OPEN;
    }
    
    // Use fallback if available
    if (fallback) {
      return fallback();
    }
    
    throw error;
  }
}

/**
 * Execute with timeout
 * 
 * @param {Function} fn - Async function
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} label - Label for error messages
 * @returns {Promise} Result or timeout error
 */
async function withTimeout(fn, timeoutMs, label = 'Operation') {
  return Promise.race([
    fn(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

/**
 * Execute multiple functions in parallel with individual timeouts
 * Returns results array with nulls for failed/timed out operations
 * 
 * @param {Array} tasks - Array of { fn, timeout, fallback, label }
 * @returns {Promise<Array>} Results array
 */
async function parallelWithTimeouts(tasks) {
  const promises = tasks.map(async (task) => {
    try {
      return await withTimeout(task.fn, task.timeout || 5000, task.label);
    } catch (error) {
      console.warn(`[Parallel] ${task.label || 'Task'} failed:`, error.message);
      return task.fallback !== undefined ? task.fallback : null;
    }
  });
  
  return Promise.all(promises);
}

/**
 * Get circuit status for monitoring
 */
function getCircuitStatus(name) {
  const circuit = circuits.get(name);
  if (!circuit) return null;
  
  return {
    name: circuit.name,
    state: circuit.state,
    failures: circuit.failures,
    successes: circuit.successes,
    lastFailure: circuit.lastFailure,
    lastSuccess: circuit.lastSuccess
  };
}

/**
 * Get all circuit statuses
 */
function getAllCircuitStatuses() {
  const statuses = {};
  for (const [name, circuit] of circuits) {
    statuses[name] = {
      state: circuit.state,
      failures: circuit.failures,
      successes: circuit.successes
    };
  }
  return statuses;
}

/**
 * Reset a circuit (for testing/admin)
 */
function resetCircuit(name) {
  const circuit = circuits.get(name);
  if (circuit) {
    circuit.state = STATES.CLOSED;
    circuit.failures = 0;
    circuit.successes = 0;
    circuit.halfOpenCurrent = 0;
  }
}

module.exports = {
  withCircuitBreaker,
  withTimeout,
  parallelWithTimeouts,
  getCircuitStatus,
  getAllCircuitStatuses,
  resetCircuit,
  STATES
};

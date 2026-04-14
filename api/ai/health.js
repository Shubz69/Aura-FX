/**
 * Comprehensive Health Check Endpoint for AURA AI Service
 * 
 * Checks:
 * - Perplexity API connectivity and model routing
 * - Database connectivity and connection pool health
 * - Data layer adapters (market data, calendar, news)
 * - Twelve Data env readiness
 * - Cache system status
 * - System resources
 */

const { getDbConnection } = require('../db');
const { getCached, setCached, getCacheStats } = require('../cache');
const {
  getPerplexityModelForChat,
  getPerplexityModelForReports,
  getPerplexityModelForDna,
  getPerplexityModelForVision,
  getPerplexityAutomationModel,
} = require('./perplexity-config');

// Try to load data service if available
let dataService = null;
try {
  dataService = require('./data-layer/data-service');
} catch (e) {
  // Data service not available
}

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const startTime = Date.now();

  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0', // Versioned health check
    environment: process.env.NODE_ENV || 'development',
    services: {
      perplexity: { status: 'unknown', latency: null },
      twelveData: { status: 'unknown' },
      database: { status: 'unknown', latency: null },
      cache: { status: 'unknown', stats: null },
      dataLayer: { status: 'unknown', adapters: {} }
    },
    uptime: process.uptime ? Math.floor(process.uptime()) : null,
    memory: null
  };

  // Get memory usage if available
  try {
    if (process.memoryUsage) {
      const mem = process.memoryUsage();
      healthStatus.memory = {
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB',
        rss: Math.round(mem.rss / 1024 / 1024) + 'MB'
      };
    }
  } catch (e) {
    // Ignore memory errors
  }

  // Check Perplexity connectivity
  const aiStartTime = Date.now();
  try {
    const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
    if (!PERPLEXITY_API_KEY) {
      healthStatus.services.perplexity = {
        status: 'error',
        message: 'API key not configured',
        latency: 0
      };
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        },
        body: JSON.stringify({
          model: getPerplexityModelForChat(),
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          temperature: 0,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`Perplexity HTTP ${response.status}`);
      }
      
      healthStatus.services.perplexity = {
        status: 'healthy',
        latency: Date.now() - aiStartTime,
        models: {
          chat: getPerplexityModelForChat(),
          reports: getPerplexityModelForReports(),
          dna: getPerplexityModelForDna(),
          vision: getPerplexityModelForVision(),
          automation: getPerplexityAutomationModel(),
        }
      };
    }
  } catch (aiError) {
    healthStatus.services.perplexity = {
      status: 'error',
      message: aiError.message || 'Connection failed',
      latency: Date.now() - aiStartTime
    };
    healthStatus.status = 'degraded';
  }

  const hasTwelveDataKey = String(process.env.TWELVE_DATA_API_KEY || '').trim().length > 0;
  const tdProbeStart = Date.now();
  let twelveDataProbe = {
    ok: false,
    latencyMs: null,
    httpStatus: null,
    symbol: String(process.env.TWELVE_DATA_HEALTH_SYMBOL || 'EURUSD').trim() || 'EURUSD',
    hint: null,
  };
  if (!hasTwelveDataKey) {
    twelveDataProbe.hint = 'missing_api_key';
  } else {
    try {
      const td = require('../market-data/providers/twelveDataClient');
      const sym = twelveDataProbe.symbol;
      const r = await td.fetchPrice(sym);
      twelveDataProbe.latencyMs = Date.now() - tdProbeStart;
      twelveDataProbe.httpStatus = r.status || 0;
      if (r.ok && r.data && (r.data.price != null || r.data.close != null)) {
        twelveDataProbe.ok = true;
      } else if (r.status === 429) {
        twelveDataProbe.hint = 'rate_limited';
      } else if (r.status === 402) {
        twelveDataProbe.hint = 'plan_or_credits';
      } else if (r.error) {
        twelveDataProbe.hint = String(r.error).slice(0, 120);
      } else {
        twelveDataProbe.hint = 'empty_or_invalid';
      }
    } catch (e) {
      twelveDataProbe.latencyMs = Date.now() - tdProbeStart;
      twelveDataProbe.hint = e.message || 'probe_failed';
    }
  }
  const tdServiceStatus =
    !hasTwelveDataKey ? 'degraded' :
    twelveDataProbe.ok ? 'healthy' :
    twelveDataProbe.hint === 'primary_disabled' ? 'degraded' :
    twelveDataProbe.hint === 'rate_limited' || twelveDataProbe.hint === 'plan_or_credits' ? 'degraded' :
    'error';
  healthStatus.services.twelveData = {
    status: tdServiceStatus,
    configured: hasTwelveDataKey,
    probe: twelveDataProbe,
  };
  if (hasTwelveDataKey && !twelveDataProbe.ok) {
    healthStatus.status = 'degraded';
  }

  // Check Database connectivity
  const dbStartTime = Date.now();
  let db = null;
  try {
    db = await getDbConnection();
    if (!db) {
      healthStatus.services.database = {
        status: 'error',
        message: 'Connection pool exhausted',
        latency: 0
      };
      healthStatus.status = 'degraded';
    } else {
      // Simple query to verify connectivity
      await Promise.race([
        db.execute('SELECT 1 as health_check'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);
      
      healthStatus.services.database = {
        status: 'healthy',
        latency: Date.now() - dbStartTime
      };
      
      // Release connection
      if (typeof db.release === 'function') {
        db.release();
      }
    }
  } catch (dbError) {
    healthStatus.services.database = {
      status: 'error',
      message: dbError.message || 'Connection failed',
      latency: Date.now() - dbStartTime
    };
    healthStatus.status = 'degraded';
    
    // Try to release connection
    if (db && typeof db.release === 'function') {
      try {
        db.release();
      } catch (e) {
        // Ignore release errors
      }
    }
  }

  // Check Cache status
  try {
    if (typeof getCacheStats === 'function') {
      healthStatus.services.cache = {
        status: 'healthy',
        stats: getCacheStats()
      };
    } else {
      // Test cache manually
      const testKey = '_health_check_test';
      const testValue = Date.now();
      setCached(testKey, testValue);
      const retrieved = getCached(testKey, 10000);
      
      healthStatus.services.cache = {
        status: retrieved === testValue ? 'healthy' : 'degraded',
        stats: { tested: true }
      };
    }
  } catch (cacheError) {
    healthStatus.services.cache = {
      status: 'error',
      message: cacheError.message || 'Cache error'
    };
  }

  // Check Data Layer adapters
  try {
    if (dataService && typeof dataService.getHealth === 'function') {
      const dataHealth = dataService.getHealth();
      healthStatus.services.dataLayer = {
        status: dataHealth.healthy ? 'healthy' : 'degraded',
        adapters: dataHealth.adapters || {}
      };
    } else {
      healthStatus.services.dataLayer = {
        status: 'unknown',
        message: 'Data service not available'
      };
    }
  } catch (dataError) {
    healthStatus.services.dataLayer = {
      status: 'error',
      message: dataError.message || 'Data layer error'
    };
  }

  // Determine overall status
  const criticalServices = ['perplexity', 'database'];
  const criticalHealthy = criticalServices.every(
    s => healthStatus.services[s]?.status === 'healthy'
  );
  
  const allServices = Object.values(healthStatus.services);
  const allHealthy = allServices.every(s => s.status === 'healthy' || s.status === 'unknown');
  const anyError = criticalServices.some(
    s => healthStatus.services[s]?.status === 'error'
  );
  
  if (anyError) {
    healthStatus.status = 'unhealthy';
  } else if (!criticalHealthy) {
    healthStatus.status = 'degraded';
  } else if (!allHealthy) {
    healthStatus.status = 'degraded';
  }

  // Add total check time
  healthStatus.checkDuration = Date.now() - startTime;

  // Return appropriate status code
  const statusCode = healthStatus.status === 'healthy' ? 200 : 
                     healthStatus.status === 'degraded' ? 200 : 503;

  return res.status(statusCode).json(healthStatus);
};

/**
 * POST /api/reports/generate
 * Generates a monthly AI report for the authenticated user.
 * Body: { year: number, month: number, csvData?: object (premium only) }
 *
 * Role logic:
 *   free    → blocked (403)
 *   premium → platform data auto + MT5 sections from CSV if uploaded
 *   elite   → full auto from platform data
 *   admin   → same as elite
 */

const { verifyToken } = require('../utils/auth');
const { executeQuery } = require('../db');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = 'gpt-4o';
const MIN_DATA_DAYS = 30;

function resolveRole(user) {
  const role = (user.role || '').toLowerCase();
  const plan = (user.subscription_plan || '').toLowerCase();
  if (['admin', 'super_admin'].includes(role)) return 'admin';
  if (['elite', 'a7fx'].includes(role) || ['elite', 'a7fx'].includes(plan)) return 'elite';
  if (['premium', 'aura'].includes(role) || ['premium', 'aura'].includes(plan)) return 'premium';
  return 'free';
}

function monthName(m) {
  return ['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1];
}

// ── Data aggregation ──────────────────────────────────────────────────────────

async function aggregateJournalTrades(userId, year, month) {
  const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];
  const [rows] = await executeQuery(
    `SELECT pair, tradeType, session, riskPct, rResult, dollarResult,
            followedRules, notes, emotional, date
     FROM journal_trades
     WHERE userId = ? AND date BETWEEN ? AND ?
     ORDER BY date`,
    [userId, startDate, endDate]
  ).catch(() => [[]]);
  return rows || [];
}

async function aggregateAIChartChecks(userId, year, month) {
  const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];
  const [rows] = await executeQuery(
    `SELECT checklist_type, overall_score, status_label, pair, created_at
     FROM ai_chart_checks
     WHERE user_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
    [userId, startDate, endDate]
  ).catch(() => [[]]);
  return rows || []; // table may not exist yet; catch handles it
}

async function aggregateJournalDaily(userId, year, month) {
  const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];
  const [rows] = await executeQuery(
    `SELECT mood, date
     FROM journal_daily
     WHERE userId = ? AND date BETWEEN ? AND ?`,
    [userId, startDate, endDate]
  ).catch(() => [[]]);
  return rows || [];
}


// ── Metric summaries ──────────────────────────────────────────────────────────

function summariseTrades(trades) {
  if (!trades.length) return null;
  const total = trades.length;
  // Win = positive rResult or positive dollarResult
  const wins = trades.filter(t => (parseFloat(t.rResult) || 0) > 0).length;
  const losses = trades.filter(t => (parseFloat(t.rResult) || 0) < 0).length;
  const pnlValues = trades.map(t => parseFloat(t.dollarResult) || 0);
  const totalPnl = pnlValues.reduce((a, b) => a + b, 0);
  const rrValues = trades.map(t => parseFloat(t.rResult)).filter(v => !isNaN(v) && v > 0);
  const avgRR = rrValues.length ? (rrValues.reduce((a, b) => a + b, 0) / rrValues.length).toFixed(2) : null;
  const pairs = [...new Set(trades.map(t => t.pair).filter(Boolean))];
  const sessions = trades.reduce((acc, t) => {
    if (t.session) acc[t.session] = (acc[t.session] || 0) + 1;
    return acc;
  }, {});
  const bestSession = Object.entries(sessions).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return {
    total, wins, losses,
    winRate: total ? Math.round((wins / total) * 100) : 0,
    totalPnl: totalPnl.toFixed(2),
    avgRR,
    topPairs: pairs.slice(0, 5),
    bestSession,
    profitFactor: losses > 0 ? (wins / losses).toFixed(2) : wins > 0 ? '∞' : '0',
  };
}

function summariseDiscipline(dailyRows) {
  if (!dailyRows.length) return null;
  const moodMap = { great: 5, good: 4, okay: 3, bad: 2, terrible: 1 };
  const moodVals = dailyRows
    .map(r => moodMap[(r.mood || '').toLowerCase()])
    .filter(v => v != null);
  const avgMoodNum = moodVals.length
    ? (moodVals.reduce((a, b) => a + b, 0) / moodVals.length).toFixed(1)
    : null;
  return {
    daysLogged: dailyRows.length,
    avgMood: avgMoodNum,
  };
}

function summariseChartChecks(checks) {
  if (!checks.length) return null;
  const scores = checks.map(c => c.overall_score || 0);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const byType = checks.reduce((acc, c) => {
    acc[c.checklist_type] = (acc[c.checklist_type] || 0) + 1;
    return acc;
  }, {});
  return {
    total: checks.length,
    avgScore: avg,
    byType,
    topStatus: checks.sort((a, b) => b.overall_score - a.overall_score)[0]?.status_label || null,
  };
}

// ── OpenAI report generation ──────────────────────────────────────────────────

async function generateReportContent({ role, user, year, month, tradeSummary, disciplineSummary, chartCheckSummary, csvSummary }) {
  const period = `${monthName(month)} ${year}`;
  const name = user.name || user.username || 'Trader';

  const dataSections = [];

  if (tradeSummary) {
    dataSections.push(`TRADE PERFORMANCE (${period}):
- Total Trades: ${tradeSummary.total}
- Win Rate: ${tradeSummary.winRate}%
- Total P&L: ${tradeSummary.totalPnl}
- Profit Factor: ${tradeSummary.profitFactor}
- Average R:R: ${tradeSummary.avgRR || 'N/A'}
- Top Pairs: ${tradeSummary.topPairs.join(', ') || 'N/A'}
- Best Session: ${tradeSummary.bestSession || 'N/A'}`);
  }

  if (disciplineSummary) {
    dataSections.push(`DISCIPLINE & JOURNAL METRICS:
- Days Logged: ${disciplineSummary.daysLogged}
- Avg Mood Score: ${disciplineSummary.avgMood ?? 'N/A'} / 5`);
  }

  if (chartCheckSummary) {
    dataSections.push(`AI CHART CHECK ACTIVITY:
- Total Chart Checks: ${chartCheckSummary.total}
- Average Checklist Score: ${chartCheckSummary.avgScore}%
- By Type: ${JSON.stringify(chartCheckSummary.byType)}`);
  }

  if (csvSummary) {
    dataSections.push(`MT5 PERFORMANCE DATA (CSV):
${typeof csvSummary === 'string' ? csvSummary : JSON.stringify(csvSummary, null, 2)}`);
  }

  if (!dataSections.length) {
    dataSections.push('No significant data was found for this period. Report will focus on general guidance.');
  }

  const prompt = `You are a professional trading performance analyst. Generate a structured monthly performance report for a ${role} plan trader named "${name}" for the period: ${period}.

AVAILABLE DATA:
${dataSections.join('\n\n')}

Generate a complete monthly report with these exact sections. Return strict JSON only (no markdown, no code blocks):
{
  "coverTitle": "${period} Monthly Trading Report",
  "traderName": "${name}",
  "period": "${period}",
  "reportType": "${role}",
  "generatedDate": "${new Date().toISOString().split('T')[0]}",
  "executiveSummary": {
    "overallAssessment": "<2-3 sentences>",
    "strongestArea": "<one specific strength>",
    "weakestArea": "<one specific weakness>",
    "keyFocus": "<one actionable focus for next month>"
  },
  "performanceSummary": {
    "headline": "<1 sentence summary>",
    "keyMetrics": [{"label": "...", "value": "..."}],
    "insights": ["<insight 1>", "<insight 2>", "<insight 3>"]
  },
  "disciplineReview": {
    "headline": "<1 sentence>",
    "patterns": ["<pattern 1>", "<pattern 2>"],
    "strengths": ["<strength 1>"],
    "improvements": ["<improvement 1>", "<improvement 2>"]
  },
  "aiChartCheckReview": {
    "headline": "<1 sentence or 'No AI Chart Check activity this period'>",
    "avgAlignment": "<score or N/A>",
    "recurringStrengths": ["<strength>"],
    "recurringGaps": ["<gap>"]
  },
  "mt5Review": ${csvSummary ? `{
    "headline": "<MT5 headline>",
    "insights": ["<insight>"]
  }` : 'null'},
  "improvementPlan": [
    {"area": "<area>", "action": "<specific actionable step>", "priority": "high|medium|low"},
    {"area": "<area>", "action": "<specific actionable step>", "priority": "high|medium|low"},
    {"area": "<area>", "action": "<specific actionable step>", "priority": "high|medium|low"}
  ],
  "disclaimer": "This report is generated by AI using your platform data. It is for educational and self-improvement purposes only and does not constitute financial advice. Past performance does not guarantee future results."
}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`OpenAI error ${response.status}`);
  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || '';
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

// ── Main handler ──────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  if (!OPENAI_API_KEY) return res.status(500).json({ success: false, message: 'AI service not configured' });

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) return res.status(401).json({ success: false, message: 'Authentication required' });
  const userId = decoded.id;

  const { year, month } = req.body || {};
  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ success: false, message: 'year and month (1–12) are required' });
  }

  try {
    // Load user
    const [users] = await executeQuery(
      'SELECT id, role, subscription_plan, name, username, created_at FROM users WHERE id = ?',
      [userId]
    );
    if (!users?.length) return res.status(404).json({ success: false, message: 'User not found' });
    const user = users[0];
    const role = resolveRole(user);

    // Free users blocked
    if (role === 'free') {
      return res.status(403).json({
        success: false,
        code: 'FREE_PLAN',
        message: 'Monthly AI reports are available on Premium and Elite plans.',
      });
    }

    // Check 30-day minimum
    const [tradeDayRows] = await executeQuery(
      `SELECT DATEDIFF(NOW(), MIN(date)) AS data_days FROM journal_trades WHERE userId = ?`,
      [userId]
    ).catch(() => [[{ data_days: 0 }]]);
    const dataDays = tradeDayRows?.[0]?.data_days || 0;
    if (dataDays < MIN_DATA_DAYS) {
      return res.status(403).json({
        success: false,
        code: 'INSUFFICIENT_DATA',
        dataDays,
        minDataDays: MIN_DATA_DAYS,
        message: `You need at least ${MIN_DATA_DAYS} days of data to generate a report. You currently have ${dataDays} days.`,
      });
    }

    // Prevent duplicate for same period
    const [existing] = await executeQuery(
      'SELECT id, status FROM monthly_reports WHERE user_id = ? AND period_year = ? AND period_month = ?',
      [userId, year, month]
    ).catch(() => [[]]);
    if (existing?.[0]?.status === 'ready') {
      return res.status(409).json({
        success: false,
        code: 'ALREADY_EXISTS',
        reportId: existing[0].id,
        message: 'A report for this period already exists.',
      });
    }

    // Mark as generating
    await executeQuery(
      `INSERT INTO monthly_reports (user_id, period_year, period_month, report_type, status)
       VALUES (?, ?, ?, ?, 'generating')
       ON DUPLICATE KEY UPDATE status = 'generating', generated_at = NULL`,
      [userId, year, month, role]
    );

    // Aggregate data
    const [trades, dailyEntries, chartChecks] = await Promise.all([
      aggregateJournalTrades(userId, year, month),
      aggregateJournalDaily(userId, year, month),
      aggregateAIChartChecks(userId, year, month),
    ]);

    const tradeSummary = summariseTrades(trades);
    const disciplineSummary = summariseDiscipline(dailyEntries);
    const chartCheckSummary = summariseChartChecks(chartChecks);

    // CSV data for premium (optional)
    let csvSummary = null;
    if (role === 'premium') {
      const [csvRows] = await executeQuery(
        'SELECT upload_json FROM report_csv_uploads WHERE user_id = ? AND period_year = ? AND period_month = ?',
        [userId, year, month]
      ).catch(() => [[]]);
      if (csvRows?.[0]?.upload_json) {
        try { csvSummary = JSON.parse(csvRows[0].upload_json); } catch {}
      }
    }

    // Generate with OpenAI
    const reportContent = await generateReportContent({
      role, user, year, month,
      tradeSummary, disciplineSummary, chartCheckSummary, csvSummary,
    });

    // Save
    await executeQuery(
      `UPDATE monthly_reports
       SET status = 'ready', content_json = ?, generated_at = NOW()
       WHERE user_id = ? AND period_year = ? AND period_month = ?`,
      [JSON.stringify(reportContent), userId, year, month]
    );

    return res.status(200).json({ success: true, report: reportContent, year, month });
  } catch (err) {
    console.error('[reports/generate]', err.message);
    // Mark as failed
    await executeQuery(
      `UPDATE monthly_reports SET status = 'failed' WHERE user_id = ? AND period_year = ? AND period_month = ?`,
      [userId, year, month]
    ).catch(() => {});
    return res.status(500).json({ success: false, message: 'Report generation failed. Please try again.' });
  }
};

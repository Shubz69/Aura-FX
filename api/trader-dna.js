/**
 * Trader DNA API
 * GET  — eligibility, progress, latest snapshot metadata + payload
 * POST — generate new snapshot (90-day cycle, strict data rules)
 */
const { verifyToken } = require('./utils/auth');
const { executeQuery } = require('./db');
const { applyScheduledDowngrade } = require('./utils/apply-scheduled-downgrade');
const { canAccessTraderDna } = require('./reports/resolveReportsRole');
const {
  CYCLE_DAYS,
  ANALYSIS_DAYS,
  computeDataProgress,
  buildQualificationGaps,
  buildDnaPayload,
  addDaysIso,
} = require('./trader-dna/dnaEngine');
const { enrichDnaPayloadWithOpenAI } = require('./trader-dna/dnaOpenAi');

function parseBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try {
    const raw = typeof req.body === 'string' ? req.body : req.body.toString();
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

async function ensureTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS trader_dna_snapshots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      payload_json LONGTEXT NOT NULL,
      overall_score DECIMAL(6,2) DEFAULT NULL,
      archetype VARCHAR(160) DEFAULT NULL,
      analysis_window_start DATE NULL,
      analysis_window_end DATE NULL,
      generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      next_eligible_at DATETIME NOT NULL,
      previous_snapshot_id INT NULL,
      INDEX idx_user_generated (user_id, generated_at DESC),
      INDEX idx_user_next (user_id, next_eligible_at)
    )
  `).catch(() => {});
}

function mapTradeRow(r) {
  return {
    id: r.id,
    pair: r.pair,
    session: r.session,
    direction: r.direction,
    result: r.result,
    pnl: r.pnl != null ? Number(r.pnl) : 0,
    rMultiple: r.r_multiple != null ? Number(r.r_multiple) : null,
    checklistPercent: r.checklist_percent != null ? Number(r.checklist_percent) : null,
    checklistScore: r.checklist_score ?? 0,
    checklistTotal: r.checklist_total ?? 0,
    riskPercent: Number(r.risk_percent),
    rr: Number(r.rr),
    stopLoss: r.stop_loss,
    createdAt: r.created_at,
  };
}

async function loadTrades(userId) {
  const [rows] = await executeQuery(
    `SELECT id, pair, session, direction, result, pnl, r_multiple, checklist_percent, checklist_score, checklist_total,
            risk_percent, rr, stop_loss, created_at
     FROM aura_analysis_trades
     WHERE user_id = ? AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 120 DAY)
     ORDER BY created_at ASC`,
    [userId]
  );
  return (rows || []).map(mapTradeRow);
}

async function loadJournal(userId) {
  const [rows] = await executeQuery(
    `SELECT date, mood, notes FROM journal_daily
     WHERE userId = ? AND date >= DATE_SUB(CURDATE(), INTERVAL 120 DAY)`,
    [userId]
  );
  return rows || [];
}

function formatRemaining(nextEligible) {
  const t = new Date(nextEligible).getTime();
  const now = Date.now();
  const ms = Math.max(0, t - now);
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const months = Math.floor(days / 30);
  const remDays = days % 30;
  let label = '';
  if (days >= 60) {
    label = `${months} month${months !== 1 ? 's' : ''}${remDays > 0 ? ` ${remDays} day${remDays !== 1 ? 's' : ''}` : ''} remaining`;
  } else if (days >= 1) {
    label = `${days} day${days !== 1 ? 's' : ''}${hours > 0 ? ` ${hours}h` : ''} remaining`;
  } else {
    label = hours > 0 ? `${hours} hour${hours !== 1 ? 's' : ''} remaining` : 'Soon';
  }
  return { days, hours, totalMs: ms, label, nextAvailableOn: new Date(nextEligible).toISOString() };
}

async function assertTraderDnaEntitlement(userId, res) {
  const user = await applyScheduledDowngrade(userId);
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return null;
  }
  if (!canAccessTraderDna(user)) {
    res.status(403).json({
      success: false,
      code: 'ELITE_REQUIRED',
      message:
        'Trader DNA is included with A7FX Elite only. Upgrade to Elite to unlock your behavioural and execution synthesis — Premium does not include this feature.',
    });
    return null;
  }
  return user;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  const userId = Number(decoded.id);

  try {
    await ensureTable();
  } catch (e) {
    console.error('[trader-dna] schema', e);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  if (req.method === 'GET') {
    const entitled = await assertTraderDnaEntitlement(userId, res);
    if (!entitled) return;
    try {
      const dataHealth = { tradesOk: true, journalOk: true, errors: [] };

      let trades = [];
      try {
        trades = await loadTrades(userId);
      } catch (e) {
        console.error('[trader-dna] loadTrades', e);
        dataHealth.tradesOk = false;
        dataHealth.errors.push({
          source: 'trades',
          message: 'We could not load your trade history from the database. DNA counts may be incomplete.',
        });
      }

      let journal = [];
      try {
        journal = await loadJournal(userId);
      } catch (e) {
        console.error('[trader-dna] loadJournal', e);
        dataHealth.journalOk = false;
        dataHealth.errors.push({
          source: 'journal',
          message: 'We could not load your journal entries. Psychology metrics may be incomplete.',
        });
      }

      const progress = computeDataProgress(trades, journal);
      const dataBlocked = !dataHealth.tradesOk && !dataHealth.journalOk;
      const qualificationGaps =
        dataBlocked || !dataHealth.tradesOk ? [] : buildQualificationGaps(progress);
      const dataLookbackDays = 120;

      const [snapRows] = await executeQuery(
        `SELECT id, payload_json, overall_score, archetype, analysis_window_start, analysis_window_end,
                generated_at, next_eligible_at, previous_snapshot_id
         FROM trader_dna_snapshots WHERE user_id = ? ORDER BY generated_at DESC LIMIT 2`,
        [userId]
      ).catch(() => [[]]);

      const latest = snapRows?.[0] || null;
      const previous = snapRows?.[1] || null;
      const now = Date.now();
      let nextEligible = latest?.next_eligible_at ? new Date(latest.next_eligible_at).getTime() : null;
      const inCooldown = latest && nextEligible && now < nextEligible;

      let latestPayload = null;
      let snapshotCorrupt = false;
      if (latest?.payload_json) {
        try {
          latestPayload = JSON.parse(latest.payload_json);
        } catch (e) {
          console.error('[trader-dna] parse latest payload', e);
          latestPayload = null;
          snapshotCorrupt = String(latest.payload_json || '').trim().length > 0;
        }
      }

      let previousPayload = null;
      if (previous?.payload_json) {
        try {
          previousPayload = JSON.parse(previous.payload_json);
        } catch {
          previousPayload = null;
        }
      }

      let status = 'INSUFFICIENT_DATA';
      let statusMessage =
        'More validated trading activity and journal coverage is required before Trader DNA can be formed.';

      if (dataBlocked) {
        status = 'DATA_LOAD_FAILED';
        statusMessage =
          'Trader DNA could not read your platform data. Check your connection and try again. If this persists, contact support.';
      } else if (inCooldown) {
        status = 'COOLDOWN';
        statusMessage = 'Your current DNA reading is active. The next full refresh unlocks after the cycle completes.';
        if (snapshotCorrupt) {
          statusMessage =
            'A DNA snapshot is on file but could not be read. After this cycle ends, run synthesis again to rebuild it.';
        } else if (progress.meetsMinimumData) {
          statusMessage +=
            ' You already have enough fresh data for the next cycle — it will become available when the countdown ends.';
        }
      } else if (latest && !progress.meetsMinimumData) {
        status = 'INSUFFICIENT_FOR_NEXT_CYCLE';
        statusMessage =
          'The next DNA cycle is open, but your last ~3 months of data do not yet meet minimum quality. Use the checklist below — Trade Validator + journal are the main levers.';
      } else if (progress.meetsMinimumData) {
        status = latest ? 'READY_TO_GENERATE' : 'READY_FIRST_GENERATION';
        statusMessage = latest
          ? 'You are eligible to generate a new Trader DNA reading for this cycle.'
          : 'You have enough data for your first Trader DNA reading.';
        if (snapshotCorrupt && !latestPayload) {
          status = 'READY_TO_GENERATE';
          statusMessage =
            'Your last snapshot could not be displayed, but you can run a new synthesis now to rebuild your DNA.';
        }
      }

      const loadWarning =
        !dataBlocked && !dataHealth.tradesOk
          ? 'Trade history failed to load; counts below may be wrong until the database responds.'
          : !dataBlocked && !dataHealth.journalOk
            ? 'Journal failed to load; add journal days in /journal — psychology metrics may be understated until it loads.'
            : null;

      let remaining = null;
      if (inCooldown && latest?.next_eligible_at) {
        remaining = formatRemaining(latest.next_eligible_at);
      }

      const meetsMinimum = dataHealth.tradesOk && progress.meetsMinimumData;

      return res.status(200).json({
        success: true,
        status,
        statusMessage,
        loadWarning,
        cycleDays: CYCLE_DAYS,
        analysisWindowDays: ANALYSIS_DAYS,
        analysisWindowNote:
          'DNA eligibility uses your last ~90 days (~3 months) of validated trades plus journal coverage; we load up to 120 days from the database.',
        progress,
        qualificationGaps,
        dataHealth,
        dataLookbackDays,
        snapshotCorrupt,
        persistenceNote: 'Each successful synthesis is saved to your account for the active cycle.',
        cooldown: inCooldown
          ? {
              active: true,
              remaining,
            }
          : { active: false, remaining: null },
        canGenerateNow: Boolean(!inCooldown && meetsMinimum),
        latestSnapshot: latest
          ? {
              id: latest.id,
              overallScore: latest.overall_score != null ? Number(latest.overall_score) : null,
              archetype: latest.archetype,
              generatedAt: latest.generated_at,
              nextEligibleAt: latest.next_eligible_at,
              analysisWindowStart: latest.analysis_window_start,
              analysisWindowEnd: latest.analysis_window_end,
            }
          : null,
        report: latestPayload,
        previousReportSummary: previousPayload
          ? {
              archetype: previousPayload.archetype,
              overallDNA: previousPayload.scores?.overallDNA,
              generatedAt: previousPayload.generatedAt,
            }
          : null,
      });
    } catch (err) {
      console.error('[trader-dna] GET', err);
      return res.status(500).json({ success: false, message: 'Failed to load Trader DNA' });
    }
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    const confirm = body.confirm === true || body.confirm === 'true';
    if (!confirm) {
      return res.status(400).json({ success: false, message: 'Set confirm: true to generate DNA' });
    }
    const entitled = await assertTraderDnaEntitlement(userId, res);
    if (!entitled) return;
    try {
      let trades = [];
      let journal = [];
      try {
        trades = await loadTrades(userId);
      } catch (e) {
        console.error('[trader-dna] POST trades', e);
        return res.status(503).json({
          success: false,
          code: 'TRADES_LOAD_FAILED',
          message: 'Could not load trades to generate DNA. Try again in a moment.',
        });
      }
      try {
        journal = await loadJournal(userId);
      } catch (e) {
        console.error('[trader-dna] POST journal', e);
        return res.status(503).json({
          success: false,
          code: 'JOURNAL_LOAD_FAILED',
          message: 'Could not load journal data to generate DNA. Try again in a moment.',
        });
      }
      const progress = computeDataProgress(trades, journal);

      const [snapRows] = await executeQuery(
        `SELECT id, payload_json, next_eligible_at FROM trader_dna_snapshots WHERE user_id = ? ORDER BY generated_at DESC LIMIT 1`,
        [userId]
      ).catch(() => [[]]);
      const latest = snapRows?.[0] || null;
      const now = Date.now();
      if (latest?.next_eligible_at) {
        const ne = new Date(latest.next_eligible_at).getTime();
        if (now < ne) {
          return res.status(403).json({
            success: false,
            code: 'CYCLE_ACTIVE',
            message: 'Trader DNA can only be regenerated after the current cycle ends.',
            remaining: formatRemaining(latest.next_eligible_at),
          });
        }
      }

      if (!progress.meetsMinimumData) {
        return res.status(403).json({
          success: false,
          code: 'INSUFFICIENT_DATA',
          message: 'Not enough validated data in the last ~90 days to generate Trader DNA. Close more trades in Trade Validator and add journal days.',
          progress,
          qualificationGaps: buildQualificationGaps(progress),
        });
      }

      let previousPayload = null;
      if (latest?.payload_json) {
        try {
          previousPayload = JSON.parse(latest.payload_json);
        } catch {
          previousPayload = null;
        }
      }

      let payload = buildDnaPayload(trades, journal, previousPayload, new Date().toISOString());
      try {
        payload = await enrichDnaPayloadWithOpenAI(payload);
      } catch (e) {
        console.warn('[trader-dna] OpenAI enrich skipped:', e.message);
      }

      const nextEligibleAt = addDaysIso(new Date(), CYCLE_DAYS);
      const wStart = payload.analysisWindow?.start || null;
      const wEnd = payload.analysisWindow?.end || null;

      const [insertPacket] = await executeQuery(
        `INSERT INTO trader_dna_snapshots
         (user_id, payload_json, overall_score, archetype, analysis_window_start, analysis_window_end, next_eligible_at, previous_snapshot_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          JSON.stringify(payload),
          payload.scores.overallDNA,
          payload.archetype,
          wStart,
          wEnd,
          nextEligibleAt.slice(0, 19).replace('T', ' '),
          latest?.id || null,
        ]
      );

      const insertMeta = insertPacket && typeof insertPacket === 'object' ? insertPacket : {};
      const savedOk =
        insertMeta.affectedRows === 1 || (Number(insertMeta.insertId) > 0 && insertMeta.affectedRows !== 0);
      if (!savedOk) {
        console.error('[trader-dna] INSERT did not confirm row', insertMeta);
        return res.status(500).json({
          success: false,
          code: 'PERSIST_FAILED',
          message: 'DNA was computed but not saved to the database. Please try again.',
        });
      }

      return res.status(200).json({
        success: true,
        report: payload,
        nextEligibleAt,
        progress,
        savedSnapshotId: insertMeta.insertId ?? null,
      });
    } catch (err) {
      console.error('[trader-dna] POST', err);
      return res.status(500).json({ success: false, message: 'Failed to generate Trader DNA' });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};

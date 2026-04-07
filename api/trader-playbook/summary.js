/**
 * GET /api/trader-playbook/summary — aggregated playbook discipline stats (real trade rows only).
 */

const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const { migratePlaybookColumns, ensureMTradesTable } = require('./schema');

async function ensureTradeTagColumns() {
  const alters = [
    "ALTER TABLE aura_analysis_trades ADD COLUMN playbook_setup_id CHAR(36) DEFAULT NULL",
    "ALTER TABLE aura_analysis_trades ADD COLUMN setup_tag_type VARCHAR(20) DEFAULT NULL",
    "ALTER TABLE aura_analysis_trades ADD INDEX idx_aa_pb_tag (user_id, setup_tag_type, playbook_setup_id)",
    "ALTER TABLE journal_trades ADD COLUMN playbook_setup_id CHAR(36) DEFAULT NULL",
    "ALTER TABLE journal_trades ADD COLUMN setup_tag_type VARCHAR(20) DEFAULT NULL",
    "ALTER TABLE journal_trades ADD INDEX idx_journal_pb_tag (userId, setup_tag_type, playbook_setup_id)",
  ];
  for (const sql of alters) {
    try {
      await executeQuery(sql);
    } catch (_) {
      /* exists */
    }
  }
}

function safeNum(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function aggregateValidatorTrades(rows) {
  const byPlaybook = {};
  let tagged = 0;
  let noSetup = 0;
  let untagged = 0;
  const allTaggedPnl = [];

  for (const r of rows) {
    const tag = (r.setup_tag_type || '').toUpperCase();
    const pid = r.playbook_setup_id || null;
    if (tag === 'NO_SETUP') {
      noSetup += 1;
      continue;
    }
    if (tag === 'PLAYBOOK' && pid) {
      tagged += 1;
      const pnl = safeNum(r.pnl);
      const res = (r.result || '').toLowerCase();
      const rm = safeNum(r.r_multiple);
      if (!byPlaybook[pid]) {
        byPlaybook[pid] = {
          source: 'validator',
          wins: 0,
          losses: 0,
          breakevens: 0,
          totalPnl: 0,
          grossProfit: 0,
          grossLoss: 0,
          rSum: 0,
          rCount: 0,
          count: 0,
        };
      }
      const b = byPlaybook[pid];
      b.count += 1;
      if (res === 'win') b.wins += 1;
      else if (res === 'loss') b.losses += 1;
      else if (res === 'breakeven') b.breakevens += 1;
      b.totalPnl += pnl;
      if (pnl > 0) b.grossProfit += pnl;
      if (pnl < 0) b.grossLoss += -pnl;
      if (['win', 'loss', 'breakeven'].includes(res)) {
        allTaggedPnl.push(pnl);
        if (rm !== 0 || res !== 'breakeven') {
          b.rSum += rm;
          b.rCount += 1;
        }
      }
      continue;
    }
    untagged += 1;
  }

  return { byPlaybook, tagged, noSetup, untagged, allTaggedPnl };
}

function aggregateJournalTrades(rows) {
  const byPlaybook = {};
  let tagged = 0;
  let noSetup = 0;
  let untagged = 0;

  for (const r of rows) {
    const tag = (r.setup_tag_type || '').toUpperCase();
    const pid = r.playbook_setup_id || null;
    if (tag === 'NO_SETUP') {
      noSetup += 1;
      continue;
    }
    if (tag === 'PLAYBOOK' && pid) {
      tagged += 1;
      const rVal = safeNum(r.rResult);
      const isWin = rVal > 0;
      const isLoss = rVal < 0;
      const isBe = rVal === 0;
      if (!byPlaybook[pid]) {
        byPlaybook[pid] = {
          source: 'journal',
          wins: 0,
          losses: 0,
          breakevens: 0,
          totalR: 0,
          count: 0,
        };
      }
      const b = byPlaybook[pid];
      b.count += 1;
      if (isWin) b.wins += 1;
      else if (isLoss) b.losses += 1;
      else b.breakevens += 1;
      b.totalR += rVal;
      continue;
    }
    untagged += 1;
  }

  return { byPlaybook, tagged, noSetup, untagged };
}

function mergePlaybookMetrics(nameMap, vAgg, jAgg) {
  const ids = new Set([...Object.keys(vAgg.byPlaybook), ...Object.keys(jAgg.byPlaybook)]);
  const list = [];
  for (const id of ids) {
    const v = vAgg.byPlaybook[id];
    const j = jAgg.byPlaybook[id];
    const wins = (v?.wins || 0) + (j?.wins || 0);
    const losses = (v?.losses || 0) + (j?.losses || 0);
    const breakevens = (v?.breakevens || 0) + (j?.breakevens || 0);
    const closed = wins + losses + breakevens;
    const winRate = closed > 0 ? wins / closed : null;
    const grossProfit = v?.grossProfit || 0;
    const grossLoss = v?.grossLoss || 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : null;
    const totalPnl = v?.totalPnl || 0;
    const expectancyDollar = closed > 0 && v ? totalPnl / closed : null;
    const jClosed = (j?.wins || 0) + (j?.losses || 0) + (j?.breakevens || 0);
    const expectancyR = jClosed > 0 ? (j?.totalR || 0) / jClosed : null;
    const rSum = v?.rSum || 0;
    const rCount = v?.rCount || 0;
    const avgR = rCount > 0 ? rSum / rCount : jClosed > 0 ? (j?.totalR || 0) / jClosed : null;

    list.push({
      playbookId: id,
      name: nameMap[id] || 'Playbook',
      taggedTrades: (v?.count || 0) + (j?.count || 0),
      wins,
      losses,
      breakevens,
      winRate,
      profitFactor,
      expectancyDollar,
      expectancyR,
      totalPnl,
      avgR,
    });
  }

  list.sort((a, b) => (b.taggedTrades || 0) - (a.taggedTrades || 0));

  let best = null;
  let worst = null;
  for (const p of list) {
    const score =
      p.expectancyDollar != null && Number.isFinite(p.expectancyDollar)
        ? p.expectancyDollar
        : p.expectancyR != null && Number.isFinite(p.expectancyR)
          ? p.expectancyR
          : null;
    if (p.taggedTrades === 0 || score == null) continue;
    if (!best || score > best.score) best = { id: p.playbookId, name: p.name, score };
    if (!worst || score < worst.score) worst = { id: p.playbookId, name: p.name, score };
  }

  return { perPlaybook: list, best, worst };
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const userId = Number(decoded.id);

  try {
    await migratePlaybookColumns();
    await ensureMTradesTable();
    await ensureTradeTagColumns();
  } catch (e) {
    console.error('summary schema', e);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  try {
    const [playbooks] = await executeQuery(
      'SELECT id, name, status, lastUsedAt FROM trader_playbook_setups WHERE userId = ?',
      [userId]
    );
    const nameMap = {};
    for (const p of playbooks || []) nameMap[p.id] = p.name;

    let vRows = [];
    let jRows = [];
    try {
      const [vr] = await executeQuery(
        `SELECT id, pnl, result, r_multiple, playbook_setup_id, setup_tag_type
         FROM aura_analysis_trades WHERE user_id = ? ORDER BY created_at DESC LIMIT 2000`,
        [userId]
      );
      vRows = vr || [];
    } catch (_) {
      vRows = [];
    }
    try {
      const [jr] = await executeQuery(
        `SELECT id, rResult, playbook_setup_id, setup_tag_type FROM journal_trades WHERE userId = ? ORDER BY date DESC LIMIT 2000`,
        [userId]
      );
      jRows = jr || [];
    } catch (_) {
      jRows = [];
    }

    const vAgg = aggregateValidatorTrades(vRows);
    const jAgg = aggregateJournalTrades(jRows);
    const merged = mergePlaybookMetrics(nameMap, vAgg, jAgg);

    let mCount = 0;
    try {
      const [mc] = await executeQuery(
        'SELECT COUNT(*) AS c FROM trader_playbook_m_trades WHERE userId = ?',
        [userId]
      );
      mCount = mc?.[0]?.c != null ? Number(mc[0].c) : 0;
    } catch (_) {
      mCount = 0;
    }

    const playbooksTotal = playbooks?.length || 0;
    const playbooksActive = (playbooks || []).filter((p) => (p.status || 'active') !== 'archived').length;
    const st = (r) => String(r?.status || 'active').toLowerCase();
    const playbooksByStatus = {
      active: (playbooks || []).filter((p) => {
        const s = st(p);
        return s !== 'draft' && s !== 'archived';
      }).length,
      draft: (playbooks || []).filter((p) => st(p) === 'draft').length,
      archived: (playbooks || []).filter((p) => st(p) === 'archived').length,
    };
    const taggedTrades = vAgg.tagged + jAgg.tagged;
    const noSetupTrades = vAgg.noSetup + jAgg.noSetup;
    const unclassifiedTrades = vAgg.untagged + jAgg.untagged;

    const taggedClosed = merged.perPlaybook.reduce((s, p) => s + p.wins + p.losses + p.breakevens, 0);
    const taggedWins = merged.perPlaybook.reduce((s, p) => s + p.wins, 0);
    const globalWinRate = taggedClosed > 0 ? taggedWins / taggedClosed : null;

    let globalPF = null;

    let sumGrossProfit = 0;
    let sumGrossLoss = 0;
    for (const p of merged.perPlaybook) {
      const v = vAgg.byPlaybook[p.playbookId];
      if (v) {
        sumGrossProfit += v.grossProfit || 0;
        sumGrossLoss += v.grossLoss || 0;
      }
    }
    if (sumGrossLoss > 0) globalPF = sumGrossProfit / sumGrossLoss;
    else if (sumGrossProfit > 0) globalPF = null;

    const adherenceRate = taggedTrades + noSetupTrades > 0 ? taggedTrades / (taggedTrades + noSetupTrades) : null;
    const classified = taggedTrades + noSetupTrades + unclassifiedTrades;

    let processGapLabel = null;
    if (classified >= 6) {
      if (unclassifiedTrades >= 6 && unclassifiedTrades > noSetupTrades * 1.2) {
        processGapLabel = 'Unclassified executions are the dominant gap — finish tagging before optimising rules.';
      } else if (adherenceRate != null && adherenceRate < 0.72 && taggedTrades + noSetupTrades >= 10) {
        processGapLabel = 'Playbook adherence is below typical institutional discipline — review No Setup drivers.';
      } else if (mCount >= 4 && taggedTrades >= 10 && mCount / taggedTrades > 0.25) {
        processGapLabel = 'Missed opportunities are frequent versus live executions — tighten prep and alerts.';
      } else if (noSetupTrades >= 6 && (noSetupTrades / Math.max(1, taggedTrades)) > 0.3) {
        processGapLabel = 'No-setup trades are elevated — re-check guardrails and impulse triggers.';
      }
    }

    return res.status(200).json({
      success: true,
      summary: {
        playbooksTotal,
        playbooksActive,
        playbooksByStatus,
        taggedTrades,
        noSetupTrades,
        missedTrades: mCount,
        unclassifiedTrades,
        bestPlaybook: merged.best,
        worstPlaybook: merged.worst,
        globalWinRate,
        globalProfitFactor: globalPF,
        perPlaybook: merged.perPlaybook,
        validatorBreakdown: {
          tagged: vAgg.tagged,
          noSetup: vAgg.noSetup,
          unclassified: vAgg.untagged,
          sampleSize: vRows.length,
        },
        journalBreakdown: {
          tagged: jAgg.tagged,
          noSetup: jAgg.noSetup,
          unclassified: jAgg.untagged,
          sampleSize: jRows.length,
        },
        disciplineTaggedVsAll:
          taggedTrades + noSetupTrades + unclassifiedTrades > 0
            ? taggedTrades / (taggedTrades + noSetupTrades + unclassifiedTrades)
            : null,
        noSetupRate:
          taggedTrades + noSetupTrades > 0 ? noSetupTrades / (taggedTrades + noSetupTrades) : null,
        adherenceRate,
        processGapLabel,
      },
    });
  } catch (e) {
    console.error('trader-playbook summary', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

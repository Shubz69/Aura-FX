/**
 * Journal XP check – award day/week/month completion XP when min 5 tasks.
 * GET /api/journal/xp-check?date=YYYY-MM-DD
 */

const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const { XP, awardOnce } = require('./xp-helper');
const { getJournalContext } = require('../utils/journalWriteGuard');

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = d.getDate() - (day === 0 ? 7 : day) + 1;
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function getMonthStart(dateStr) {
  return dateStr.slice(0, 7) + '-01';
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

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded || !decoded.id) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  const userId = Number(decoded.id);

  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const date = url.searchParams.get('date') || null;
  if (!date) {
    return res.status(400).json({ success: false, message: 'date query required' });
  }
  const dateStr = String(date).trim().slice(0, 10);
  const jctx = await getJournalContext(userId);
  const mayAward = jctx.bypassJournalDateLock || dateStr === jctx.todayYyyyMmDd;

  const weekStart = getWeekStart(dateStr);
  const monthStart = getMonthStart(dateStr);

  const lastDayOfMonth = new Date(dateStr.slice(0, 7) + '-01');
  lastDayOfMonth.setMonth(lastDayOfMonth.getMonth() + 1);
  lastDayOfMonth.setDate(0);
  const monthEnd = lastDayOfMonth.toISOString().slice(0, 10);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const [dayRows] = await executeQuery(
    'SELECT completed FROM journal_tasks WHERE userId = ? AND date = ?',
    [userId, dateStr]
  );
  const [weekRows] = await executeQuery(
    'SELECT completed FROM journal_tasks WHERE userId = ? AND date >= ? AND date <= ?',
    [userId, weekStart, weekEndStr]
  );
  const [monthRows] = await executeQuery(
    'SELECT completed FROM journal_tasks WHERE userId = ? AND date >= ? AND date <= ?',
    [userId, monthStart, monthEnd]
  );

  const dayTotal = dayRows.length;
  const dayDone = dayRows.filter((r) => r.completed).length;
  const dayPct = dayTotal ? Math.round((dayDone / dayTotal) * 100) : 0;

  const weekTotal = weekRows.length;
  const weekDone = weekRows.filter((r) => r.completed).length;
  const weekPct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;

  const monthTotal = monthRows.length;
  const monthDone = monthRows.filter((r) => r.completed).length;
  const monthPct = monthTotal ? Math.round((monthDone / monthTotal) * 100) : 0;

  const awarded = [];

  if (mayAward && dayTotal >= 5) {
    const amount = Math.floor((XP.DAY_PCT_MAX * dayPct) / 100);
    if (amount > 0) {
      const result = await awardOnce(userId, 'journal_day_pct', amount, null, dateStr);
      if (result.awarded) awarded.push({ type: 'day', period: dateStr, xp: amount });
    }
  }
  if (mayAward && weekTotal >= 5) {
    const amount = Math.floor((XP.WEEK_PCT_MAX * weekPct) / 100);
    if (amount > 0) {
      const result = await awardOnce(userId, 'journal_week_pct', amount, null, weekStart);
      if (result.awarded) awarded.push({ type: 'week', period: weekStart, xp: amount });
    }
  }
  if (mayAward && monthTotal >= 5) {
    const amount = Math.floor((XP.MONTH_PCT_MAX * monthPct) / 100);
    if (amount > 0) {
      const result = await awardOnce(userId, 'journal_month_pct', amount, null, monthStart);
      if (result.awarded) awarded.push({ type: 'month', period: monthStart, xp: amount });
    }
  }

  return res.status(200).json({
    success: true,
    awarded,
    dayPct,
    weekPct,
    monthPct,
    dayTotal,
    weekTotal,
    monthTotal,
  });
};

const MAX_LEVEL = 100;
const round2 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

const XP_RULES = {
  DAILY_LOGIN_BASE: 0.005,
  DAILY_LOGIN_WEEKLY_BONUS: 0.001,
  MESSAGE_MULTIPLIER: Number(process.env.XP_PLAYER_GAIN_MULT || 0.01),
  JOURNAL_MULTIPLIER: Number(process.env.XP_JOURNAL_MULT || 0.01),
};

const TIER_NAMES = [
  'Beginner Tier',
  'Intermediate Tier',
  'Advanced Tier',
  'Professional Tier',
  'Elite Tier',
  'Master Tier',
  'Legend Tier',
  'Mythical Tier',
  'Immortal Tier',
  'God Tier',
];

const TIER_RANK_NAMES = [
  ['Market Initiate', 'Session Observer', 'Chart Apprentice', 'Bias Student', 'Structure Novice', 'Range Reader', 'Risk Learner', 'Execution Rookie', 'Momentum Trainee', 'Pattern Seeker'],
  ['Trend Practitioner', 'Liquidity Reader', 'Zone Apprentice', 'Reaction Analyst', 'Discipline Builder', 'Consistency Seeker', 'Setup Tracker', 'Candle Technician', 'Price Cartographer', 'Signal Operator'],
  ['Session Specialist', 'Structure Specialist', 'Flow Analyst', 'Liquidity Specialist', 'Refinement Analyst', 'Confirmation Specialist', 'Risk Technician', 'Execution Technician', 'Momentum Specialist', 'Precision Trader'],
  ['Model Professional', 'System Professional', 'Process Professional', 'Edge Professional', 'Macro Professional', 'Confluence Professional', 'Execution Professional', 'Risk Professional', 'Performance Professional', 'Capital Professional'],
  ['Institutional Scout', 'Institutional Analyst', 'Institutional Operator', 'Institutional Tactician', 'Institutional Strategist', 'Institutional Executor', 'Institutional Specialist', 'Institutional Architect', 'Institutional Commander', 'Institutional Elite'],
  ['Master of Structure', 'Master of Flow', 'Master of Timing', 'Master of Confirmation', 'Master of Risk', 'Master of Execution', 'Master of Confluence', 'Master of Process', 'Master of Discipline', 'Trading Master'],
  ['Legendary Reader', 'Legendary Operator', 'Legendary Strategist', 'Legendary Executor', 'Legendary Risk Manager', 'Legendary Tactician', 'Legendary Architect', 'Legendary Commander', 'Legendary Specialist', 'Trading Legend'],
  ['Mythic Analyst', 'Mythic Strategist', 'Mythic Executor', 'Mythic Risk Architect', 'Mythic Commander', 'Mythic Operator', 'Mythic Specialist', 'Mythic Mastermind', 'Mythic Sovereign', 'Mythical Trader'],
  ['Immortal Analyst', 'Immortal Strategist', 'Immortal Executor', 'Immortal Risk Lord', 'Immortal Commander', 'Immortal Architect', 'Immortal Specialist', 'Immortal Sovereign', 'Immortal Grandmaster', 'Immortal Trader'],
  ['God of Structure', 'God of Timing', 'God of Confirmation', 'God of Execution', 'God of Risk', 'God of Process', 'God of Discipline', 'God of Edge', 'Supreme Trader', 'AURA TERMINAL God'],
];

const TRADING_RANKS = (() => {
  const out = {};
  let level = 1;
  for (const tierList of TIER_RANK_NAMES) {
    for (const title of tierList) {
      out[level] = title;
      level += 1;
    }
  }
  return out;
})();

function xpRequiredForLevel(level) {
  if (level <= 1) return 0;
  const l = level - 1;
  return round2((l ** 2.6) * 125);
}

function getLevelFromXP(xp) {
  const n = Math.max(0, Number(xp) || 0);
  if (n <= 0) return 1;
  if (n >= xpRequiredForLevel(MAX_LEVEL)) return MAX_LEVEL;
  for (let level = MAX_LEVEL; level >= 1; level -= 1) {
    if (n >= xpRequiredForLevel(level)) return level;
  }
  return 1;
}

function getXPForNextLevel(currentLevel) {
  const lv = Math.max(1, parseInt(currentLevel, 10) || 1);
  if (lv >= MAX_LEVEL) return Infinity;
  return xpRequiredForLevel(lv + 1);
}

function getRankTitle(level) {
  const lv = Math.max(1, Math.min(MAX_LEVEL, parseInt(level, 10) || 1));
  return TRADING_RANKS[lv] || 'Market Initiate';
}

function getTierName(level) {
  const lv = Math.max(1, Math.min(MAX_LEVEL, parseInt(level, 10) || 1));
  const tierIdx = Math.floor((lv - 1) / 10);
  return TIER_NAMES[tierIdx] || TIER_NAMES[0];
}

function calculateLoginXP(streak) {
  const bonusMultiplier = Math.min(Math.floor((Number(streak) || 0) / 14), 30);
  const bonusXP = bonusMultiplier * XP_RULES.DAILY_LOGIN_WEEKLY_BONUS;
  return round2(XP_RULES.DAILY_LOGIN_BASE + bonusXP);
}

module.exports = {
  MAX_LEVEL,
  XP_RULES,
  TRADING_RANKS,
  round2,
  xpRequiredForLevel,
  getLevelFromXP,
  getXPForNextLevel,
  getRankTitle,
  getTierName,
  calculateLoginXP,
};


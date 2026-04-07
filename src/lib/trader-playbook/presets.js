import { DEFAULT_CHECKLIST_SECTIONS } from './normalizeSetup';

function sectionsScalp() {
  const s = DEFAULT_CHECKLIST_SECTIONS();
  const pre = s.find((x) => x.id === 'pre_session');
  if (pre)
    pre.items = [
      { id: 'p1', label: 'Economic calendar scanned', description: '', required: true, sortOrder: 0, active: true, weight: 1 },
      { id: 'p2', label: 'Key levels marked', description: '', required: true, sortOrder: 1, active: true, weight: 1 },
    ];
  return s;
}

export const PLAYBOOK_PRESETS = {
  breakout: {
    name: 'Breakout preset',
    setupType: 'Breakout',
    marketType: 'trend',
    overviewBlocks: {
      worksBest: 'Clean expansion after compression; volatility rising.',
      avoid: 'Mid-range chop; false breaks into lunch drift.',
      entryModelSummary: 'Stop-run or range boundary expansion with acceptance.',
      riskModelSummary: 'Risk beyond failed break structure.',
      executionStyle: 'Limit or stop beyond confirming candle.',
      idealExample: 'Sweep + reclaim + impulse close beyond level.',
    },
    entryRules: {
      structureRequirement: 'Defined range or flag boundary',
      confirmationType: 'Close beyond level with spread of acceptance',
      entryTrigger: 'Retest hold or momentum continuation',
      confluenceFactors: 'HTF bias aligned; session liquidity',
    },
    exitRules: {
      invalidationLogic: 'Close back inside range / failed expansion',
      firstTarget: 'Nearest opposing liquidity or measured move',
      scaleOutRule: '50% at 1R, runner to structure',
      trailingRule: 'Behind candle bodies or micro swing',
    },
  },
  reversal: {
    name: 'Reversal preset',
    setupType: 'Reversal',
    marketType: 'range',
    overviewBlocks: {
      worksBest: 'Extended trend into prior HTF liquidity.',
      avoid: 'Early reversals without sweep or exhaustion.',
      entryModelSummary: 'Sweep + shift + confirmation after liquidity grab.',
      riskModelSummary: 'Tight invalidation beyond sweep.',
      executionStyle: 'Scaled entries only if checklist passes.',
      idealExample: 'Equal lows swept, strong displacement up.',
    },
  },
  continuation: {
    name: 'Continuation preset',
    setupType: 'Continuation',
    marketType: 'trend',
    overviewBlocks: {
      worksBest: 'Clean trending sessions with shallow pullbacks.',
      avoid: 'Late trend entries into HTF pool.',
      entryModelSummary: 'Pullback to discount/premium with holding pattern.',
      riskModelSummary: 'Beyond pullback low/high.',
      executionStyle: 'Join on structure break in trade direction.',
      idealExample: 'Trend leg, flag, break in direction.',
    },
  },
  liquidity_sweep: {
    name: 'Liquidity sweep',
    setupType: 'Liquidity sweep',
    marketType: 'volatile',
    overviewBlocks: {
      worksBest: 'Session highs/lows engineered then reversed.',
      avoid: 'Sweep into major news without follow-through.',
      entryModelSummary: 'Raid of resting liquidity + reclaim.',
      riskModelSummary: 'Beyond sweep extreme.',
      executionStyle: 'Wait for reclaim candle close.',
      idealExample: 'London high sweep, NY reversal.',
    },
  },
  news_event: {
    name: 'News / event',
    setupType: 'Event',
    marketType: 'news',
    overviewBlocks: {
      worksBest: 'Tier-1 events with clear post-release displacement.',
      avoid: 'Low liquidity surrounding black swan windows you do not trade.',
      entryModelSummary: 'Fade spike into range or trade expansion after dust settles.',
      riskModelSummary: 'Reduced size; hard daily cap.',
      executionStyle: 'No front-running headlines.',
      idealExample: 'Post-CPI directional leg with clean OB.',
    },
    guardrails: {
      mustPassBeforeExecution: 'Spread normal; platform stable; risk halved vs normal.',
    },
  },
  scalp: {
    name: 'Scalp checklist',
    setupType: 'Scalp',
    marketType: 'intraday',
    checklistSections: sectionsScalp(),
  },
  swing: {
    name: 'Swing template',
    setupType: 'Swing',
    marketType: 'position',
    riskRules: {
      maxRiskPct: '0.25',
      minRR: '2.5',
      maxDailyAttempts: '1',
    },
  },
};

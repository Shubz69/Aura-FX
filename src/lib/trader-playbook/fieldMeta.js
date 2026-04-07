/**
 * Single source of trader-facing copy for playbook fields, wizard flow, and overview blocks.
 * Use helpers below instead of raw schema keys in UI.
 */

export function humanizeSchemaKey(key) {
  if (!key) return '';
  const spaced = String(key).replace(/([A-Z])/g, ' $1').replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).trim();
}

/** Nested field definitions: label, hint, placeholder (optional), multiline */
export const FIELDS = {
  marketConditions: {
    instrumentsNote: {
      label: 'Universe & instruments',
      hint: 'Symbols, indices, or products this playbook is written for.',
      placeholder: 'e.g. EURUSD, GBPUSD, US30 …',
      multiline: true,
    },
    session: {
      label: 'Session focus',
      hint: 'London, New York, Asia, overlap — when you actually trade this idea.',
      placeholder: 'e.g. London–NY overlap',
      multiline: true,
    },
    timeframes: {
      label: 'Timeframe stack',
      hint: 'Higher-timeframe bias versus execution timeframe.',
      placeholder: 'e.g. H4 bias · M15 execution',
      multiline: true,
    },
    marketCondition: {
      label: 'Market regime',
      hint: 'Trend, range, transition, event day — conditions where the edge is valid.',
      multiline: true,
    },
    volatilityCondition: {
      label: 'Volatility requirement',
      hint: 'Expansion vs compression; ATR or range context you require.',
      multiline: true,
    },
    newsEventCondition: {
      label: 'News & event filter',
      hint: 'Red-folder days, blackout windows, or deliberate trade-through rules.',
      multiline: true,
    },
    directionalBiasRequirement: {
      label: 'Directional bias',
      hint: 'Higher-timeframe or structural bias that must align before risk.',
      multiline: true,
    },
  },
  entryRules: {
    structureRequirement: {
      label: 'Market structure condition',
      hint: 'Sweep, break of structure, reclaim — be precise about required structure.',
      multiline: true,
    },
    entryTrigger: {
      label: 'Entry trigger',
      hint: 'The specific print, level, or candle that moves you to execution.',
      multiline: true,
    },
    confluenceFactors: {
      label: 'Confluence stack',
      hint: 'Liquidity, premium/discount, PD arrays — what must stack with the trigger.',
      multiline: true,
    },
    confirmationType: {
      label: 'Confirmation model',
      hint: 'Close, retest, lower-timeframe shift — how the trigger is proven.',
      multiline: true,
    },
    checklistNotes: {
      label: 'Entry execution notes',
      hint: 'Last checks at the button (fills, spread, news).',
      multiline: true,
    },
  },
  exitRules: {
    stopPlacement: {
      label: 'Stop placement',
      hint: 'Invalidation level relative to structure — where the idea is wrong.',
      multiline: true,
    },
    invalidationLogic: {
      label: 'Invalidation rule',
      hint: 'When the thesis is void: exit, reduce, or flatten.',
      multiline: true,
    },
    firstTarget: {
      label: 'Primary objective',
      hint: 'First liquidity pool, RR target, or measured move.',
      multiline: true,
    },
    scaleOutRule: {
      label: 'Scale-out plan',
      hint: 'Where and how you bank partials relative to risk.',
      multiline: true,
    },
    trailingRule: {
      label: 'Trailing management',
      hint: 'How runners are protected after partials.',
      multiline: true,
    },
    finalExitLogic: {
      label: 'Final exit rule',
      hint: 'Full exit, time stop, or session flat.',
      multiline: true,
    },
    holdVsExit: {
      label: 'Hold / exit condition',
      hint: 'When to press the winner vs exit into noise.',
      multiline: true,
    },
  },
  riskRules: {
    maxRiskPct: {
      label: 'Max risk (% of equity)',
      hint: 'Per-trade risk ceiling as a percent of account.',
      multiline: false,
    },
    maxRiskAmount: {
      label: 'Max risk ($)',
      hint: 'Hard dollar stop per trade if you cap in currency.',
      multiline: false,
    },
    minRR: {
      label: 'Minimum reward : risk',
      hint: 'Lowest acceptable multiple versus defined risk.',
      multiline: false,
    },
    positionSizingRule: {
      label: 'Position sizing model',
      hint: 'Fixed fractional, volatility-adjusted, fixed lots, etc.',
      multiline: false,
    },
    maxEntries: {
      label: 'Max add-ons',
      hint: 'Pyramids or scales allowed for this idea.',
      multiline: false,
    },
    maxDailyAttempts: {
      label: 'Max attempts per day',
      hint: 'Caps repeated plays of the same setup in one session.',
      multiline: false,
    },
  },
  guardrails: {
    doNotTradeConditions: {
      label: 'Do not trade when',
      hint: 'Narrative guardrails; use chips below for quick discrete rules.',
      multiline: true,
    },
    commonMistakes: {
      label: 'Written mistake patterns',
      hint: 'Long-form mistake narrative; chips capture repeat errors.',
      multiline: true,
    },
    psychologicalFailurePoints: {
      label: 'Behavioural risk',
      hint: 'Revenge, FOMO, size creep — the states that break this playbook.',
      multiline: true,
    },
    mustPassBeforeExecution: {
      label: 'Non-negotiable pre-trade gates',
      hint: 'Hard checks before risk; should mirror your checklist.',
      multiline: true,
    },
  },
};

const RULE_GROUP_REFS = [
  {
    id: 'context',
    title: 'Context & regime',
    subtitle: 'Environment and bias — before any trigger exists.',
    fields: [
      { bucket: 'marketConditions', key: 'instrumentsNote' },
      { bucket: 'marketConditions', key: 'session' },
      { bucket: 'marketConditions', key: 'timeframes' },
      { bucket: 'marketConditions', key: 'marketCondition' },
      { bucket: 'marketConditions', key: 'volatilityCondition' },
      { bucket: 'marketConditions', key: 'newsEventCondition' },
      { bucket: 'marketConditions', key: 'directionalBiasRequirement' },
    ],
  },
  {
    id: 'trigger',
    title: 'Trigger',
    subtitle: 'The structural event that justifies the trade idea.',
    fields: [
      { bucket: 'entryRules', key: 'structureRequirement' },
      { bucket: 'entryRules', key: 'entryTrigger' },
      { bucket: 'entryRules', key: 'confluenceFactors' },
    ],
  },
  {
    id: 'confirmation',
    title: 'Confirmation',
    subtitle: 'What must prove the trigger before capital is risked.',
    fields: [
      { bucket: 'entryRules', key: 'confirmationType' },
      { bucket: 'entryRules', key: 'checklistNotes' },
    ],
  },
  {
    id: 'risk',
    title: 'Risk',
    subtitle: 'Defined loss and sizing — non-negotiables.',
    fields: [
      { bucket: 'riskRules', key: 'maxRiskPct' },
      { bucket: 'riskRules', key: 'maxRiskAmount' },
      { bucket: 'riskRules', key: 'minRR' },
      { bucket: 'riskRules', key: 'positionSizingRule' },
      { bucket: 'riskRules', key: 'maxEntries' },
      { bucket: 'riskRules', key: 'maxDailyAttempts' },
    ],
  },
  {
    id: 'management',
    title: 'Trade management',
    subtitle: 'Stops, targets, and how the position is worked.',
    fields: [
      { bucket: 'exitRules', key: 'stopPlacement' },
      { bucket: 'exitRules', key: 'invalidationLogic' },
      { bucket: 'exitRules', key: 'firstTarget' },
      { bucket: 'exitRules', key: 'scaleOutRule' },
      { bucket: 'exitRules', key: 'trailingRule' },
      { bucket: 'exitRules', key: 'finalExitLogic' },
      { bucket: 'exitRules', key: 'holdVsExit' },
    ],
  },
  {
    id: 'avoid',
    title: 'Stand down & guardrails',
    subtitle: 'When the edge does not trade — and the mistakes that break it.',
    fields: [
      { bucket: 'guardrails', key: 'doNotTradeConditions' },
      { bucket: 'guardrails', key: 'commonMistakes' },
      { bucket: 'guardrails', key: 'psychologicalFailurePoints' },
      { bucket: 'guardrails', key: 'mustPassBeforeExecution' },
    ],
  },
];

function expandFieldRef(ref) {
  const m = FIELDS[ref.bucket]?.[ref.key];
  const multiline = m ? m.multiline !== false : true;
  return {
    bucket: ref.bucket,
    key: ref.key,
    label: m?.label ?? humanizeSchemaKey(ref.key),
    hint: m?.hint ?? '',
    placeholder: m?.placeholder,
    multiline,
  };
}

export const RULE_GROUPS = RULE_GROUP_REFS.map((g) => ({
  ...g,
  fields: g.fields.map(expandFieldRef),
}));

export function getFieldMeta(bucket, key) {
  const m = FIELDS[bucket]?.[key];
  return {
    label: m?.label ?? humanizeSchemaKey(key),
    hint: m?.hint ?? '',
    placeholder: m?.placeholder,
    multiline: m ? m.multiline !== false : true,
  };
}

/** Overview narrative blocks — keys match overviewBlocks on setup */
export const OVERVIEW_FIELDS = [
  {
    key: 'worksBest',
    label: 'When this edge is live',
    hint: 'Sessions, volatility, structure — when this setup is in regime.',
    boardLabel: 'Live edge',
  },
  {
    key: 'avoid',
    label: 'Stand down when',
    hint: 'Chop, news, fatigue, low conviction — anything that voids the plan.',
    boardLabel: 'Stand down',
  },
  {
    key: 'entryModelSummary',
    label: 'Execution model',
    hint: 'One tight paragraph: how you enter when all conditions align.',
    boardLabel: 'Entry model',
  },
  {
    key: 'riskModelSummary',
    label: 'Risk model',
    hint: 'Sizing, max loss, invalidation — how risk is defined for this idea.',
    boardLabel: 'Risk',
  },
  {
    key: 'executionStyle',
    label: 'Order & fill style',
    hint: 'Limits, markets, scaling — how orders are actually placed.',
    boardLabel: 'Fills',
  },
  {
    key: 'idealExample',
    label: 'A+ execution profile',
    hint: 'What a textbook trade looks like on this playbook — for checklist and review.',
    boardLabel: 'A+ profile',
  },
];

export const LIST_SECTION_LABELS = {
  tags: { label: 'Playbook tags', hint: 'Search and board filters — keep short labels.' },
  doNotTrade: {
    label: 'Do not trade when (tags)',
    hint: 'Discrete rules: sessions, news, tilt — add as chips.',
  },
  commonMistakes: {
    label: 'Common execution mistakes (tags)',
    hint: 'Repeat errors you tag in review — complements the narrative above.',
  },
};

/** Wizard step pills and section titles */
export const WIZARD_FLOW = [
  {
    pill: 'Identity',
    title: 'Strategy identity',
    subtitle: 'Name this edge and anchor it to the markets and sessions you trade.',
    kind: 'basics',
  },
  {
    pill: 'Context',
    title: 'Regime & context',
    subtitle: 'When the tape qualifies for this playbook — before any trigger.',
    kind: 'groups',
    groupIds: ['context'],
  },
  {
    pill: 'Setup',
    title: 'Trigger & confirmation',
    subtitle: 'Structure, trigger, and proof required before you put risk on.',
    kind: 'groups',
    groupIds: ['trigger', 'confirmation'],
  },
  {
    pill: 'Risk',
    title: 'Risk, sizing & management',
    subtitle: 'Loss definition, size, stops, targets, and how the trade is managed.',
    kind: 'groups',
    groupIds: ['risk', 'management'],
  },
  {
    pill: 'Discipline',
    title: 'Stand down & guardrails',
    subtitle: 'When not to trade and the behaviours that break this process.',
    kind: 'groups',
    groupIds: ['avoid'],
  },
  {
    pill: 'Review',
    title: 'Review & complete',
    subtitle: 'Confirm what you have built; optionally merge a preset template.',
    kind: 'review',
  },
];

export const WIZARD_BASICS_FIELDS = [
  {
    key: 'name',
    label: 'Playbook name',
    hint: 'Use a name you will recognise in analytics and tagging.',
    placeholder: 'e.g. London sweep + NY continuation',
  },
  {
    key: 'icon',
    label: 'Mark',
    hint: 'Emoji or short symbol for cards (optional).',
    placeholder: 'e.g. ⚡',
  },
  {
    key: 'marketType',
    label: 'Market',
    hint: 'Asset class or venue context.',
    placeholder: 'e.g. FX · majors',
  },
  {
    key: 'assets',
    label: 'Primary instruments',
    hint: 'Pairs, symbols, or products — comma-separated.',
    placeholder: 'e.g. EURUSD, GBPUSD',
  },
  {
    key: 'session',
    label: 'Primary session',
    hint: 'When you operate this playbook in your timezone.',
    placeholder: 'e.g. London–NY overlap',
  },
  {
    key: 'timeframes',
    label: 'Timeframes',
    hint: 'Bias vs execution stack.',
    placeholder: 'e.g. H4 · M15',
  },
];

function firstLine(text, max = 220) {
  if (!text || !String(text).trim()) return '';
  const s = String(text).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function countActiveChecklistItems(sections) {
  if (!Array.isArray(sections)) return { sections: 0, items: 0, required: 0 };
  let items = 0;
  let required = 0;
  sections.forEach((sec) => {
    (sec.items || []).forEach((it) => {
      if (it.active === false) return;
      items += 1;
      if (it.required) required += 1;
    });
  });
  return { sections: sections.length, items, required };
}

/** Snapshot strings for wizard review step — all from current draft only */
export function buildWizardReviewSnapshot(wd) {
  const ob = wd.overviewBlocks || {};
  const { items, required, sections } = countActiveChecklistItems(wd.checklistSections);
  return {
    identity: `${wd.name || 'Untitled playbook'} · ${wd.marketType || 'Market TBD'} · ${wd.session || 'Session TBD'}`,
    liveEdge: firstLine(ob.worksBest),
    execution: firstLine(ob.entryModelSummary || wd.entryRules?.entryTrigger),
    risk: firstLine(ob.riskModelSummary || wd.riskRules?.maxRiskPct),
    standDown: firstLine(ob.avoid || wd.guardrails?.doNotTradeConditions),
    checklistLine:
      items > 0
        ? `${items} active checklist items (${required} required) · ${sections} sections`
        : 'Checklist not populated — add items in the Checklist tab after saving.',
  };
}

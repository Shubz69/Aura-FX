/**
 * Human-readable labels and workflow grouping for playbook rules (not raw field names).
 */

export const OVERVIEW_FIELDS = [
  {
    key: 'worksBest',
    label: 'When this edge is live',
    hint: 'Sessions, volatility, or structure where this setup is statistically in regime.',
  },
  {
    key: 'avoid',
    label: 'Stand down when',
    hint: 'Hard stops: chop, news, low conviction, fatigue — whatever invalidates the plan.',
  },
  {
    key: 'entryModelSummary',
    label: 'Core entry model',
    hint: 'One clear sentence on how you enter when conditions line up.',
  },
  {
    key: 'riskModelSummary',
    label: 'Risk framing',
    hint: 'How size, invalidation, and max loss are defined for this idea.',
  },
  {
    key: 'executionStyle',
    label: 'Execution style',
    hint: 'Limit, market, scaling — how orders are actually placed.',
  },
  {
    key: 'idealExample',
    label: 'A+ profile',
    hint: 'What a picture-perfect execution looks like on this playbook.',
  },
];

export const RULE_GROUPS = [
  {
    id: 'context',
    title: 'Context',
    subtitle: 'Environment and bias — before any trigger exists.',
    fields: [
      { bucket: 'marketConditions', key: 'instrumentsNote', label: 'Instruments', hint: 'Pairs, indices, or symbols in scope.', multiline: true },
      { bucket: 'marketConditions', key: 'session', label: 'Session focus', hint: 'London, NY, Asia, or overlap.', multiline: true },
      { bucket: 'marketConditions', key: 'timeframes', label: 'Timeframe stack', hint: 'Higher / execution TF alignment.', multiline: true },
      { bucket: 'marketConditions', key: 'marketCondition', label: 'Market condition', hint: 'Trend, range, transition, event day.', multiline: true },
      { bucket: 'marketConditions', key: 'volatilityCondition', label: 'Volatility', hint: 'ATR, expansion vs compression.', multiline: true },
      { bucket: 'marketConditions', key: 'newsEventCondition', label: 'News & events', hint: 'Red folder days, blackout windows.', multiline: true },
      { bucket: 'marketConditions', key: 'directionalBiasRequirement', label: 'Bias requirement', hint: 'HTF bias or directional filter.', multiline: true },
    ],
  },
  {
    id: 'trigger',
    title: 'Trigger',
    subtitle: 'The structural event that creates the trade idea.',
    fields: [
      { bucket: 'entryRules', key: 'structureRequirement', label: 'Structure requirement', hint: 'Sweep, BOS, reclaim — be specific.', multiline: true },
      { bucket: 'entryRules', key: 'entryTrigger', label: 'Entry trigger', hint: 'The definitive print or level that fires execution.', multiline: true },
      { bucket: 'entryRules', key: 'confluenceFactors', label: 'Confluence', hint: 'Liquidity, PD arrays, session highs — what must stack.', multiline: true },
    ],
  },
  {
    id: 'confirmation',
    title: 'Confirmation',
    subtitle: 'What must prove the trigger is real before risk goes on.',
    fields: [
      { bucket: 'entryRules', key: 'confirmationType', label: 'Confirmation type', hint: 'Close, retest, LTF shift, etc.', multiline: true },
      { bucket: 'entryRules', key: 'checklistNotes', label: 'Execution notes', hint: 'Micro-checks at the point of entry.', multiline: true },
    ],
  },
  {
    id: 'risk',
    title: 'Risk',
    subtitle: 'Defined loss and sizing — non-negotiables.',
    fields: [
      { bucket: 'riskRules', key: 'maxRiskPct', label: 'Max risk %', hint: 'Per trade as % of equity.', multiline: false },
      { bucket: 'riskRules', key: 'maxRiskAmount', label: 'Max risk amount', hint: 'Absolute cap if you use fixed dollar risk.', multiline: false },
      { bucket: 'riskRules', key: 'minRR', label: 'Minimum R:R', hint: 'Lowest acceptable reward vs defined risk.', multiline: false },
      { bucket: 'riskRules', key: 'positionSizingRule', label: 'Sizing rule', hint: 'Fixed fractional, volatility-adjusted, etc.', multiline: false },
      { bucket: 'riskRules', key: 'maxEntries', label: 'Max add-ons', hint: 'Pyramids or scale-ins allowed.', multiline: false },
      { bucket: 'riskRules', key: 'maxDailyAttempts', label: 'Max attempts / day', hint: 'Caps overtrading on one pattern.', multiline: false },
    ],
  },
  {
    id: 'management',
    title: 'Management',
    subtitle: 'Stops, targets, and how the trade is worked.',
    fields: [
      { bucket: 'exitRules', key: 'stopPlacement', label: 'Stop placement', hint: 'Exact invalidation relative to structure.', multiline: true },
      { bucket: 'exitRules', key: 'invalidationLogic', label: 'Invalidation', hint: 'When the thesis is dead — exit or reduce.', multiline: true },
      { bucket: 'exitRules', key: 'firstTarget', label: 'First target', hint: 'Primary liquidity or objective.', multiline: true },
      { bucket: 'exitRules', key: 'scaleOutRule', label: 'Scale / partials', hint: 'Where profit is banked and how much.', multiline: true },
      { bucket: 'exitRules', key: 'trailingRule', label: 'Trailing', hint: 'How runners are protected.', multiline: true },
      { bucket: 'exitRules', key: 'finalExitLogic', label: 'Final exit', hint: 'Full exit conditions or time stop.', multiline: true },
      { bucket: 'exitRules', key: 'holdVsExit', label: 'Hold vs exit', hint: 'When to press vs flatten into noise.', multiline: true },
    ],
  },
  {
    id: 'avoid',
    title: 'Avoid conditions',
    subtitle: 'Guardrails and psychology — keep chips and tag lists below.',
    fields: [
      { bucket: 'guardrails', key: 'doNotTradeConditions', label: 'Do not trade if', hint: 'Narrative block; use chips for discrete items.', multiline: true },
      { bucket: 'guardrails', key: 'commonMistakes', label: 'Common mistakes', hint: 'Written narrative; pair with mistake chips.', multiline: true },
      { bucket: 'guardrails', key: 'psychologicalFailurePoints', label: 'Psychology risk', hint: 'Revenge, FOMO, size creep.', multiline: true },
      { bucket: 'guardrails', key: 'mustPassBeforeExecution', label: 'Must pass before execution', hint: 'Hard gates — checklist ties here.', multiline: true },
    ],
  },
];

export const NO_SETUP_REASONS = [
  { value: 'outside_playbook', label: 'Outside playbook', description: 'Valid trade idea, but not this definition.' },
  { value: 'impulse_rulebreak', label: 'Impulse / rule break', description: 'Knew the rules; broke them anyway.' },
  { value: 'unplanned', label: 'Unplanned execution', description: 'No defined setup — reactive fill.' },
  { value: 'other', label: 'Other', description: 'Note in journal / validator if you need detail.' },
];

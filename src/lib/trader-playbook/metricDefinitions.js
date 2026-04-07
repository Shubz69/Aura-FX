/**
 * Single source for playbook metric copy: labels + definitions (aligned with api/trader-playbook/summary.js).
 * Do not scatter definitions in JSX — import METRIC_DEFS / METRIC_LABEL / getMetricDefinition.
 */

/** Stable ids for tooltips and label consistency */
export const MID = {
  PLAYBOOKS_TOTAL: 'playbooksTotal',
  PLAYBOOKS_ACTIVE: 'playbooksActive',
  PLAYBOOKS_DRAFT: 'playbooksDraft',
  ON_BOOK_EXECUTIONS_GLOBAL: 'onBookExecutionsGlobal',
  OFF_PLAN_EXECUTIONS_GLOBAL: 'offPlanExecutionsGlobal',
  MISSED_LOG: 'missedLog',
  LEADING_SETUP: 'leadingSetup',
  GLOBAL_WIN_RATE: 'globalWinRate',
  GLOBAL_PROFIT_FACTOR: 'globalProfitFactor',
  ON_BOOK_SHARE_CLASSIFIED: 'onBookShareClassified',
  CLASSIFICATION_COVERAGE: 'classificationCoverage',
  OFF_PLAN_RATE_CLASSIFIED: 'offPlanRateClassified',
  UNCLASSIFIED: 'unclassified',
  WIN_RATE_PLAYBOOK: 'winRatePlaybook',
  PROFIT_FACTOR_PLAYBOOK: 'profitFactorPlaybook',
  ON_BOOK_EXECUTIONS_PLAYBOOK: 'onBookExecutionsPlaybook',
  WIN_RATE_VALIDATOR_PLAYBOOK: 'winRateValidatorPlaybook',
  PROFIT_FACTOR_VALIDATOR_PLAYBOOK: 'profitFactorValidatorPlaybook',
  EXPECTANCY_DOLLAR_VALIDATOR_PLAYBOOK: 'expectancyDollarValidatorPlaybook',
  AVG_R_VALIDATOR_PLAYBOOK: 'avgRValidatorPlaybook',
  EXPECTANCY_R_JOURNAL_PLAYBOOK: 'expectancyRJournalPlaybook',
  NET_PNL_VALIDATOR_PLAYBOOK: 'netPnlValidatorPlaybook',
  BEST_WORST_VALIDATOR_PLAYBOOK: 'bestWorstValidatorPlaybook',
  SAMPLE_VJ_TAGGED_PLAYBOOK: 'sampleVJTaggedPlaybook',
  CLOSED_VALIDATOR_PLAYBOOK: 'closedValidatorPlaybook',
  CLOSED_JOURNAL_PLAYBOOK: 'closedJournalPlaybook',
  TOP_MISS_PATTERN_PLAYBOOK: 'topMissPatternPlaybook',
  EXECUTION_RHYTHM_PLAYBOOK: 'executionRhythmPlaybook',
};

/** Short labels reused in cards, headers, analytics — keep naming consistent */
export const METRIC_LABEL = {
  ON_BOOK_EXECUTIONS: 'On-book executions',
  OFF_PLAN: 'Off-plan',
  WIN_RATE: 'Win rate',
  PROFIT_FACTOR: 'Profit factor',
  UNCLASSIFIED: 'Unclassified',
  MISSED_LOG: 'Missed log',
};

export const METRIC_DEFS = {
  [MID.PLAYBOOKS_TOTAL]: {
    title: 'Playbooks',
    measures: 'How many setup definitions you have saved (all statuses).',
    calculation: 'Count of playbook rows for your account.',
    good: null,
  },
  [MID.PLAYBOOKS_ACTIVE]: {
    title: 'Active playbooks',
    measures: 'Ideas treated as in rotation — not draft and not archived.',
    calculation: 'Count where status is neither draft nor archived.',
    good: null,
  },
  [MID.PLAYBOOKS_DRAFT]: {
    title: 'Draft playbooks',
    measures: 'Setups still being defined before live use.',
    calculation: 'Count where status is draft.',
    good: null,
  },
  [MID.ON_BOOK_EXECUTIONS_GLOBAL]: {
    title: 'On-book executions (global)',
    measures: 'Validator and journal rows explicitly linked to a playbook.',
    calculation:
      'Count of trades tagged PLAYBOOK with a playbook id in both validator and journal feeds (each row counted once in its source).',
    good: 'Higher coverage means more of your book is attributable to defined setups.',
  },
  [MID.OFF_PLAN_EXECUTIONS_GLOBAL]: {
    title: 'Off-plan executions (global)',
    measures: 'Rows you classified as taken outside any playbook definition.',
    calculation: 'Count of trades tagged NO_SETUP in validator and journal.',
    good: 'Lower counts (relative to on-book) usually mean tighter process; context matters.',
  },
  [MID.MISSED_LOG]: {
    title: 'Missed log',
    measures: 'Entries you logged when a valid setup was missed or mis-executed.',
    calculation: 'Count of rows in your missed-setup log (trader_playbook_m_trades).',
    good: 'Use this to close the loop between opportunity and rules — not a P&L metric.',
  },
  [MID.LEADING_SETUP]: {
    title: 'Leading setup',
    measures: 'The playbook with the best scored expectancy in the current sample.',
    calculation: 'Picks highest expectancy $ (validator) when available, otherwise R (journal), among playbooks with tagged activity.',
    good: null,
  },
  [MID.GLOBAL_WIN_RATE]: {
    title: 'Win rate (book-wide)',
    measures: 'Share of closed, tagged outcomes that are wins across all playbooks.',
    calculation: 'Total wins ÷ (wins + losses + breakevens) from merged validator + journal counts per playbook.',
    good: 'Interpret beside profit factor and sample size — win rate alone does not prove edge.',
  },
  [MID.GLOBAL_PROFIT_FACTOR]: {
    title: 'Profit factor (book-wide)',
    measures: 'How much gross profit compares with gross loss on tagged validator trades, aggregated across playbooks.',
    calculation: 'Sum of winning trade P&L ÷ sum of absolute losing trade P&L on validator rows tagged to playbooks. Journal P&L is not in this ratio.',
    good: 'Above 1 means gross winners exceed gross losers; combine with sample size and drawdown context.',
  },
  [MID.ON_BOOK_SHARE_CLASSIFIED]: {
    title: 'On-book share (classified only)',
    measures: 'Of executions you already labelled as on-book or off-plan, how many are on a playbook.',
    calculation: 'On-book count ÷ (on-book + off-plan). Unclassified rows are excluded from denominator.',
    good: 'Higher means more of your classified activity is intentional vs impulsive — if classification is honest.',
  },
  [MID.CLASSIFICATION_COVERAGE]: {
    title: 'Classification coverage',
    measures: 'How much of your validator + journal book is linked to a playbook.',
    calculation: 'On-book executions ÷ (on-book + off-plan + unclassified) for those feeds.',
    good: 'Higher means fewer “unknown” rows diluting your stats.',
  },
  [MID.OFF_PLAN_RATE_CLASSIFIED]: {
    title: 'Off-plan rate (classified only)',
    measures: 'Among classified rows, the share marked off-plan rather than tied to a playbook.',
    calculation: 'Off-plan count ÷ (on-book + off-plan). Unclassified rows excluded.',
    good: 'Lower is usually better for process discipline; spikes warrant a rules review.',
  },
  [MID.UNCLASSIFIED]: {
    title: 'Unclassified',
    measures: 'Trades not yet tagged as on-book or off-plan.',
    calculation: 'Validator and journal rows without PLAYBOOK or NO_SETUP classification in summary rollup.',
    good: 'Aim to drive this toward zero before trusting adherence or win-rate headlines.',
  },
  [MID.WIN_RATE_PLAYBOOK]: {
    title: 'Win rate (this playbook)',
    measures: 'Wins versus all closed tagged outcomes for this setup (validator + journal).',
    calculation: 'Wins ÷ (wins + losses + breakevens) for rows assigned to this playbook.',
    good: 'Needs enough closes; pair with profit factor and expectancy.',
  },
  [MID.PROFIT_FACTOR_PLAYBOOK]: {
    title: 'Profit factor (this playbook)',
    measures: 'Gross profit vs gross loss on validator trades tagged to this playbook.',
    calculation: 'Sum of winning P&L ÷ sum of absolute losing P&L for validator rows on this playbook only.',
    good: 'Above 1 means gross winners beat gross losers on this definition.',
  },
  [MID.ON_BOOK_EXECUTIONS_PLAYBOOK]: {
    title: 'On-book executions (this playbook)',
    measures: 'How many validator + journal rows are linked to this playbook.',
    calculation: 'Count of tagged rows per playbook in merged summary.',
    good: 'This is your sample depth for stats on this sheet.',
  },
  [MID.WIN_RATE_VALIDATOR_PLAYBOOK]: {
    title: 'Win rate — validator (this playbook)',
    measures: 'Validator closes on this playbook that finished as wins.',
    calculation: 'Validator wins ÷ validator closes (win/loss/breakeven) for this playbook id.',
    good: 'Compare to journal R-expectancy for consistency of behaviour.',
  },
  [MID.PROFIT_FACTOR_VALIDATOR_PLAYBOOK]: {
    title: 'Profit factor — validator (this playbook)',
    measures: 'Validator gross profit vs gross loss for this playbook.',
    calculation: 'Same profit-factor logic as book-wide, scoped to this playbook’s validator rows.',
    good: null,
  },
  [MID.EXPECTANCY_DOLLAR_VALIDATOR_PLAYBOOK]: {
    title: 'Expectancy ($) — validator',
    measures: 'Average dollar outcome per closed validator trade on this playbook.',
    calculation: 'Total P&L on those closes ÷ number of closed validator trades with results.',
    good: 'Positive sustained expectancy is the core “is it worth trading” signal for that sample.',
  },
  [MID.AVG_R_VALIDATOR_PLAYBOOK]: {
    title: 'Average R — validator',
    measures: 'Mean R-multiple across validator trades with R recorded for this playbook.',
    calculation: 'Sum of R ÷ count of rows contributing R on validator for this playbook.',
    good: null,
  },
  [MID.EXPECTANCY_R_JOURNAL_PLAYBOOK]: {
    title: 'Expectancy (R) — journal',
    measures: 'Average journal R outcome per tagged row on this playbook.',
    calculation: 'Sum of journal R results ÷ count of journal rows for this playbook.',
    good: 'Use alongside validator $ expectancy for narrative + execution alignment.',
  },
  [MID.NET_PNL_VALIDATOR_PLAYBOOK]: {
    title: 'Net P&L — validator sample',
    measures: 'Total dollars from closed validator trades on this playbook.',
    calculation: 'Sum of P&L on tagged validator rows for this playbook.',
    good: null,
  },
  [MID.BEST_WORST_VALIDATOR_PLAYBOOK]: {
    title: 'Best / worst trade ($)',
    measures: 'Largest single-trade gain and loss in the validator sample for this playbook.',
    calculation: 'Max and min P&L among those trades.',
    good: 'Shows tail risk and payoff asymmetry — not averages.',
  },
  [MID.SAMPLE_VJ_TAGGED_PLAYBOOK]: {
    title: 'Sample depth (validator + journal)',
    measures: 'How many rows feed this tab’s math for this playbook.',
    calculation:
      'Validator: closes with win/loss/breakeven tagged here. Journal: rows tagged PLAYBOOK here with R used for expectancy. Shown as sum for a quick depth read.',
    good: 'Larger samples make win rate and expectancy more reliable.',
  },
  [MID.CLOSED_VALIDATOR_PLAYBOOK]: {
    title: 'Validator closes',
    measures: 'Closed validator trades with win/loss/breakeven on this playbook.',
    calculation: 'Count of validator rows tagged here with a terminal result.',
    good: null,
  },
  [MID.CLOSED_JOURNAL_PLAYBOOK]: {
    title: 'Journal closes',
    measures: 'Journal rows on this playbook with an R outcome.',
    calculation: 'Count of journal tagged rows included in expectancy R calculation.',
    good: null,
  },
  [MID.TOP_MISS_PATTERN_PLAYBOOK]: {
    title: 'Top miss label',
    measures: 'Most common category in your missed-setup log (scoped to this playbook when filtered).',
    calculation: 'Groups miss entries by type and shows the largest bucket.',
    good: null,
  },
  [MID.EXECUTION_RHYTHM_PLAYBOOK]: {
    title: 'Execution rhythm',
    measures: 'How tagged trades on this playbook cluster by weekday, session label, and symbol.',
    calculation: 'Counts from validator and journal rows tagged to this playbook with those fields present.',
    good: 'Use to align prep and review timing with where you actually trade this idea.',
  },
};

export function getMetricDefinition(metricId) {
  return metricId ? METRIC_DEFS[metricId] : null;
}

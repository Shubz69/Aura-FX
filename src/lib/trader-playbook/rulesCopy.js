/**
 * Playbook UI copy — field labels, wizard flow, and overview blocks live in fieldMeta.
 */

export {
  FIELDS,
  RULE_GROUPS,
  OVERVIEW_FIELDS,
  WIZARD_FLOW,
  WIZARD_BASICS_FIELDS,
  LIST_SECTION_LABELS,
  getFieldMeta,
  humanizeSchemaKey,
  countActiveChecklistItems,
  buildWizardReviewSnapshot,
} from './fieldMeta';

/** Reasons for NO_SETUP classification — honest process taxonomy */
export const NO_SETUP_REASONS = [
  {
    value: 'outside_playbook',
    label: 'Right idea, wrong playbook',
    description: 'Setup was valid but does not belong in this definition — re-tag to the correct book.',
  },
  {
    value: 'impulse_rulebreak',
    label: 'Rule break / impulse',
    description: 'You knew the plan and overrode it — this is pure process leakage.',
  },
  {
    value: 'unplanned',
    label: 'Unplanned fill',
    description: 'No defined conditions — reactive click. Discipline metric, not a strategy loss.',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Use journal or refinement notes if you need detail.',
  },
];

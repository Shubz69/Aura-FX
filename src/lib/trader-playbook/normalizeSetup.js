/**
 * Normalises API playbook rows into a single editor / UI shape (legacy flat + structured JSON).
 */

export const DEFAULT_CHECKLIST_SECTIONS = () => [
  {
    id: 'pre_session',
    title: 'Pre-market / pre-session',
    items: [],
  },
  {
    id: 'market',
    title: 'Market condition checks',
    items: [],
  },
  {
    id: 'validation',
    title: 'Setup validation',
    items: [],
  },
  {
    id: 'entry',
    title: 'Entry confirmation',
    items: [],
  },
  {
    id: 'risk',
    title: 'Risk confirmation',
    items: [],
  },
  {
    id: 'discipline',
    title: 'Execution discipline',
    items: [],
  },
  {
    id: 'management',
    title: 'Post-entry management',
    items: [],
  },
];

const EMPTY_OVERVIEW = () => ({
  worksBest: '',
  avoid: '',
  entryModelSummary: '',
  riskModelSummary: '',
  executionStyle: '',
  idealExample: '',
});

const EMPTY_MC = () => ({
  instrumentsNote: '',
  session: '',
  timeframes: '',
  marketCondition: '',
  volatilityCondition: '',
  newsEventCondition: '',
  directionalBiasRequirement: '',
});

const EMPTY_ER = () => ({
  structureRequirement: '',
  confirmationType: '',
  entryTrigger: '',
  confluenceFactors: '',
  checklistNotes: '',
});

const EMPTY_XR = () => ({
  stopPlacement: '',
  invalidationLogic: '',
  firstTarget: '',
  scaleOutRule: '',
  trailingRule: '',
  finalExitLogic: '',
  holdVsExit: '',
});

const EMPTY_RR = () => ({
  maxRiskPct: '',
  maxRiskAmount: '',
  minRR: '',
  positionSizingRule: '',
  maxEntries: '',
  maxDailyAttempts: '',
});

const EMPTY_GR = () => ({
  doNotTradeConditions: '',
  commonMistakes: '',
  psychologicalFailurePoints: '',
  mustPassBeforeExecution: '',
});

function seedChecklistFromEntry(entryChecklist, sections) {
  if (!Array.isArray(entryChecklist) || !entryChecklist.length) return sections;
  const next = JSON.parse(JSON.stringify(sections));
  const target = next.find((s) => s.id === 'validation') || next[0];
  entryChecklist.forEach((label, i) => {
    target.items.push({
      id: `seed-${i}-${String(label).slice(0, 24)}`,
      label: String(label),
      description: '',
      required: true,
      sortOrder: i,
      active: true,
      weight: 1,
    });
  });
  return next;
}

export function normalizeSetup(setup = {}) {
  const checklistSectionsRaw = setup.checklistSections;
  let checklistSections = DEFAULT_CHECKLIST_SECTIONS();
  if (Array.isArray(checklistSectionsRaw) && checklistSectionsRaw.length) {
    checklistSections = checklistSectionsRaw;
  } else {
    checklistSections = seedChecklistFromEntry(
      Array.isArray(setup.entryChecklist) ? setup.entryChecklist : [],
      checklistSections
    );
  }

  const overviewBlocks = { ...EMPTY_OVERVIEW(), ...(setup.overviewBlocks && typeof setup.overviewBlocks === 'object' ? setup.overviewBlocks : {}) };
  const marketConditions = {
    ...EMPTY_MC(),
    ...(setup.marketConditions && typeof setup.marketConditions === 'object' ? setup.marketConditions : {}),
  };
  const entryRules = { ...EMPTY_ER(), ...(setup.entryRules && typeof setup.entryRules === 'object' ? setup.entryRules : {}) };
  const exitRules = { ...EMPTY_XR(), ...(setup.exitRules && typeof setup.exitRules === 'object' ? setup.exitRules : {}) };
  const riskRulesHL = { ...EMPTY_RR(), ...(setup.riskRules && typeof setup.riskRules === 'object' ? setup.riskRules : {}) };
  const guardrails = { ...EMPTY_GR(), ...(setup.guardrails && typeof setup.guardrails === 'object' ? setup.guardrails : {}) };

  const entryChecklist = Array.isArray(setup.entryChecklist) ? setup.entryChecklist : [];

  return {
    ...setup,
    name: setup.name || 'Untitled playbook',
    marketType: setup.marketType || '',
    setupType: setup.setupType || '',
    timeframes: setup.timeframes || '',
    assets: setup.assets || '',
    session: setup.session || '',
    description: setup.description || '',
    icon: setup.icon || '📘',
    color: setup.color || 'var(--tp-accent, #c9a962)',
    status: setup.status || 'active',
    tags: Array.isArray(setup.tags) ? setup.tags : [],
    biasRequirement: setup.biasRequirement || '',
    structureRequirement: setup.structureRequirement || entryRules.structureRequirement || '',
    volatilityCondition: setup.volatilityCondition || marketConditions.volatilityCondition || '',
    sessionTiming: setup.sessionTiming || '',
    confirmationType: setup.confirmationType || entryRules.confirmationType || '',
    entryTrigger: setup.entryTrigger || entryRules.entryTrigger || '',
    entryChecklist,
    stopPlacement: setup.stopPlacement || exitRules.stopPlacement || '',
    maxRisk: setup.maxRisk != null ? String(setup.maxRisk) : riskRulesHL.maxRiskPct || '',
    positionSizing: setup.positionSizing || riskRulesHL.positionSizingRule || '',
    invalidationLogic: setup.invalidationLogic || exitRules.invalidationLogic || '',
    partialsRule: setup.partialsRule || exitRules.scaleOutRule || '',
    trailingLogic: setup.trailingLogic || exitRules.trailingRule || '',
    holdVsExit: setup.holdVsExit || exitRules.holdVsExit || '',
    doNotTrade: Array.isArray(setup.doNotTrade) ? setup.doNotTrade : [],
    commonMistakes: Array.isArray(setup.commonMistakes) ? setup.commonMistakes : [],
    checklistNotes: setup.checklistNotes || entryRules.checklistNotes || '',
    winRate: setup.winRate || '',
    avgR: setup.avgR || '',
    bestPerformance: setup.bestPerformance || '',
    worstPerformance: setup.worstPerformance || '',
    overviewBlocks,
    marketConditions: { ...marketConditions, ...EMPTY_MC(), ...marketConditions },
    entryRules: {
      ...entryRules,
      structureRequirement: entryRules.structureRequirement || setup.structureRequirement || '',
      confirmationType: entryRules.confirmationType || setup.confirmationType || '',
      entryTrigger: entryRules.entryTrigger || setup.entryTrigger || '',
      checklistNotes: entryRules.checklistNotes || setup.checklistNotes || '',
    },
    exitRules: {
      ...exitRules,
      stopPlacement: exitRules.stopPlacement || setup.stopPlacement || '',
      invalidationLogic: exitRules.invalidationLogic || setup.invalidationLogic || '',
      scaleOutRule: exitRules.scaleOutRule || setup.partialsRule || '',
      trailingRule: exitRules.trailingRule || setup.trailingLogic || '',
      holdVsExit: exitRules.holdVsExit || setup.holdVsExit || '',
    },
    riskRules: {
      ...riskRulesHL,
      maxRiskPct: riskRulesHL.maxRiskPct || setup.maxRisk || '',
      positionSizingRule: riskRulesHL.positionSizingRule || setup.positionSizing || '',
    },
    guardrails,
    checklistSections,
    reviewNotesCount: setup.reviewNotesCount ?? 0,
    lastUsedAt: setup.lastUsedAt || null,
    archivedAt: setup.archivedAt || null,
    createdAt: setup.createdAt,
    updatedAt: setup.updatedAt,
    id: setup.id,
  };
}

export function setupToPayload(form) {
  return {
    ...form,
    entryChecklist: form.entryChecklist,
    doNotTrade: form.doNotTrade,
    commonMistakes: form.commonMistakes,
    tags: form.tags,
    marketConditions: form.marketConditions,
    entryRules: form.entryRules,
    exitRules: form.exitRules,
    riskRules: form.riskRules,
    guardrails: form.guardrails,
    checklistSections: form.checklistSections,
    overviewBlocks: form.overviewBlocks,
  };
}

/**
 * Aurax Trading Behaviour Score – separate from Platform Discipline Score.
 * Weighting: Risk Discipline 30%, Rule Adherence 30%, Consistency 25%, Emotional Control 15%.
 * Clamped 0–100. Used for Trader CV only.
 */

const WEIGHTS = {
  riskDiscipline: 0.30,
  ruleAdherence: 0.30,
  consistency: 0.25,
  emotionalControl: 0.15,
};

/**
 * @param {Object} breakdown - { riskDiscipline, ruleAdherence, consistency, emotionalControl } each 0–100
 * @returns {{ auraxScore: number, breakdown: Object }}
 */
export function calculateAuraxScore(breakdown) {
  const r = Number(breakdown.riskDiscipline) || 0;
  const u = Number(breakdown.ruleAdherence) || 0;
  const c = Number(breakdown.consistency) || 0;
  const e = Number(breakdown.emotionalControl) || 0;
  const score =
    r * WEIGHTS.riskDiscipline +
    u * WEIGHTS.ruleAdherence +
    c * WEIGHTS.consistency +
    e * WEIGHTS.emotionalControl;
  return {
    auraxScore: Math.round(Math.max(0, Math.min(100, score))),
    breakdown: {
      riskDiscipline: Math.max(0, Math.min(100, r)),
      ruleAdherence: Math.max(0, Math.min(100, u)),
      consistency: Math.max(0, Math.min(100, c)),
      emotionalControl: Math.max(0, Math.min(100, e)),
    },
  };
}

export function getAuraxRankTitle(auraxScore) {
  if (auraxScore >= 90) return 'Precision Trader';
  if (auraxScore >= 75) return 'Elite Operator';
  if (auraxScore >= 60) return 'Disciplined Trader';
  if (auraxScore >= 45) return 'Structured Trader';
  return 'Rookie';
}

export { WEIGHTS as AURAX_WEIGHTS };

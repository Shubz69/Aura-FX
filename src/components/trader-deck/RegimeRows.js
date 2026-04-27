import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const BASE_KEYS = ['currentRegime', 'bias', 'primaryDriver', 'secondaryDriver', 'marketSentiment', 'tradeEnvironment'];
const OPTIONAL_KEYS = ['biasStrength', 'convictionClarity'];
const OUTLOOK_METRIC_KEYS = [
  'regimeScore',
  'regimeBiasLabel',
  'trendState',
  'volatilityRegime',
  'liquidityCondition',
  'convictionLevel',
];

function regimeLabelKey(rowKey) {
  const map = {
    currentRegime: 'traderDeck.regime.currentRegime',
    bias: 'traderDeck.regime.bias',
    primaryDriver: 'traderDeck.regime.primaryDriver',
    secondaryDriver: 'traderDeck.regime.secondaryDriver',
    marketSentiment: 'traderDeck.regime.marketSentiment',
    tradeEnvironment: 'traderDeck.regime.tradeEnvironment',
    biasStrength: 'traderDeck.regime.biasStrength',
    convictionClarity: 'traderDeck.regime.convictionClarity',
    regimeScore: 'traderDeck.regime.regimeScore',
    regimeBiasLabel: 'traderDeck.regime.regimeBiasLabel',
    trendState: 'traderDeck.regime.trendState',
    volatilityRegime: 'traderDeck.regime.volatilityRegime',
    liquidityCondition: 'traderDeck.regime.liquidityCondition',
    convictionLevel: 'traderDeck.regime.convictionLevel',
  };
  return map[rowKey] || rowKey;
}

export default function RegimeRows({ regime }) {
  const { t } = useTranslation();
  const dash = t('traderDeck.eta.emDash');

  const { baseRows, extraKeys, outlookRows } = useMemo(() => {
    if (!regime) return { baseRows: [], extraKeys: [], outlookRows: [] };
    const extra = OPTIONAL_KEYS.filter((key) => regime[key] != null && String(regime[key]).trim() !== '');
    const hasOutlook = regime.regimeScore != null && Number.isFinite(Number(regime.regimeScore));
    const outlook = hasOutlook
      ? OUTLOOK_METRIC_KEYS.filter((key) => regime[key] != null && String(regime[key]).trim() !== '')
      : [];
    return { baseRows: BASE_KEYS, extraKeys: extra, outlookRows: outlook };
  }, [regime]);

  if (!regime) return null;

  const formatOutlook = (key, v) => {
    if (v == null || v === '') return dash;
    if (key === 'regimeScore') return `${v}/100`;
    return String(v);
  };

  return (
    <div className="td-mi-regime-rows">
      {baseRows.map((key) => (
        <div key={key} className="td-mi-regime-row">
          <span className="td-mi-regime-label">{t(regimeLabelKey(key))}:</span>
          <span className="td-mi-regime-value">{regime[key] || dash}</span>
        </div>
      ))}
      {extraKeys.map((key) => (
        <div key={key} className="td-mi-regime-row">
          <span className="td-mi-regime-label">{t(regimeLabelKey(key))}:</span>
          <span className="td-mi-regime-value">{regime[key] || dash}</span>
        </div>
      ))}
      {outlookRows.map((key) => (
        <div key={key} className="td-mi-regime-row td-mi-regime-row--outlook">
          <span className="td-mi-regime-label">{t(regimeLabelKey(key))}:</span>
          <span className="td-mi-regime-value">{formatOutlook(key, regime[key])}</span>
        </div>
      ))}
      {regime.regimeNarrative && String(regime.regimeNarrative).trim() ? (
        <p className="td-mi-regime-narrative">{String(regime.regimeNarrative).trim()}</p>
      ) : null}
    </div>
  );
}

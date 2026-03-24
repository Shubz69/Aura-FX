import {
  unitToUsd,
  accountCurrencyToUsd,
  usdToAccountCurrency,
  getRiskAmountUsd,
  buildFxRatesFromPriceMap,
  convertUsdPnLToAccount,
} from '../accountCurrency';

describe('unitToUsd', () => {
  test('USD is 1', () => {
    expect(unitToUsd('USD', {})).toBe(1);
  });

  test('EUR via EURUSD', () => {
    expect(unitToUsd('EUR', { EURUSD: 1.1 })).toBeCloseTo(1.1, 8);
  });

  test('JPY via USDJPY', () => {
    expect(unitToUsd('JPY', { USDJPY: 150 })).toBeCloseTo(1 / 150, 10);
  });
});

describe('accountCurrencyToUsd / usdToAccountCurrency', () => {
  const rates = { EURUSD: 1.25, GBPUSD: 1.3 };

  test('100 EUR → USD', () => {
    expect(accountCurrencyToUsd(100, 'EUR', rates)).toBeCloseTo(125, 6);
  });

  test('125 USD → EUR', () => {
    expect(usdToAccountCurrency(125, 'EUR', rates)).toBeCloseTo(100, 6);
  });

  test('GBP account round-trip', () => {
    const usd = accountCurrencyToUsd(200, 'GBP', rates);
    expect(usdToAccountCurrency(usd, 'GBP', rates)).toBeCloseTo(200, 4);
  });
});

describe('getRiskAmountUsd', () => {
  test('USD account: riskUsd equals risk in account', () => {
    const r = getRiskAmountUsd({ accountBalance: 10000, riskPercent: 1, accountCurrency: 'USD', fxRates: {} });
    expect(r.riskUsd).toBe(100);
    expect(r.riskAccount).toBe(100);
  });

  test('EUR account with rates', () => {
    const r = getRiskAmountUsd({
      accountBalance: 10000,
      riskPercent: 1,
      accountCurrency: 'EUR',
      fxRates: { EURUSD: 1.2 },
    });
    expect(r.riskAccount).toBe(100);
    expect(r.riskUsd).toBeCloseTo(120, 6);
  });

  test('missing rate', () => {
    const r = getRiskAmountUsd({
      accountBalance: 10000,
      riskPercent: 1,
      accountCurrency: 'EUR',
      fxRates: {},
    });
    expect(r.riskUsd).toBeNull();
    expect(r.missingRate).toBe(true);
  });
});

describe('buildFxRatesFromPriceMap', () => {
  test('parses snapshot rows', () => {
    const out = buildFxRatesFromPriceMap({
      EURUSD: { rawPrice: '1.08' },
      USDJPY: { price: 151 },
    });
    expect(out.EURUSD).toBeCloseTo(1.08, 6);
    expect(out.USDJPY).toBe(151);
  });
});

describe('convertUsdPnLToAccount', () => {
  test('USD passthrough', () => {
    const r = convertUsdPnLToAccount(100, 50, { accountCurrency: 'USD', fxRates: {} });
    expect(r.potentialProfit).toBe(100);
    expect(r.potentialLoss).toBe(50);
  });

  test('GBP conversion', () => {
    const r = convertUsdPnLToAccount(130, 65, { accountCurrency: 'GBP', fxRates: { GBPUSD: 1.3 } });
    expect(r.potentialProfit).toBeCloseTo(100, 4);
    expect(r.potentialLoss).toBeCloseTo(50, 4);
  });
});

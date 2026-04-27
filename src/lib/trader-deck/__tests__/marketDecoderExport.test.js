import { buildMarketDecoderExport, validateMarketDecoderSections } from '../marketDecoderExport';

describe('marketDecoder export integrity', () => {
  test('keeps fundamental backing separate from technical analysis', () => {
    const brief = {
      header: { asset: 'EURUSD', price: 1.08 },
      instantRead: { bias: 'Bullish', bestApproach: 'Wait for pullback' },
      keyLevels: { resistance1: 1.09, support1: 1.07, pivot: 1.08 },
      whatMattersNow: [
        { label: 'Macro driver', text: 'ECB/Fed rate differential is compressing.' },
        { label: 'Technical driver', text: 'Price holds above the prior weekly midpoint.' },
        { label: 'Immediate risk/event', text: 'US CPI tomorrow could reprice terminal rates.' },
      ],
      executionGuidance: {
        entryCondition: 'Break and retest above weekly high.',
        invalidation: 'Loss of daily structure low.',
      },
      scenarioMap: { bullish: { condition: 'Hold above pivot' }, bearish: { condition: 'Fail at resistance' } },
    };
    const out = buildMarketDecoderExport(brief, { symbol: 'EURUSD' });
    expect(out.fundamentals.fundamentalBacking.toLowerCase()).toContain('rate');
    expect(out.fundamentals.fundamentalBacking.toLowerCase()).not.toContain('retest');
    expect(out.technical.confirmation.toLowerCase()).toContain('break and retest');
  });

  test('missing fundamentals never fallback to technical text', () => {
    const output = validateMarketDecoderSections({
      technical: { confirmation: 'Breakout above pivot and retest.' },
      fundamentals: { fundamentalBacking: '' },
      keyDrivers: [],
      traderThesis: {},
    });
    expect(output.fundamentals.fundamentalBacking).toBe('No fundamental analysis saved for this older decoder run');
    expect(output.fundamentals.fundamentalBacking.toLowerCase()).not.toContain('breakout');
  });

  test('builds key drivers from macro/news context only', () => {
    const output = validateMarketDecoderSections({
      fundamentals: {
        macroBackdrop: 'Fed repricing after stronger payrolls.',
        centralBankPolicy: 'ECB guidance remains cautious.',
        economicData: 'Upcoming CPI and PMIs.',
      },
      keyDrivers: [],
    });
    expect(output.keyDrivers.length).toBeGreaterThan(0);
    expect(output.keyDrivers[0].explanation.toLowerCase()).toContain('fed');
  });
});

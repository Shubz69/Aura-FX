import { formatMoneyAccount, formatSignedPnL } from '../formatAccountCurrency';

describe('formatSignedPnL', () => {
  test('positive has leading plus', () => {
    expect(formatSignedPnL(100, 'USD')).toMatch(/^\+/);
    expect(formatSignedPnL(100, 'USD')).toContain('$');
  });

  test('negative uses formatMoneyAccount', () => {
    expect(formatSignedPnL(-50, 'GBP')).toMatch(/^-/);
    expect(formatSignedPnL(-50, 'GBP')).toContain('£');
  });

  test('JPY uses zero decimals', () => {
    expect(formatSignedPnL(1000, 'JPY')).toMatch(/¥/);
    expect(formatSignedPnL(1000, 'JPY')).not.toMatch(/\.00/);
  });

  test('nullish is zero in currency', () => {
    expect(formatSignedPnL(null, 'EUR')).toBe(formatMoneyAccount(0, 'EUR'));
  });
});

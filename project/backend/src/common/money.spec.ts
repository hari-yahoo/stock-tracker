import {
  assertSqliteInteger,
  convertCurrencyMicros,
  divideRounded,
  formatScaledDecimal,
  parseScaledDecimal,
  tradeValueMicros,
} from './money';

describe('fixed-scale monetary arithmetic', () => {
  it('parses and formats without using floating point', () => {
    expect(parseScaledDecimal('123.45')).toBe(123_450_000n);
    expect(parseScaledDecimal('-0.000001')).toBe(-1n);
    expect(formatScaledDecimal(123_450_000n)).toBe('123.45');
  });

  it('rejects excess precision instead of silently rounding input', () => {
    expect(() => parseScaledDecimal('1.0000001')).toThrow(
      'more than 6 decimal places',
    );
  });

  it('rounds midpoint results away from zero', () => {
    expect(divideRounded(5n, 2n)).toBe(3n);
    expect(divideRounded(-5n, 2n)).toBe(-3n);
    expect(divideRounded(4n, 3n)).toBe(1n);
  });

  it('calculates trade values and FX conversions at defined scales', () => {
    expect(tradeValueMicros(1_500_000n, 10_250_000n)).toBe(15_375_000n);
    expect(convertCurrencyMicros(10_000_000n, 83_125_000_000n)).toBe(
      831_250_000n,
    );
  });

  it('guards values before database persistence', () => {
    expect(() => assertSqliteInteger(2n ** 63n, 'amount')).toThrow(
      'signed 64-bit integer range',
    );
  });
});

export const MONEY_SCALE = 1_000_000n;
export const QUANTITY_SCALE = 1_000_000n;
export const FX_RATE_SCALE = 1_000_000_000n;

const SQLITE_INTEGER_MIN = -(2n ** 63n);
const SQLITE_INTEGER_MAX = 2n ** 63n - 1n;

export function parseScaledDecimal(value: string, scaleDigits = 6): bigint {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid decimal value: ${value}`);

  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > scaleDigits) {
    throw new Error(
      `Value has more than ${scaleDigits} decimal places: ${value}`,
    );
  }

  const scale = 10n ** BigInt(scaleDigits);
  const fractional = fraction.padEnd(scaleDigits, '0');
  const magnitude = BigInt(whole) * scale + BigInt(fractional || '0');

  return sign === '-' ? -magnitude : magnitude;
}

export function formatScaledDecimal(value: bigint, scaleDigits = 6): string {
  const sign = value < 0n ? '-' : '';
  const magnitude = value < 0n ? -value : value;
  const scale = 10n ** BigInt(scaleDigits);
  const whole = magnitude / scale;
  const fraction = (magnitude % scale)
    .toString()
    .padStart(scaleDigits, '0')
    .replace(/0+$/, '');

  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

/** Divides and rounds midpoint values away from zero. */
export function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('Cannot divide by zero');

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const absoluteRemainder = remainder < 0n ? -remainder : remainder;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;

  if (absoluteRemainder * 2n < absoluteDenominator) return quotient;
  return quotient + (numerator * denominator < 0n ? -1n : 1n);
}

export function tradeValueMicros(
  quantityMicros: bigint,
  priceMicros: bigint,
): bigint {
  return divideRounded(quantityMicros * priceMicros, QUANTITY_SCALE);
}

export function convertCurrencyMicros(
  amountMicros: bigint,
  rateNanos: bigint,
): bigint {
  return divideRounded(amountMicros * rateNanos, FX_RATE_SCALE);
}

export function assertSqliteInteger(value: bigint, field: string): void {
  if (value < SQLITE_INTEGER_MIN || value > SQLITE_INTEGER_MAX) {
    throw new Error(`${field} exceeds SQLite signed 64-bit integer range`);
  }
}

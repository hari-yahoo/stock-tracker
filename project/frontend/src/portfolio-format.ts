export function scaledToFixed(value: string, digits = 2) {
  const negative = value.startsWith('-')
  const normalized = negative ? value.slice(1) : value
  const [whole = '0', fraction = ''] = normalized.split('.')
  const scale = 10n ** BigInt(digits)
  const sourceScale = 10n ** BigInt(fraction.length)
  const source = BigInt(whole) * sourceScale + BigInt(fraction || '0')
  const rounded = (source * scale + sourceScale / 2n) / sourceScale
  const roundedWhole = rounded / scale
  const roundedFraction = (rounded % scale).toString().padStart(digits, '0')
  const grouped = roundedWhole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}.${roundedFraction}`
}

export function formatMoney(value: string | null, currency = 'INR') {
  if (value === null) return '—'
  const symbols: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' }
  return `${symbols[currency] ?? `${currency} `}${scaledToFixed(value)}`
}

export function formatQuantity(value: string) {
  const [whole, fraction = ''] = value.split('.')
  const trimmedFraction = fraction.slice(0, 4).replace(/0+$/, '')
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

export function pnlTone(value: string | null) {
  if (!value) return 'neutral'
  return value.startsWith('-') ? 'negative' : 'positive'
}

function decimalParts(value: string) {
  const negative = value.startsWith('-')
  const normalized = negative ? value.slice(1) : value
  const [whole = '0', fraction = ''] = normalized.split('.')
  return {
    negative,
    digits: BigInt(`${whole}${fraction}` || '0'),
    scale: fraction.length,
  }
}

function toSignedScaledInteger(value: string, scale: number) {
  const parts = decimalParts(value)
  const scaled = parts.digits * 10n ** BigInt(scale - parts.scale)
  return parts.negative ? -scaled : scaled
}

function scaledIntegerToDecimal(value: bigint, scale: number) {
  const negative = value < 0n
  const absolute = negative ? -value : value
  const factor = 10n ** BigInt(scale)
  const whole = absolute / factor
  const fraction = scale === 0 ? '' : (absolute % factor).toString().padStart(scale, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole.toString()}${fraction ? `.${fraction}` : ''}`
}

export function compareDecimalStrings(a: string | null, b: string | null) {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  const scale = Math.max(decimalParts(a).scale, decimalParts(b).scale)
  const left = toSignedScaledInteger(a, scale)
  const right = toSignedScaledInteger(b, scale)
  if (left === right) return 0
  return left > right ? 1 : -1
}

export function sumDecimalStrings(values: Array<string | null>) {
  const present = values.filter((value): value is string => value !== null)
  if (!present.length) return null
  const scale = present.reduce((max, value) => Math.max(max, decimalParts(value).scale), 0)
  const total = present.reduce((sum, value) => sum + toSignedScaledInteger(value, scale), 0n)
  return scaledIntegerToDecimal(total, scale)
}

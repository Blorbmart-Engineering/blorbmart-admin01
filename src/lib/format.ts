/**
 * Formatting for a screen read by comparison.
 *
 * Every helper here is built around the same idea: an operator scanning a
 * column is looking for the value that is unlike the others, so the format
 * must make differences obvious and never hide precision that matters —
 * money is never abbreviated, but a count of products can be.
 */

const NGN = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
})

/** Money is always exact and always carries its symbol. */
export const money = (value: unknown) => NGN.format(Number(value) || 0)

/** Counts may be abbreviated; nothing here is a financial figure. */
export function compact(value: unknown) {
  const n = Number(value) || 0
  if (Math.abs(n) < 10_000) return n.toLocaleString('en-NG')
  return new Intl.NumberFormat('en-NG', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export const count = (value: unknown) => (Number(value) || 0).toLocaleString('en-NG')

/** Firestore reaches us as millis, ISO strings, or `{_seconds}`. All three. */
export function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value)
  if (typeof value === 'object') {
    const s = (value as { _seconds?: number; seconds?: number })
    const secs = s._seconds ?? s.seconds
    if (typeof secs === 'number') return new Date(secs * 1000)
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return new Date(parsed)
  }
  return null
}

export function dateTime(value: unknown) {
  const d = toDate(value)
  if (!d) return '—'
  return d.toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function dateOnly(value: unknown) {
  const d = toDate(value)
  if (!d) return '—'
  return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Relative time, which is what an operator actually reads.
 *
 * "3m ago" answers "is this happening now?" — the question being asked of a
 * live queue. An absolute timestamp requires mental arithmetic to answer it,
 * so the absolute value goes in a tooltip instead.
 */
export function ago(value: unknown) {
  const d = toDate(value)
  if (!d) return '—'
  const seconds = Math.round((Date.now() - d.getTime()) / 1000)
  if (seconds < 0) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return dateOnly(d)
}

export function duration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m`
}

export const titleCase = (value: unknown) =>
  String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()

/** Reads any of the several field names the older collections use. */
export function pick<T = unknown>(row: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const key of keys) {
    const value = key.split('.').reduce<unknown>((acc, part) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part]
      return undefined
    }, row)
    if (value !== undefined && value !== null && value !== '') return value as T
  }
  return undefined
}

export const text = (value: unknown, fallback = '—') => {
  const s = value === null || value === undefined ? '' : String(value)
  return s.trim() === '' ? fallback : s
}

/** Truncates an id for display while keeping enough to match against a log. */
export const shortId = (value: unknown, length = 8) => {
  const s = String(value ?? '')
  return s.length <= length ? s || '—' : `${s.slice(0, length)}…`
}

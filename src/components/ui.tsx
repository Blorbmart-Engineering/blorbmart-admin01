import {
  forwardRef,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Loader2, X, type LucideIcon } from 'lucide-react'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

/* ──────────────────────────────── Tone ───────────────────────────────── */

/**
 * One colour vocabulary for the whole console.
 *
 * Status is the single most-read thing on every screen, so it has to mean the
 * same colour everywhere: a red badge on the orders table and a red badge on
 * the withdrawals table must both mean "someone needs to act". Defined once
 * here rather than per-page, which is how palettes drift until green means
 * "paid" on one screen and "pending" on another.
 */
export type Tone = 'neutral' | 'brand' | 'good' | 'warn' | 'bad' | 'info'

const TONE_BADGE: Record<Tone, string> = {
  neutral: 'bg-raised text-ink-soft border-line',
  brand: 'bg-brand-soft text-brand border-brand/30',
  good: 'bg-good-soft text-good border-good/30',
  warn: 'bg-warn-soft text-warn border-warn/30',
  bad: 'bg-bad-soft text-bad border-bad/30',
  info: 'bg-info-soft text-info border-info/30',
}

/**
 * Maps the many status vocabularies in this database onto those six tones.
 *
 * The collections disagree with each other — an order is `completed`, a payout
 * is `success`, a vendor is `verified`, a rider is `active`. They all mean
 * "fine", and an operator should not have to learn four vocabularies to read
 * four tables.
 */
export function statusTone(status: unknown): Tone {
  const s = String(status ?? '').toLowerCase()
  if (!s) return 'neutral'
  if (/(active|completed|complete|success|successful|delivered|paid|verified|approved|live|good|resolved)/.test(s)) return 'good'
  if (/(pending|processing|onboarding|awaiting|queued|preparing|assigned|slow|review)/.test(s)) return 'warn'
  if (/(failed|error|cancelled|canceled|rejected|suspended|blocked|declined|refunded|degraded|reversed)/.test(s)) return 'bad'
  if (/(sourcing|on_the_way|picked_up|in_transit|shipped)/.test(s)) return 'info'
  return 'neutral'
}

/* ─────────────────────────────── Badge ───────────────────────────────── */

export function Badge({
  children,
  tone = 'neutral',
  className,
  dot = false,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
  dot?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap',
        TONE_BADGE[tone],
        className,
      )}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

/** Badge that derives its own colour from the status text it is given. */
export const StatusBadge = ({ status, className }: { status: unknown; className?: string }) => (
  <Badge tone={statusTone(status)} className={className} dot>
    {String(status ?? '—').replace(/[_-]+/g, ' ')}
  </Badge>
)

/* ─────────────────────────────── Button ──────────────────────────────── */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
  icon?: LucideIcon
}

export function Button({
  variant = 'outline',
  size = 'md',
  loading = false,
  icon: Icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap',
        'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
        'disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'h-8 px-3 text-[12.5px]' : 'h-9.5 px-4 text-[13.5px]',
        variant === 'primary' && 'bg-brand text-white hover:bg-brand/85',
        variant === 'outline' && 'border border-line bg-raised text-ink hover:border-ink-faint',
        variant === 'ghost' && 'text-ink-soft hover:text-ink hover:bg-raised',
        variant === 'danger' && 'border border-bad/40 bg-bad-soft text-bad hover:bg-bad/20',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : Icon ? <Icon className="w-4 h-4" aria-hidden /> : null}
      {children}
    </button>
  )
}

/* ─────────────────────────────── Inputs ──────────────────────────────── */

const FIELD =
  'w-full rounded-lg border border-line bg-raised px-3 text-[13.5px] text-ink placeholder:text-ink-faint ' +
  'outline-none transition-colors focus:border-brand disabled:opacity-60'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string }>(
  function Input({ label, className, id, ...rest }, ref) {
    const inputId = id ?? (label ? `f-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {label}
          </label>
        )}
        <input ref={ref} id={inputId} className={cn(FIELD, 'h-9.5', className)} {...rest} />
      </div>
    )
  },
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }
>(function Textarea({ label, className, id, rows = 4, ...rest }, ref) {
  const areaId = id ?? (label ? `t-${label.toLowerCase().split(' ').join('-')}` : undefined)
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={areaId} className="block text-[11px] font-bold uppercase tracking-wide text-ink-faint">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={areaId}
        rows={rows}
        className={cn(FIELD, 'py-2 leading-relaxed', className)}
        {...rest}
      />
    </div>
  )
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { label?: string }>(
  function Select({ label, className, id, children, ...rest }, ref) {
    const selectId = id ?? (label ? `s-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={selectId} className="block text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {label}
          </label>
        )}
        <select ref={ref} id={selectId} className={cn(FIELD, 'h-9.5 pr-8', className)} {...rest}>
          {children}
        </select>
      </div>
    )
  },
)

/* ─────────────────────────────── Surfaces ────────────────────────────── */

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('rounded-xl border border-line bg-panel', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-line-soft px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-[14px] font-bold text-ink truncate">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-faint">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

/**
 * A single headline number.
 *
 * `hint` exists because a bare number is rarely actionable — "1,240 orders" is
 * trivia, "1,240 orders, 38 in the last day" is a trend. `tone` is reserved
 * for numbers that indicate a problem, so colour on this screen always means
 * "look here" rather than decoration.
 */
export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  loading = false,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  tone?: Tone
  loading?: boolean
}) {
  const accent: Record<Tone, string> = {
    neutral: 'text-ink',
    brand: 'text-brand',
    good: 'text-good',
    warn: 'text-warn',
    bad: 'text-bad',
    info: 'text-info',
  }
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</p>
        {Icon && <Icon className={cn('w-4 h-4', accent[tone])} aria-hidden />}
      </div>
      {loading ? (
        <div className="skeleton mt-2 h-7 w-24 rounded-md" />
      ) : (
        <p className={cn('mt-1.5 text-[26px] font-bold leading-none tabular', accent[tone])}>{value}</p>
      )}
      {hint && <p className="mt-1.5 text-[12px] text-ink-faint">{hint}</p>}
    </div>
  )
}

/* ──────────────────────────────── States ────────────────────────────── */

export function Empty({ icon: Icon, title, message, action }: { icon?: LucideIcon; title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {Icon && <Icon className="w-7 h-7 text-ink-faint" aria-hidden />}
      <div>
        <p className="text-[14px] font-bold text-ink">{title}</p>
        {message && <p className="mt-1 max-w-sm text-[13px] text-ink-faint">{message}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <p className="text-[13.5px] font-semibold text-bad">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('skeleton rounded-md', className)} aria-hidden />
)

/* ──────────────────────────────── Modal ─────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8">
      {/* Click-outside closes, but the panel stops propagation so a drag that
          ends outside does not discard half-typed input. */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full rounded-xl border border-line bg-panel shadow-2xl',
          wide ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        <header className="flex items-center justify-between gap-4 border-b border-line-soft px-4 py-3">
          <h2 className="text-[14px] font-bold text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-ink-faint transition-colors hover:bg-raised hover:text-ink"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line-soft px-4 py-3">{footer}</footer>}
      </div>
    </div>
  )
}

/* ──────────────────────────────── Table ─────────────────────────────── */

export interface Column<T> {
  key: string
  header: ReactNode
  /** Right-align anything numeric so digits line up down the column. */
  align?: 'left' | 'right'
  width?: string
  render: (row: T) => ReactNode
}

/**
 * The table every list screen uses.
 *
 * Horizontal scroll lives inside the table's own container rather than on the
 * page: a wide table must never make the whole layout scroll sideways, because
 * that moves the navigation off screen.
 */
export function DataTable<T>({
  columns,
  rows,
  keyOf,
  loading = false,
  error,
  onRetry,
  empty,
  onRowClick,
  skeletonRows = 8,
}: {
  columns: Column<T>[]
  rows: T[]
  keyOf: (row: T, index: number) => string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  empty?: ReactNode
  onRowClick?: (row: T) => void
  skeletonRows?: number
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />

  if (!loading && rows.length === 0) {
    return <>{empty ?? <Empty title="Nothing here yet" message="No records match the current filters." />}</>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  'px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint',
                  col.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={i} className="border-b border-line-soft">
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-3">
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row, index) => (
                <tr
                  key={keyOf(row, index)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-line-soft transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-raised',
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-3 py-2.5 align-middle text-ink-soft',
                        col.align === 'right' && 'text-right tabular',
                      )}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  )
}

/* ──────────────────────────────── Toolbar ───────────────────────────── */

export const Toolbar = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('flex flex-wrap items-end gap-2', className)}>{children}</div>
)

export const PageHeader = ({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-[21px] font-bold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-[13px] text-ink-faint">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
)

/** Label/value pair for detail panels, where scanning is vertical. */
export const Detail = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-line-soft py-2 last:border-0">
    <span className="shrink-0 text-[12px] font-semibold text-ink-faint">{label}</span>
    <span className="min-w-0 break-words text-right text-[13px] text-ink">{children}</span>
  </div>
)

import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Gift, PiggyBank, RefreshCw, Truck } from 'lucide-react'
import { errorMessage } from '../lib/api'
import { count, money } from '../lib/format'
import { profitApi, type ProfitRange, type ProfitRow, type ProfitTotals } from '../lib/profit'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Empty,
  Input,
  PageHeader,
  Select,
  Stat,
  Toolbar,
  cn,
  type Column,
} from '../components/ui'

const RANGES: { value: ProfitRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
]

/** Today's date in Lagos as YYYY-MM-DD — the starting point for a custom range. */
const lagosToday = () => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10)

const deliveredAt = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleString('en-NG', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Lagos',
      })
    : '—'

type TotalsLine = ProfitTotals & { id: '__totals' }
type Line = ProfitRow | TotalsLine
const isTotals = (row: Line): row is TotalsLine => row.id === '__totals'
const struck = (row: Line) => !isTotals(row) && row.status === 'reversed'

/**
 * Platform profit.
 *
 * What Blorbmart itself earned, order by order: the service fee plus its share
 * of the delivery fee, less what the platform paid for — promotions, and the
 * bonus a rider earns for paying a restaurant at the counter. Vendors keep
 * their whole product price and riders the rest of the delivery fee, so
 * nothing else on an order is the platform's.
 *
 * An order counts when it is delivered. Refunded and cancelled ones stay in
 * the list, struck through, and are left out of every total — so the totals
 * row is exactly the sum of the rows above it that are not struck through.
 */
export default function Profit() {
  const [range, setRange] = useState<ProfitRange>('month')
  const [from, setFrom] = useState(lagosToday)
  const [to, setTo] = useState(lagosToday)
  const customValid = Boolean(from && to && from <= to)

  const report = useQuery({
    queryKey: ['profit', range, range === 'custom' ? from : null, range === 'custom' ? to : null],
    queryFn: () => (range === 'custom' ? profitApi.report({ from, to }) : profitApi.report({ range })),
    enabled: range !== 'custom' || customValid,
    staleTime: 30_000,
  })

  const data = report.data
  const totals = data?.totals
  const percent = data?.deliveryCommissionPercent ?? 10

  // The totals ride along as a last row, so every column's sum sits directly
  // under the figures it adds up.
  const rows: Line[] = useMemo(
    () => (data && data.rows.length ? [...data.rows, { id: '__totals' as const, ...data.totals }] : []),
    [data],
  )

  const amount = (row: Line, value: number, { cost = false, strong = false } = {}): ReactNode => {
    if (cost && value === 0 && !isTotals(row)) return <span className="text-ink-faint">—</span>
    return (
      <span
        className={cn(
          struck(row) && 'text-ink-faint line-through',
          (strong || isTotals(row)) && 'font-semibold text-ink',
          strong && value < 0 && !struck(row) && 'text-bad',
        )}
      >
        {cost && value > 0 ? '−' : ''}
        {money(value)}
      </span>
    )
  }

  const columns: Column<Line>[] = [
    {
      key: 'order',
      header: 'Order',
      render: (row) =>
        isTotals(row) ? (
          <span className="font-bold text-ink">Totals · {count(row.orders)} orders</span>
        ) : (
          <div className="min-w-0">
            <p className={cn('truncate font-semibold text-ink', struck(row) && 'text-ink-faint line-through')}>
              {row.orderId}
            </p>
            <p className="truncate text-[11.5px] text-ink-faint">
              {row.storeName ?? '—'}
              {struck(row) && (
                <Badge tone="bad" className="ml-2">
                  {row.reversalReason ?? 'reversed'}
                </Badge>
              )}
            </p>
          </div>
        ),
    },
    { key: 'when', header: 'Delivered', render: (row) => (isTotals(row) ? '' : deliveredAt(row.recognisedAt)) },
    { key: 'service', header: 'Service fee', align: 'right', render: (row) => amount(row, row.serviceFee) },
    { key: 'delivery', header: 'Delivery fee', align: 'right', render: (row) => amount(row, row.deliveryFee) },
    {
      key: 'commission',
      header: `${percent}% of delivery`,
      align: 'right',
      render: (row) => amount(row, row.deliveryCommission),
    },
    { key: 'promo', header: 'Promos', align: 'right', render: (row) => amount(row, row.promoCost, { cost: true }) },
    { key: 'bonus', header: 'Rider bonus', align: 'right', render: (row) => amount(row, row.riderBonus, { cost: true }) },
    { key: 'profit', header: 'Profit', align: 'right', render: (row) => amount(row, row.profit, { strong: true }) },
  ]

  const loading = report.isLoading && report.fetchStatus !== 'idle'

  return (
    <>
      <PageHeader
        title="Platform profit"
        subtitle="What Blorbmart earned on each delivered order."
        actions={
          <Button size="sm" icon={RefreshCw} loading={report.isFetching} onClick={() => report.refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Profit"
          value={money(totals?.profit)}
          hint={`${count(totals?.orders)} delivered orders`}
          icon={PiggyBank}
          tone={(totals?.profit ?? 0) < 0 ? 'bad' : 'good'}
          loading={loading}
        />
        <Stat label="Service fees" value={money(totals?.serviceFee)} hint="All of it is the platform's" loading={loading} />
        <Stat
          label={`${percent}% of delivery`}
          value={money(totals?.deliveryCommission)}
          hint={`Of ${money(totals?.deliveryFee)} in delivery fees`}
          icon={Truck}
          loading={loading}
        />
        <Stat
          label="Paid by the platform"
          value={money((totals?.promoCost ?? 0) + (totals?.riderBonus ?? 0))}
          hint="Promotions and rider sourcing bonuses"
          icon={Gift}
          tone="warn"
          loading={loading}
        />
      </div>

      <Card
        bodyClassName="p-0"
        title={
          <Toolbar>
            <Select
              label="Period"
              value={range}
              onChange={(e) => setRange(e.target.value as ProfitRange)}
              className="w-44"
            >
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
            {range === 'custom' && (
              <>
                <Input label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" />
                <Input label="To" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-40" />
              </>
            )}
          </Toolbar>
        }
      >
        {range === 'custom' && !customValid ? (
          <Empty icon={PiggyBank} title="Pick a range" message="Choose a start date on or before the end date." />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            keyOf={(row) => row.id}
            loading={loading}
            error={report.isError ? errorMessage(report.error) : null}
            onRetry={() => report.refetch()}
            empty={
              <Empty
                icon={PiggyBank}
                title="No delivered orders"
                message="Nothing was delivered in this period. Profit is tracked from 15 September 2026, so earlier deliveries are not in this report."
              />
            }
          />
        )}
      </Card>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
        Profit = service fee + {percent}% of the delivery fee − promotions − rider sourcing bonuses. Vendors keep their
        full product price and riders {100 - percent}% of the delivery fee. An order counts when it is delivered; refunded
        or cancelled orders are struck through and left out of the totals.
        {data?.reversed ? ` ${count(data.reversed)} in this period.` : ''}
        {data?.truncated && ' This period has more orders than one page shows — narrow the range to see them all.'}
      </p>
    </>
  )
}

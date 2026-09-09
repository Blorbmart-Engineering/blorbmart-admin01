import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Truck } from 'lucide-react'
import { adminApi, errorMessage, type Delivery } from '../lib/api'
import { ago, count, money, shortId, text, titleCase } from '../lib/format'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Empty,
  PageHeader,
  Select,
  Stat,
  StatusBadge,
  Toolbar,
  type Column,
} from '../components/ui'

const STATUSES = [
  'all',
  'assigned',
  'at_store',
  'paid_vendor',
  'picked_up',
  'on_the_way',
  'delivered',
  'cancelled',
]

/**
 * Live and recent deliveries.
 *
 * The column that matters is cash-to-pay: a delivery in "sourcing" settlement
 * means the rider is fronting money at the counter, and one of those stuck in
 * an early state is the platform's money sitting in somebody's pocket. That is
 * the row worth finding, so it is called out rather than buried.
 */
export default function Deliveries() {
  const [status, setStatus] = useState('all')

  const deliveries = useQuery({
    queryKey: ['deliveries', status],
    queryFn: () => adminApi.deliveries({ status, limit: 200 }),
    refetchInterval: 45_000,
    staleTime: 20_000,
  })

  const rows = deliveries.data?.deliveries ?? []
  const inFlight = rows.filter((d) => !['delivered', 'cancelled'].includes(String(d.status)))
  const cashExposed = inFlight.reduce((sum, d) => sum + (d.cashToPay || 0), 0)

  const columns: Column<Delivery>[] = [
    {
      key: 'order',
      header: 'Order',
      render: (d) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{text(d.orderId, shortId(d.id))}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{text(d.storeName)}</p>
        </div>
      ),
    },
    {
      key: 'rider',
      header: 'Rider',
      // Parenthesised because `??` and `&&` cannot be mixed bare — TypeScript
      // rejects it outright, which was breaking `npm run build`.
      render: (d) => text(d.riderName ?? (d.riderId ? shortId(d.riderId) : null)),
    },
    { key: 'dropoff', header: 'Dropoff', render: (d) => text(d.dropoffArea) },
    {
      key: 'mode',
      header: 'Mode',
      render: (d) => (
        <Badge tone={d.settlement === 'rider' ? 'info' : 'neutral'}>{titleCase(text(d.mode, 'delivery'))}</Badge>
      ),
    },
    { key: 'status', header: 'Status', render: (d) => <StatusBadge status={d.status} /> },
    {
      key: 'cash',
      header: 'Rider cash',
      align: 'right',
      render: (d) => (d.cashToPay ? <span className="font-semibold text-warn">{money(d.cashToPay)}</span> : '—'),
    },
    { key: 'earnings', header: 'Earnings', align: 'right', render: (d) => money(d.earnings) },
    { key: 'when', header: 'Created', align: 'right', render: (d) => ago(d.createdAt) },
  ]

  return (
    <>
      <PageHeader
        title="Deliveries"
        subtitle="Every job on the road, and what it is costing."
        actions={
          <Button size="sm" icon={RefreshCw} loading={deliveries.isFetching} onClick={() => deliveries.refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="In flight"
          value={count(inFlight.length)}
          hint="Not yet delivered or cancelled"
          icon={Truck}
          tone={inFlight.length ? 'info' : 'neutral'}
          loading={deliveries.isLoading}
        />
        <Stat
          label="Rider cash on the road"
          value={money(cashExposed)}
          hint="Fronted at counters, not yet settled"
          tone={cashExposed > 0 ? 'warn' : 'good'}
          loading={deliveries.isLoading}
        />
        <Stat
          label="Delivered (shown)"
          value={count(rows.filter((d) => d.status === 'delivered').length)}
          tone="good"
          loading={deliveries.isLoading}
        />
        <Stat
          label="Cancelled (shown)"
          value={count(rows.filter((d) => d.status === 'cancelled').length)}
          tone={rows.some((d) => d.status === 'cancelled') ? 'bad' : 'good'}
          loading={deliveries.isLoading}
        />
      </div>

      <Card
        bodyClassName="p-0"
        title={
          <Toolbar>
            <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All statuses' : titleCase(s)}
                </option>
              ))}
            </Select>
          </Toolbar>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(d) => d.id}
          loading={deliveries.isLoading}
          error={deliveries.isError ? errorMessage(deliveries.error) : null}
          onRetry={() => deliveries.refetch()}
          empty={<Empty icon={Truck} title="No deliveries" message="Nothing matches this status." />}
        />
      </Card>
    </>
  )
}

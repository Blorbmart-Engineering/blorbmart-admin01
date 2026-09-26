import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { AlertTriangle, RefreshCw, Truck } from 'lucide-react'
import { adminApi, errorMessage, type Delivery } from '../lib/api'
import { ago, count, money, shortId, text, titleCase } from '../lib/format'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Detail,
  Empty,
  Input,
  Modal,
  PageHeader,
  Select,
  Stat,
  StatusBadge,
  Toolbar,
  type Column,
} from '../components/ui'

/** Deliveries a rider is still carrying — the only ones that can be cancelled. */
const ACTIVE = ['assigned', 'at_store', 'paid_vendor', 'picked_up', 'on_the_way']

const STATUSES = [
  'active',
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
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('active')
  const [selected, setSelected] = useState<Delivery | null>(null)
  const [reason, setReason] = useState('Test payment')
  const [understood, setUnderstood] = useState(false)

  const deliveries = useQuery({
    queryKey: ['deliveries', status],
    // "In progress" reads every active delivery; the list route is capped at
    // 200 and sorted by age, so an old stuck job could fall off the end.
    queryFn: () =>
      status === 'active' ? adminApi.activeDeliveries() : adminApi.deliveries({ status, limit: 200 }),
    refetchInterval: 45_000,
    staleTime: 20_000,
  })

  const closeModal = () => {
    setSelected(null)
    setReason('Test payment')
    setUnderstood(false)
  }

  const cancel = useMutation({
    mutationFn: (d: Delivery) => adminApi.cancelDelivery(d.id, reason.trim() || 'Cancelled by admin'),
    onSuccess: (r) => {
      if (r.orderCancelled) toast.success(`Delivery ended and order ${r.orderId ?? ''} cancelled. No refund.`)
      else toast(`Delivery ended. The order was not changed: ${r.orderError ?? 'no order linked'}`)
      if (r.needsCashReview) toast('The rider had paid the restaurant cash. It is flagged for review.', { icon: '⚠️' })
      queryClient.invalidateQueries({ queryKey: ['deliveries'] })
      closeModal()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not cancel that delivery.')),
  })

  const isActive = (d: Delivery | null) => Boolean(d && ACTIVE.includes(String(d.status)))

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
                  {s === 'active' ? 'In progress' : s === 'all' ? 'All statuses' : titleCase(s)}
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
          onRowClick={(d) => setSelected(d)}
          empty={<Empty icon={Truck} title="No deliveries" message="Nothing matches this status." />}
        />
      </Card>

      <Modal
        open={Boolean(selected)}
        onClose={closeModal}
        title="Delivery"
        footer={
          selected && (
            <>
              <Button onClick={closeModal}>Close</Button>
              {isActive(selected) && (
                <Button
                  variant="danger"
                  loading={cancel.isPending}
                  disabled={!understood}
                  onClick={() => cancel.mutate(selected)}
                >
                  Cancel delivery and order
                </Button>
              )}
            </>
          )
        }
      >
        {selected && (
          <div className="space-y-4">
            <div>
              <Detail label="Order">{text(selected.orderId)}</Detail>
              <Detail label="Store">{text(selected.storeName)}</Detail>
              <Detail label="Rider">{text(selected.riderName ?? selected.riderId)}</Detail>
              <Detail label="Status">
                <StatusBadge status={selected.status} />
              </Detail>
              <Detail label="Cash the rider paid">
                {selected.cashPaidAmount ? money(selected.cashPaidAmount) : '—'}
              </Detail>
              <Detail label="Created">{ago(selected.createdAt)}</Detail>
              <Detail label="Delivery id">{selected.id}</Detail>
            </div>

            {isActive(selected) ? (
              <>
                <div className="rounded-lg border border-line-soft bg-bad/5 p-3 text-[12.5px] text-ink">
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle size={15} className="text-bad" /> This ends the job and cancels the order.
                  </p>
                  <p className="mt-1 text-ink-soft">
                    The rider is taken off it and it is not offered to anyone else. The customer is{' '}
                    <strong>not refunded</strong>: use this only for test payments.
                    {selected.cashPaidAmount
                      ? ' The rider already paid the restaurant, so the job will be flagged for cash review.'
                      : ''}
                  </p>
                </div>
                <Input
                  label="Reason (recorded on the order and in the activity log)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <label className="flex items-center gap-2 text-[12.5px] text-ink">
                  <input
                    type="checkbox"
                    checked={understood}
                    onChange={(e) => setUnderstood(e.target.checked)}
                  />
                  I understand the customer will not be refunded.
                </label>
              </>
            ) : (
              <p className="text-[12.5px] text-ink-faint">
                This delivery is {text(selected.status, 'closed')}, so there is nothing to cancel.
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

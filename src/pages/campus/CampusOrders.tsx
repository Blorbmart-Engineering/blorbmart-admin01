import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, ShoppingBag } from 'lucide-react'
import { campusApi, errorMessage, type CampusOrder } from '../../lib/api'
import { ago, money, text } from '../../lib/format'
import {
  Button,
  Card,
  DataTable,
  Empty,
  PageHeader,
  Select,
  StatusBadge,
  Toolbar,
  type Column,
} from '../../components/ui'

/**
 * Orders placed by buyers on this campus.
 *
 * The server resolves the campus through the buyer, because orders themselves
 * carry no campus tag — they are written by the buyer apps, which never had
 * one to write. That has a visible consequence this screen is honest about
 * below: it reads a recent window of platform-wide orders and keeps the ones
 * belonging here, so a quiet campus during a busy platform hour can show
 * fewer rows than it has orders.
 */
const STATUSES = [
  'all',
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'dispatched',
  'delivered',
  'cancelled',
] as const

export default function CampusOrders() {
  const [status, setStatus] = useState<string>('all')

  const orders = useQuery({
    queryKey: ['campus-orders', status],
    queryFn: () => campusApi.orders({ status, limit: 50 }),
    staleTime: 20_000,
  })

  const columns: Column<CampusOrder>[] = [
    {
      key: 'order',
      header: 'Order',
      render: (o) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-[12.5px] font-semibold text-ink">{text(o.orderId)}</p>
          <p className="truncate text-[11.5px] text-ink-faint">
            {o.itemCount ? `${o.itemCount} item${o.itemCount === 1 ? '' : 's'}` : '—'}
            {o.customerName ? ` · ${o.customerName}` : ''}
          </p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
    {
      key: 'payment',
      header: 'Payment',
      render: (o) => (o.paymentStatus ? <StatusBadge status={o.paymentStatus} /> : '—'),
    },
    {
      key: 'address',
      header: 'Deliver to',
      render: (o) => <span className="text-[12.5px] text-ink-soft">{text(o.address)}</span>,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (o) => (
        <div>
          <p className="font-semibold text-ink">{money(o.totalAmount)}</p>
          {o.discountAmount > 0 && (
            <p className="text-[11px] text-good">−{money(o.discountAmount)} promo</p>
          )}
        </div>
      ),
    },
    {
      key: 'when',
      header: 'Placed',
      align: 'right',
      render: (o) => <span className="text-[12px] text-ink-faint">{ago(o.createdAt)}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Placed by buyers registered on your campus."
        actions={
          <Toolbar>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All statuses' : s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>
            <Button size="sm" icon={RefreshCw} loading={orders.isFetching} onClick={() => orders.refetch()}>
              Refresh
            </Button>
          </Toolbar>
        }
      />

      <Card bodyClassName="p-0">
        <DataTable
          columns={columns}
          rows={orders.data?.orders ?? []}
          keyOf={(o) => o.id}
          loading={orders.isLoading}
          error={orders.isError ? errorMessage(orders.error) : null}
          onRetry={() => orders.refetch()}
          empty={
            <Empty
              icon={ShoppingBag}
              title="No orders yet"
              message={
                status === 'all'
                  ? 'Nothing has been ordered on your campus in the recent window.'
                  : `No ${status} orders on your campus right now.`
              }
            />
          }
        />
      </Card>

      {orders.data && (
        <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
          Showing your campus's orders from the last {orders.data.windowLimit} platform-wide. Orders are not
          tagged with a campus, so they are matched through the buyer who placed them — during a busy hour
          across all campuses, older orders on yours can fall outside this window.
        </p>
      )}
    </>
  )
}

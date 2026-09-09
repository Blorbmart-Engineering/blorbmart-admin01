import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Download, RefreshCw, Search, ShoppingBag, Store, Undo2 } from 'lucide-react'
import { adminApi, errorMessage, type Row } from '../lib/api'
import { ago, dateTime, money, pick, shortId, text } from '../lib/format'
import {
  Button,
  Card,
  DataTable,
  Detail,
  Empty,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  Toolbar,
  type Column,
} from '../components/ui'

/**
 * Orders.
 *
 * The rows come from the pre-existing admin router, which returns raw
 * Firestore documents whose field names have drifted over time — `total`,
 * `totalAmount` and `grandTotal` all appear. Reading them through `pick`
 * rather than picking one name means an older order still renders instead of
 * showing a blank cell that looks like missing data.
 */
export default function Orders() {
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()

  const status = params.get('status') ?? 'all'
  const paymentStatus = params.get('paymentStatus') ?? 'all'
  const q = params.get('q') ?? ''
  const [search, setSearch] = useState(q)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Row | null>(null)

  // Kept separate from the detail sheet so a money dialog replaces it rather
  // than stacking on top of it — a confirm step buried under another modal is
  // one an admin dismisses without reading.
  const [refundFor, setRefundFor] = useState<Row | null>(null)
  const [overrideFor, setOverrideFor] = useState<Row | null>(null)

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (!value || value === 'all') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
    setPage(1)
  }

  const orders = useQuery({
    queryKey: ['orders', status, paymentStatus, q, page],
    queryFn: () => adminApi.orders({ status, paymentStatus, q, page, limit: 50 }),
    staleTime: 20_000,
  })

  const act = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'reconcile' | 'resend' }) =>
      action === 'reconcile' ? adminApi.reconcileOrder(id) : adminApi.resendOpsEmail(id),
    onSuccess: (_d, v) => {
      toast.success(v.action === 'reconcile' ? 'Payment reconciled' : 'Ops email resent')
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'That action failed.')),
  })

  const refund = useMutation({
    mutationFn: ({
      id,
      amountKobo,
      reason,
      storeId,
    }: { id: string; amountKobo: number; reason: string; storeId: string | null }) =>
      adminApi.refundOrder(id, { amountKobo, reason, storeId }),
    onSuccess: () => {
      toast.success('Deducted from the seller wallet')
      setRefundFor(null)
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'That deduction failed.')),
  })

  const override = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      vendorName: string
      restaurantAddress: string
      contactNumber: string
      email: string
    }) => adminApi.sellerOverride(id, body),
    onSuccess: () => {
      toast.success('Seller details overridden')
      setOverrideFor(null)
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save those details.')),
  })

  const orderTotal = (o: Row) => pick<number>(o, 'total', 'totalAmount', 'grandTotal', 'amount') ?? 0
  const orderId = (o: Row) => String(pick(o, 'orderId', 'id') ?? '')

  const columns: Column<Row>[] = [
    {
      key: 'order',
      header: 'Order',
      render: (o) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{shortId(orderId(o), 12)}</p>
          <p className="truncate text-[11.5px] text-ink-faint">
            {text(pick(o, 'storeName', 'vendorName', 'businessName'))}
          </p>
        </div>
      ),
    },
    {
      key: 'buyer',
      header: 'Buyer',
      render: (o) => (
        <div className="min-w-0">
          <p className="truncate">{text(pick(o, 'customerName', 'buyerName', 'userName'))}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{text(pick(o, 'customerPhone', 'phone'))}</p>
        </div>
      ),
    },
    { key: 'total', header: 'Total', align: 'right', render: (o) => <span className="font-semibold text-ink">{money(orderTotal(o))}</span> },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={pick(o, 'orderStatus', 'status')} /> },
    { key: 'payment', header: 'Payment', render: (o) => <StatusBadge status={pick(o, 'paymentStatus')} /> },
    { key: 'when', header: 'Placed', align: 'right', render: (o) => ago(pick(o, 'createdAt')) },
  ]

  const rows = orders.data?.orders ?? []
  const pagination = orders.data?.pagination

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Every order placed across the marketplace."
        actions={
          <>
            <Button
              size="sm"
              icon={Download}
              onClick={() =>
                adminApi
                  .exportCsv('orders', { status, paymentStatus, q, limit: 5000 })
                  .then(() => toast.success('Export downloaded'))
                  .catch((e) => toast.error(errorMessage(e, 'Export failed.')))
              }
            >
              Export CSV
            </Button>
            <Button size="sm" icon={RefreshCw} loading={orders.isFetching} onClick={() => orders.refetch()}>
              Refresh
            </Button>
          </>
        }
      />

      <Card
        bodyClassName="p-0"
        title={
          <Toolbar>
            <Select label="Status" value={status} onChange={(e) => setParam('status', e.target.value)} className="w-44">
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="preparing">Preparing</option>
              <option value="on_the_way">On the way</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Select
              label="Payment"
              value={paymentStatus}
              onChange={(e) => setParam('paymentStatus', e.target.value)}
              className="w-40"
            >
              <option value="all">All payments</option>
              <option value="completed">Paid</option>
              <option value="pending">Unpaid</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </Select>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setParam('q', search.trim())
              }}
              className="flex items-end gap-2"
            >
              <Input
                label="Search"
                placeholder="Order id, buyer, phone"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-56"
              />
              <Button type="submit" icon={Search}>
                Find
              </Button>
            </form>
          </Toolbar>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(o, i) => String(pick(o, 'id') ?? i)}
          loading={orders.isLoading}
          error={orders.isError ? errorMessage(orders.error) : null}
          onRetry={() => orders.refetch()}
          onRowClick={(o) => setSelected(o)}
          empty={<Empty icon={ShoppingBag} title="No orders" message="Nothing matches these filters." />}
        />

        {(pagination?.hasMore || page > 1) && (
          <div className="flex items-center justify-between border-t border-line-soft px-4 py-3">
            <Button size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <span className="text-[12.5px] text-ink-faint">Page {page}</span>
            <Button size="sm" disabled={!pagination?.hasMore} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `Order ${shortId(orderId(selected), 14)}` : 'Order'}
        wide
        footer={
          selected && (
            <>
              <Button onClick={() => setSelected(null)}>Close</Button>
              <Button
                icon={Store}
                onClick={() => {
                  setOverrideFor(selected)
                  setSelected(null)
                }}
              >
                Seller details
              </Button>
              <Button
                icon={Undo2}
                variant="danger"
                onClick={() => {
                  setRefundFor(selected)
                  setSelected(null)
                }}
              >
                Deduct refund
              </Button>
              <Button
                loading={act.isPending}
                onClick={() => act.mutate({ id: orderId(selected), action: 'resend' })}
              >
                Resend ops email
              </Button>
              <Button
                variant="primary"
                loading={act.isPending}
                onClick={() => act.mutate({ id: orderId(selected), action: 'reconcile' })}
              >
                Reconcile payment
              </Button>
            </>
          )
        }
      >
        {selected && <OrderDetail order={selected} />}
      </Modal>

      <RefundDialog
        order={refundFor}
        pending={refund.isPending}
        onClose={() => setRefundFor(null)}
        onSubmit={(amountKobo, reason, storeId) =>
          refund.mutate({ id: orderId(refundFor as Row), amountKobo, reason, storeId })
        }
      />

      <SellerOverrideDialog
        order={overrideFor}
        pending={override.isPending}
        onClose={() => setOverrideFor(null)}
        onSubmit={(body) => override.mutate({ id: orderId(overrideFor as Row), ...body })}
      />
    </>
  )
}

/**
 * Takes a refunded amount back off the seller.
 *
 * The heading says whose money moves, because the endpoint behind this button
 * debits the seller's wallet and does nothing at all for the customer. An admin
 * who assumes otherwise leaves a buyer unpaid, so the wording here is
 * load-bearing rather than decorative.
 *
 * The amount is entered in naira and sent in kobo. It is pre-filled with the
 * order total, which is the common case, but stays editable for a partial
 * refund on one bad item out of four.
 */
function RefundDialog({
  order,
  pending,
  onClose,
  onSubmit,
}: {
  order: Row | null
  pending: boolean
  onClose: () => void
  onSubmit: (amountKobo: number, reason: string, storeId: string | null) => void
}) {
  const total = pick<number>(order ?? {}, 'total', 'totalAmount', 'grandTotal', 'amount') ?? 0
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  // Re-seed whenever a different order opens the dialog.
  const [seededFor, setSeededFor] = useState<string | null>(null)
  const key = order ? String(pick(order, 'orderId', 'id') ?? '') : null
  if (order && key !== seededFor) {
    setSeededFor(key)
    setAmount(total ? String(total) : '')
    setReason('')
  }

  const naira = Number(amount)
  const valid = Number.isFinite(naira) && naira > 0 && naira <= total * 2

  return (
    <Modal
      open={Boolean(order)}
      onClose={onClose}
      title="Deduct refund from seller"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            icon={Undo2}
            loading={pending}
            disabled={!valid}
            onClick={() =>
              onSubmit(
                Math.round(naira * 100),
                reason.trim() || 'Refund deduction',
                (pick<string>(order ?? {}, 'storeId') as string) ?? null,
              )
            }
          >
            Deduct {valid ? money(naira) : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[12.5px] leading-relaxed text-ink-soft">
          This debits the seller&apos;s wallet — available balance first, then pending. It
          does not send anything to the customer; refund the buyer on the payment
          provider separately.
        </p>

        <Detail label="Order total">{money(total)}</Detail>
        <Detail label="Seller">{text(pick(order ?? {}, 'storeName', 'vendorName'))}</Detail>

        <Input
          label="Amount to deduct (₦)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
        {amount !== '' && !valid && (
          <p className="text-[12px] font-semibold text-bad">
            Enter an amount above zero and no more than twice the order total.
          </p>
        )}

        <Textarea
          label="Reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why this is being deducted — kept on the wallet entry."
        />
      </div>
    </Modal>
  )
}

/**
 * Corrects the seller details an order carries.
 *
 * Ops email and receipts read these fields, so a wrong shop name follows the
 * order everywhere until it is overridden. Fields are pre-filled from the order
 * and every one is optional — the backend rejects a wholly empty submission.
 */
function SellerOverrideDialog({
  order,
  pending,
  onClose,
  onSubmit,
}: {
  order: Row | null
  pending: boolean
  onClose: () => void
  onSubmit: (body: {
    vendorName: string
    restaurantAddress: string
    contactNumber: string
    email: string
  }) => void
}) {
  const [vendorName, setVendorName] = useState('')
  const [restaurantAddress, setRestaurantAddress] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [email, setEmail] = useState('')

  const [seededFor, setSeededFor] = useState<string | null>(null)
  const key = order ? String(pick(order, 'orderId', 'id') ?? '') : null
  if (order && key !== seededFor) {
    setSeededFor(key)
    const existing = (pick<Row>(order, 'sellerOverride') ?? {}) as Row
    setVendorName(String(pick(existing, 'vendorName') ?? pick(order, 'storeName', 'vendorName') ?? ''))
    setRestaurantAddress(String(pick(existing, 'restaurantAddress') ?? pick(order, 'storeAddress') ?? ''))
    setContactNumber(String(pick(existing, 'contactNumber') ?? pick(order, 'storePhone', 'vendorPhone') ?? ''))
    setEmail(String(pick(existing, 'email') ?? pick(order, 'storeEmail', 'vendorEmail') ?? ''))
  }

  const anyValue = [vendorName, restaurantAddress, contactNumber, email].some((v) => v.trim())

  return (
    <Modal
      open={Boolean(order)}
      onClose={onClose}
      title="Override seller details"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={Store}
            loading={pending}
            disabled={!anyValue}
            onClick={() => onSubmit({ vendorName, restaurantAddress, contactNumber, email })}
          >
            Save override
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[12.5px] leading-relaxed text-ink-soft">
          Replaces the seller details on this one order. Ops email and receipts read
          these, so use it when an order went out with the wrong shop on it.
        </p>

        <Input label="Vendor name" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
        <Input
          label="Restaurant address"
          value={restaurantAddress}
          onChange={(e) => setRestaurantAddress(e.target.value)}
        />
        <Input
          label="Contact number"
          value={contactNumber}
          onChange={(e) => setContactNumber(e.target.value)}
        />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

        {!anyValue && (
          <p className="text-[12px] font-semibold text-ink-faint">
            Fill at least one field — an empty override is rejected.
          </p>
        )}
      </div>
    </Modal>
  )
}

function OrderDetail({ order }: { order: Row }) {
  const items = (pick<unknown[]>(order, 'items', 'orderItems') ?? []) as Row[]

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Order</h3>
          <Detail label="Status">
            <StatusBadge status={pick(order, 'orderStatus', 'status')} />
          </Detail>
          <Detail label="Payment">
            <StatusBadge status={pick(order, 'paymentStatus')} />
          </Detail>
          <Detail label="Method">{text(pick(order, 'paymentMethod'))}</Detail>
          <Detail label="Subtotal">{money(pick(order, 'subtotal'))}</Detail>
          <Detail label="Delivery">{money(pick(order, 'deliveryFee'))}</Detail>
          <Detail label="Service fee">{money(pick(order, 'serviceFee'))}</Detail>
          <Detail label="Total">
            <span className="font-bold">
              {money(pick(order, 'total', 'totalAmount', 'grandTotal'))}
            </span>
          </Detail>
          <Detail label="Placed">{dateTime(pick(order, 'createdAt'))}</Detail>
        </div>

        <div>
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Parties</h3>
          <Detail label="Buyer">{text(pick(order, 'customerName', 'buyerName'))}</Detail>
          <Detail label="Phone">{text(pick(order, 'customerPhone', 'phone'))}</Detail>
          <Detail label="Store">{text(pick(order, 'storeName', 'vendorName'))}</Detail>
          <Detail label="Rider">{text(pick(order, 'riderName', 'riderId'))}</Detail>
          <Detail label="Address">
            {text(pick(order, 'deliveryAddress.addressLine1', 'address.addressLine1', 'deliveryAddress'))}
          </Detail>
          <Detail label="Campus">{text(pick(order, 'universityName', 'universityId'))}</Detail>
        </div>
      </div>

      <div>
        <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
          Items ({items.length})
        </h3>
        {items.length === 0 ? (
          <p className="py-2 text-[12.5px] text-ink-faint">No line items recorded.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {items.map((item, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-[12.5px]">
                <span className="min-w-0 truncate text-ink-soft">
                  {text(pick(item, 'name', 'productName'))}
                  <span className="text-ink-faint"> × {String(pick(item, 'quantity', 'qty') ?? 1)}</span>
                </span>
                <span className="shrink-0 tabular text-ink">{money(pick(item, 'price', 'unitPrice'))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

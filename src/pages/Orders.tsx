import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CheckCircle2, Download, RefreshCw, Search, ShoppingBag, Store, Undo2 } from 'lucide-react'
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

const ORDER_VIEWS = [
  { value: 'ready_for_delivery', label: 'Ready for delivery' },
  { value: 'successful', label: 'Successful orders' },
  { value: 'all', label: 'All orders' },
]

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

  const reconciliation = useQuery({
    queryKey: ['order-reconciliation', selected ? String(pick(selected, 'orderId', 'id') ?? '') : null],
    queryFn: () => adminApi.orderReconciliation(String(pick(selected!, 'orderId', 'id') ?? '')),
    enabled: Boolean(selected),
    staleTime: 10_000,
  })

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
      destination,
      reason,
      components,
    }: { id: string; amountKobo: number; destination: 'wallet' | 'paystack'; reason: string; components: { foodKobo: number; deliveryFeeKobo: number; serviceFeeKobo: number } }) =>
      adminApi.refundOrder(id, { amountKobo, destination, reason, components, actionKey: actionKey('refund') }),
    onSuccess: (result) => {
      toast.success(result.status === 'pending_approval' ? 'Refund submitted for approval' : 'Refund applied')
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
        subtitle="Keep paid, vendor-accepted orders separate from completed order history."
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

      <div className="flex flex-wrap gap-2">
        {ORDER_VIEWS.map((view) => (
          <Button
            key={view.value}
            size="sm"
            variant={status === view.value ? 'primary' : 'outline'}
            onClick={() => setParam('status', view.value)}
          >
            {view.label}
          </Button>
        ))}
      </div>

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
              <option value="ready_for_delivery">Ready for delivery</option>
              <option value="successful">Successful orders</option>
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
        {selected && <OrderDetail order={selected} reconciliation={reconciliation.data ?? null} loading={reconciliation.isLoading} />}
      </Modal>

      <RefundDialog
        order={refundFor}
        reconciliation={refundFor ? (reconciliation.data ?? null) : null}
        pending={refund.isPending}
        onClose={() => setRefundFor(null)}
        onSubmit={(amountKobo, destination, reason, components) =>
          refund.mutate({ id: orderId(refundFor as Row), amountKobo, destination, reason, components })
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
  reconciliation,
  pending,
  onClose,
  onSubmit,
}: {
  order: Row | null
  reconciliation: Row | null
  pending: boolean
  onClose: () => void
  onSubmit: (amountKobo: number, destination: 'wallet' | 'paystack', reason: string, components: { foodKobo: number; deliveryFeeKobo: number; serviceFeeKobo: number }) => void
}) {
  const total = pick<number>(order ?? {}, 'total', 'totalAmount', 'grandTotal', 'amount') ?? 0
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [destination, setDestination] = useState<'wallet' | 'paystack'>('wallet')
  const [food, setFood] = useState('')
  const [deliveryFee, setDeliveryFee] = useState('0')
  const [serviceFee, setServiceFee] = useState('0')

  // Re-seed whenever a different order opens the dialog.
  const [seededFor, setSeededFor] = useState<string | null>(null)
  const key = order ? String(pick(order, 'orderId', 'id') ?? '') : null
  if (order && key !== seededFor) {
    setSeededFor(key)
    setAmount(total ? String(total) : '')
    setFood(total ? String(total) : '')
    setDeliveryFee('0')
    setServiceFee('0')
    setReason('')
  }

  const naira = Number(amount)
  const maxRefund = Number(reconciliation?.refundable ?? total)
  const componentTotal = Number(food || 0) + Number(deliveryFee || 0) + Number(serviceFee || 0)
  const valid = Number.isFinite(naira) && naira > 0 && naira <= maxRefund && Math.abs(componentTotal - naira) < 0.005 && reason.trim().length > 0

  return (
    <Modal
      open={Boolean(order)}
      onClose={onClose}
      title="Reconcile and refund order"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            icon={Undo2}
            loading={pending}
            disabled={!valid}
            onClick={() =>
              onSubmit(Math.round(naira * 100), destination, reason.trim(), { foodKobo: Math.round(Number(food || 0) * 100), deliveryFeeKobo: Math.round(Number(deliveryFee || 0) * 100), serviceFeeKobo: Math.round(Number(serviceFee || 0) * 100) })
            }
          >
            Refund {valid ? money(naira) : ''}
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
        <Detail label="Remaining refundable">{money(maxRefund)}</Detail>

        <Select label="Refund destination" value={destination} onChange={(e) => setDestination(e.target.value as 'wallet' | 'paystack')}>
          <option value="wallet">Blorbmart wallet</option>
          <option value="paystack">Original Paystack payment</option>
        </Select>

        <Input
          label="Amount to deduct (₦)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
        <div className="grid gap-2 sm:grid-cols-3">
          <Input label="Food portion (₦)" inputMode="decimal" value={food} onChange={(e) => setFood(e.target.value)} />
          <Input label="Delivery portion (₦)" inputMode="decimal" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} />
          <Input label="Service portion (₦)" inputMode="decimal" value={serviceFee} onChange={(e) => setServiceFee(e.target.value)} />
        </div>
        {amount !== '' && !valid && (
          <p className="text-[12px] font-semibold text-bad">
            Enter an amount above zero and no more than the remaining refundable amount, with a reason.
          </p>
        )}

        <Select
          label="Reason"

          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">Choose a reason</option>
          <option value="cancelled_before_fulfilment">Cancelled before fulfilment</option>
          <option value="item_unavailable">Item unavailable</option>
          <option value="not_delivered">Not delivered</option>
          <option value="wrong_or_missing_items">Wrong or missing items</option>
          <option value="overcharge">Overcharge</option>
          <option value="duplicate_payment">Duplicate payment</option>
          <option value="other">Other</option>
        </Select>
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

/**
 * How the delivery fee was worked out (orderPricingService's deliveryMeta).
 * A flat fee on a food order means a pin was missing; the reason says whose,
 * and Store locations is where a store's is fixed.
 */
function deliveryBasis(meta: Row | undefined) {
  if (!meta || typeof meta !== 'object') return '—'
  const mode = String(meta.mode ?? '')
  if (mode === 'food_distance') {
    const km = Number(meta.distanceKm)
    const how = meta.distanceSource === 'google' ? 'Google Maps road route' : meta.distanceSource === 'tomtom' ? 'TomTom road route' : 'straight line × road factor'
    return `Distance${Number.isFinite(km) ? `, ${km} km` : ''} (${how})`
  }
  if (mode === 'flat_fallback') {
    return (
      <span className="text-warn">
        Flat fee: {String(meta.reason ?? 'no pin')}
      </span>
    )
  }
  if (mode === 'landmark') return `Landmark: ${String(meta.name ?? '')}`
  if (mode === 'campus') return 'Campus flat fee'
  if (mode === 'flat') return 'Flat fee'
  return mode || '—'
}

function OrderDetail({ order, reconciliation, loading }: { order: Row; reconciliation: Row | null; loading: boolean }) {
  const items = (pick<unknown[]>(order, 'items', 'orderItems') ?? []) as Row[]

  return (
    <div className="space-y-5">
      <AdminRiderAssignment order={order} />
      <ManualDeliveryCompletion order={order} />
      <Card title="Money reconciliation">
        {loading ? <p className="text-[12.5px] text-ink-faint">Loading payment and wallet records…</p> : reconciliation ? <div className="grid gap-2 sm:grid-cols-2">
          <Detail label="Paid">{money(reconciliation.payment?.paid)}</Detail>
          <Detail label="Remaining refundable">{money(reconciliation.refundable)}</Detail>
          <Detail label="Payment reference">{text(reconciliation.payment?.reference)}</Detail>
          <Detail label="Vendor credits">{String(reconciliation.vendorCredits?.length ?? 0)}</Detail>
          <Detail label="Rider payouts">{String(reconciliation.riderPayouts?.length ?? 0)}</Detail>
          <Detail label="Refunds">{String(reconciliation.refunds?.length ?? 0)}</Detail>
          {reconciliation.flags?.length > 0 && <div className="sm:col-span-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] text-warn">{reconciliation.flags.map((flag: Row) => <div key={String(flag.code)}>{flag.code}: {flag.message}</div>)}</div>}
        </div> : <p className="text-[12.5px] text-bad">Could not load reconciliation.</p>}
      </Card>
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
          <Detail label="Delivery priced by">{deliveryBasis(pick<Row>(order, 'deliveryMeta'))}</Detail>
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

function actionKey(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${random}`
}

function ManualDeliveryCompletion({ order }: { order: Row }) {
  const id = String(pick(order, 'orderId', 'id') ?? '')
  const currentRiderId = String(pick(order, 'riderId') ?? '')
  const status = String(pick(order, 'orderStatus', 'status') ?? '').toLowerCase()
  const payment = String(pick(order, 'paymentStatus') ?? '').toLowerCase()
  const [riderId, setRiderId] = useState(currentRiderId)
  const [reason, setReason] = useState('')
  const [secondAdminId, setSecondAdminId] = useState('')
  useEffect(() => setRiderId(currentRiderId), [id, currentRiderId])
  const options = useQuery({
    queryKey: ['manual-delivery-riders', id],
    queryFn: () => adminApi.riderAssignmentOptions(id),
    enabled: Boolean(id),
    staleTime: 10_000,
  })
  const queryClient = useQueryClient()
  const complete = useMutation({
    mutationFn: () => adminApi.completeManualDelivery(id, {
      riderId,
      reason: reason.trim(),
      actionKey: actionKey('manual-delivery'),
      secondAdminId: secondAdminId.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success('Delivery completed and rider payout settled.')
      setReason('')
      setSecondAdminId('')
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['order-reconciliation', id] })
      queryClient.invalidateQueries({ queryKey: ['rider-assignment-options', id] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not complete that delivery.')),
  })
  const riders = options.data?.riders ?? []
  const closed = ['delivered', 'cancelled', 'refunded', 'failed'].includes(status)
  const paid = ['paid', 'completed', 'success'].includes(payment)

  return (
    <Card title="Manual delivery completion">
      <div className="space-y-3">
        <p className="text-[12.5px] leading-relaxed text-ink-soft">
          Use only when the order was physically delivered but the customer PIN was unavailable.
          Select the rider who actually delivered it; the normal rider payout and audit record will be created.
        </p>
        {closed ? (
          <p className="text-[12.5px] text-ink-faint">This order is already {status || 'closed'}.</p>
        ) : !paid ? (
          <p className="text-[12.5px] font-semibold text-warn">Only paid orders can be completed.</p>
        ) : options.isError ? (
          <p className="text-[12.5px] text-bad">{errorMessage(options.error, 'Could not load active riders.')}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-end">
            <Select label="Rider who delivered" value={riderId} onChange={(event) => setRiderId(event.target.value)} disabled={complete.isPending || options.isLoading}>
              <option value="">Choose a riderâ€¦</option>
              {riders.map((rider) => (
                <option key={rider.uid} value={rider.uid}>
                  {rider.name} Â· {rider.vehicleType || 'vehicle not set'}
                </option>
              ))}
            </Select>
            <Textarea label="Required reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Customer received the order; PIN unavailable" />
            <Input label="Second admin ID if changing a picked-up rider" value={secondAdminId} onChange={(event) => setSecondAdminId(event.target.value)} placeholder="Required only for a picked-up reassignment" />
            <div className="md:col-span-3 flex items-center justify-between gap-3">
              <p className="text-[11.5px] text-ink-faint">
                {currentRiderId ? `Currently assigned rider: ${String(pick(order, 'riderName') ?? currentRiderId)}.` : 'No rider is currently assigned.'}
              </p>
              <Button
                variant="primary"
                icon={CheckCircle2}
                loading={complete.isPending}
                disabled={!riderId || reason.trim().length < 5 || complete.isPending}
                onClick={() => complete.mutate()}
              >
                Complete as delivered
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

function AdminRiderAssignment({ order }: { order: Row }) {
  const id = String(pick(order, 'orderId', 'id') ?? '')
  const currentRiderId = String(pick(order, 'riderId') ?? '')
  const [riderId, setRiderId] = useState(currentRiderId)
  const [reason, setReason] = useState('')
  const [secondAdminId, setSecondAdminId] = useState('')
  useEffect(() => setRiderId(currentRiderId), [id, currentRiderId])
  const options = useQuery({
    queryKey: ['rider-assignment-options', id],
    queryFn: () => adminApi.riderAssignmentOptions(id),
    enabled: Boolean(id),
    staleTime: 10_000,
  })
  const queryClient = useQueryClient()
  const assign = useMutation({
    mutationFn: () => adminApi.assignRider(id, { riderId, reason: reason.trim(), actionKey: actionKey('assign'), secondAdminId: secondAdminId.trim() || undefined }),
    onSuccess: (result) => {
      toast.success(String(pick(result, 'action') ?? 'Rider assigned'))
      setReason('')
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['rider-assignment-options', id] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not assign that rider.')),
  })
  const unassign = useMutation({
    mutationFn: () => adminApi.unassignRider(id, { reason: reason.trim(), actionKey: actionKey('unassign') }),
    onSuccess: () => {
      toast.success('Rider unassigned; order is back on the rider board')
      setRiderId('')
      setReason('')
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['rider-assignment-options', id] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not unassign that rider.')),
  })
  const riders = options.data?.riders ?? []
  const selected = riders.find((rider) => rider.uid === riderId)
  const busy = assign.isPending || unassign.isPending

  return (
    <Card title="Rider assignment">
      <div className="space-y-3">
        <p className="text-[12.5px] text-ink-soft">
          {currentRiderId
            ? `Currently assigned to ${text(pick(order, 'riderName') ?? currentRiderId)}.`
            : 'No rider is assigned. Choose an active rider to override the open offer.'}
        </p>
        {options.isError ? (
          <p className="text-[12.5px] text-bad">{errorMessage(options.error, 'Could not load riders.')}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
            <Select label="Rider" value={riderId} onChange={(event) => setRiderId(event.target.value)} disabled={busy || options.isLoading}>
              <option value="">Choose an active rider…</option>
              {riders.map((rider) => (
                <option key={rider.uid} value={rider.uid}>
                  {rider.name} · {rider.vehicleType || 'vehicle not set'} · {rider.online ? 'online' : 'offline'}
                  {rider.distanceToPickupKm != null ? ` · ${rider.distanceToPickupKm.toFixed(1)} km` : ''}
                  {rider.activeDeliveries ? ` · ${rider.activeDeliveries} active` : ''}
                </option>
              ))}
            </Select>
            <Textarea label="Required reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why does operations need to intervene?" />
            <Input label="Second admin ID if picked up" value={secondAdminId} onChange={(event) => setSecondAdminId(event.target.value)} placeholder="Optional" />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                loading={assign.isPending}
                disabled={!riderId || !reason.trim() || busy}
                onClick={() => assign.mutate()}
              >
                {currentRiderId ? 'Reassign' : 'Assign'}
              </Button>
              {currentRiderId && (
                <Button variant="danger" loading={unassign.isPending} disabled={!reason.trim() || busy} onClick={() => unassign.mutate()}>
                  Unassign
                </Button>
              )}
            </div>
          </div>
        )}
        {selected && (
          <p className="text-[11.5px] text-ink-faint">
            {selected.online ? 'Online' : 'Offline'} · {selected.activeDeliveries} active delivery(ies)
            {selected.distanceToPickupKm != null ? ` · ${selected.distanceToPickupKm.toFixed(2)} km from the shop` : ' · no location available'}
            {selected.lastKnownLocation?.updatedAt ? ` · location updated ${dateTime(selected.lastKnownLocation.updatedAt)}` : ''}
          </p>
        )}
        {selected && selected.vehicleType?.toLowerCase() === 'foot' && (selected.distanceToPickupKm ?? 0) > 5 && (
          <p className="text-[12px] font-semibold text-warn">Warning: this walking rider is more than 5 km from the shop.</p>
        )}
        {selected && selected.activeDeliveries > 0 && (
          <p className="text-[12px] font-semibold text-warn">Warning: this rider already has {selected.activeDeliveries} active delivery(ies).</p>
        )}
      </div>
    </Card>
  )
}

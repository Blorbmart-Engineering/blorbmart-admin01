import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Bike, Search } from 'lucide-react'
import { adminApi, errorMessage, type Rider } from '../lib/api'
import { ago, count, money, text, titleCase } from '../lib/format'
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
  StatusBadge,
  Toolbar,
  type Column,
} from '../components/ui'

const STATUSES = ['all', 'onboarding', 'pending', 'active', 'suspended', 'rejected'] as const

const CAMPUSES = [
  { id: 'all', name: 'All campuses' },
  { id: 'uniosun', name: 'Osun State University' },
  { id: 'lautech', name: 'LAUTECH' },
  { id: 'unn', name: 'University of Nigeria, Nsukka' },
  { id: 'oou', name: 'Olabisi Onabanjo University' },
]

/**
 * The rider roster and the approval queue.
 *
 * This is the screen the ecosystem never had: riders could sign up and finish
 * onboarding, and nothing existed to approve, suspend or even look at them.
 * The status filter defaults from the URL so the dashboard's "awaiting
 * approval" tile can link straight into the queue it is counting.
 */
export default function Riders() {
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()

  const status = params.get('status') ?? 'all'
  const universityId = params.get('universityId') ?? 'all'
  const [search, setSearch] = useState(params.get('q') ?? '')
  const q = params.get('q') ?? ''

  const [selected, setSelected] = useState<Rider | null>(null)
  const [pendingStatus, setPendingStatus] = useState<string>('')
  const [reason, setReason] = useState('')

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (!value || value === 'all') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const riders = useQuery({
    queryKey: ['riders', status, universityId, q],
    queryFn: () => adminApi.riders({ status, universityId, q, limit: 200 }),
    staleTime: 20_000,
  })

  const mutate = useMutation({
    mutationFn: ({ uid, next, note }: { uid: string; next: string; note: string }) =>
      adminApi.setRiderStatus(uid, next, note || undefined),
    onSuccess: (_data, variables) => {
      toast.success(`Rider ${variables.next}`)
      queryClient.invalidateQueries({ queryKey: ['riders'] })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
      setSelected(null)
      setPendingStatus('')
      setReason('')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the rider.')),
  })

  const columns: Column<Rider>[] = [
    {
      key: 'rider',
      header: 'Rider',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">
            {text(`${r.firstName} ${r.lastName}`.trim() || r.displayName, 'Unnamed')}
          </p>
          <p className="truncate text-[11.5px] text-ink-faint">{text(r.email)}</p>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (r) => <span className="tabular">{text(r.phone)}</span> },
    {
      key: 'campus',
      header: 'Campus',
      render: (r) => text(r.universityName ?? r.universityId, 'Not set'),
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      render: (r) => (
        <span>
          {titleCase(text(r.vehicleType))}
          {r.plateNumber && <span className="ml-1 text-ink-faint">{r.plateNumber}</span>}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge status={r.status} />
          {r.online && <Badge tone="good">online</Badge>}
        </div>
      ),
    },
    {
      key: 'trips',
      header: 'Trips',
      align: 'right',
      render: (r) => (
        <span title={`${r.deliveriesCancelled} cancelled`}>{count(r.deliveriesCompleted)}</span>
      ),
    },
    { key: 'seen', header: 'Last seen', align: 'right', render: (r) => ago(r.lastSeenAt) },
  ]

  const rows = riders.data?.riders ?? []

  return (
    <>
      <PageHeader
        title="Riders"
        subtitle="Approve, suspend and monitor everyone delivering on campus."
        actions={
          <Badge tone="neutral">
            {count(rows.length)} shown
          </Badge>
        }
      />

      <Card
        bodyClassName="p-0"
        title={
          <Toolbar>
            <Select
              label="Status"
              value={status}
              onChange={(e) => setParam('status', e.target.value)}
              className="w-40"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All statuses' : titleCase(s)}
                </option>
              ))}
            </Select>
            <Select
              label="Campus"
              value={universityId}
              onChange={(e) => setParam('universityId', e.target.value)}
              className="w-56"
            >
              {CAMPUSES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
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
                placeholder="Name, email, phone, plate"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-56"
              />
              <Button type="submit" icon={Search} size="md">
                Find
              </Button>
            </form>
          </Toolbar>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(r) => r.uid}
          loading={riders.isLoading}
          error={riders.isError ? errorMessage(riders.error) : null}
          onRetry={() => riders.refetch()}
          onRowClick={(r) => setSelected(r)}
          empty={
            <Empty
              icon={Bike}
              title="No riders match"
              message={
                status === 'pending'
                  ? 'Nothing is waiting for approval right now.'
                  : 'Try a different status or campus.'
              }
            />
          }
        />
      </Card>

      {/* ── Rider detail and the actions that change their status ─────── */}
      <Modal
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null)
          setPendingStatus('')
          setReason('')
        }}
        title={selected ? `${selected.firstName} ${selected.lastName}`.trim() || 'Rider' : 'Rider'}
        wide
        footer={
          selected && (
            <>
              <Button onClick={() => setSelected(null)}>Close</Button>
              {selected.status !== 'active' && (
                <Button
                  variant="primary"
                  loading={mutate.isPending && pendingStatus === 'active'}
                  onClick={() => {
                    setPendingStatus('active')
                    mutate.mutate({ uid: selected.uid, next: 'active', note: reason })
                  }}
                >
                  Approve &amp; activate
                </Button>
              )}
              {selected.status !== 'suspended' && (
                <Button
                  variant="danger"
                  loading={mutate.isPending && pendingStatus === 'suspended'}
                  onClick={() => {
                    setPendingStatus('suspended')
                    mutate.mutate({ uid: selected.uid, next: 'suspended', note: reason })
                  }}
                >
                  Suspend
                </Button>
              )}
            </>
          )
        }
      >
        {selected && <RiderDetail rider={selected} reason={reason} onReason={setReason} />}
      </Modal>
    </>
  )
}

function RiderDetail({
  rider,
  reason,
  onReason,
}: {
  rider: Rider
  reason: string
  onReason: (value: string) => void
}) {
  // Fetched on open rather than with the list: wallet balances and recent
  // deliveries are three extra reads per rider, which is wasteful for a table
  // of two hundred and instant for the one being looked at.
  const detail = useQuery({
    queryKey: ['rider', rider.uid],
    queryFn: () => adminApi.rider(rider.uid),
    staleTime: 30_000,
  })

  const wallet = detail.data?.wallet as
    | { availableBalance?: number; cashOutstanding?: number; totalEarned?: number; pinSet?: boolean }
    | undefined

  const deliveries = (detail.data?.deliveries ?? []) as {
    id: string
    orderId?: string
    status?: string
    earnings?: number
    createdAt?: number
  }[]

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Profile</h3>
          <Detail label="Status">
            <StatusBadge status={rider.status} />
          </Detail>
          <Detail label="Email">{text(rider.email)}</Detail>
          <Detail label="Phone">{text(rider.phone)}</Detail>
          <Detail label="Campus">{text(rider.universityName ?? rider.universityId, 'Not set')}</Detail>
          <Detail label="Vehicle">
            {titleCase(text(rider.vehicleType))} {rider.plateNumber ?? ''}
          </Detail>
          <Detail label="ID document">
            {rider.documents ? `${rider.documents.idType} · ${rider.documents.idNumber}` : 'Not provided'}
          </Detail>
          <Detail label="Onboarding">
            {rider.onboardingComplete ? 'Complete' : `Stopped at ${text(rider.onboardingStep)}`}
          </Detail>
          <Detail label="Joined">{ago(rider.createdAt)}</Detail>
          <Detail label="Last seen">{ago(rider.lastSeenAt)}</Detail>
        </div>

        <div>
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            Performance &amp; wallet
          </h3>
          <Detail label="Deliveries">{count(rider.deliveriesCompleted)}</Detail>
          <Detail label="Cancelled">{count(rider.deliveriesCancelled)}</Detail>
          <Detail label="Rating">{rider.rating.toFixed(1)}</Detail>
          <Detail label="Wallet balance">{detail.isLoading ? '…' : money(wallet?.availableBalance)}</Detail>
          {/* The number that matters for trust: money the rider is holding
              on our behalf after fronting cash at a restaurant. */}
          <Detail label="Cash outstanding">
            {detail.isLoading ? '…' : money(wallet?.cashOutstanding)}
          </Detail>
          <Detail label="Lifetime earned">{detail.isLoading ? '…' : money(wallet?.totalEarned)}</Detail>
          <Detail label="Payout PIN">{wallet?.pinSet ? 'Set' : 'Not set'}</Detail>
        </div>
      </div>

      <div>
        <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
          Recent deliveries
        </h3>
        {detail.isLoading ? (
          <p className="py-3 text-[12.5px] text-ink-faint">Loading…</p>
        ) : deliveries.length === 0 ? (
          <p className="py-3 text-[12.5px] text-ink-faint">No deliveries yet.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {deliveries.slice(0, 8).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-[12.5px]">
                <span className="min-w-0 truncate text-ink-soft">{text(d.orderId, d.id)}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={d.status} />
                  <span className="tabular text-ink">{money(d.earnings)}</span>
                  <span className="text-ink-faint">{ago(d.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Optional, but it is what turns an audit-log entry from "suspended"
          into something a colleague can act on six weeks later. */}
      <Input
        label="Reason (recorded in the activity log)"
        placeholder="e.g. Repeated cancellations after accepting"
        value={reason}
        onChange={(e) => onReason(e.target.value)}
      />
    </div>
  )
}

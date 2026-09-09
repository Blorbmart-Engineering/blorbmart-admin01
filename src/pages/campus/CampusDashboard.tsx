import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Bike,
  Building2,
  Package,
  RefreshCw,
  ShoppingBag,
  Users,
  Wrench,
} from 'lucide-react'
import { campusApi, errorMessage } from '../../lib/api'
import { useSession } from '../../contexts/SessionContext'
import { count } from '../../lib/format'
import {
  Badge,
  Button,
  Card,
  ErrorState,
  PageHeader,
  Stat,
  Textarea,
  Modal,
  Toolbar,
} from '../../components/ui'

/**
 * One campus, and whether it can trade.
 *
 * The verdict is stated rather than left to be inferred from the counts,
 * exactly as the admin readiness table does — and for the same reason: a
 * campus with stores and no active riders looks healthy in four numbers and
 * cannot deliver anything.
 */
export default function CampusDashboard() {
  const queryClient = useQueryClient()
  const { refresh } = useSession()
  const [maintenanceOpen, setMaintenanceOpen] = useState(false)

  const overview = useQuery({
    queryKey: ['campus-overview'],
    queryFn: campusApi.overview,
    staleTime: 60_000,
  })

  if (overview.isError) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card>
          <ErrorState message={errorMessage(overview.error)} onRetry={() => overview.refetch()} />
        </Card>
      </>
    )
  }

  const data = overview.data
  const counts = data?.counts
  const paused = data?.campus?.maintenance?.enabled ?? false

  const verdict = !data
    ? null
    : !data.campus?.active
      ? { tone: 'neutral' as const, label: 'Closed', why: 'An administrator has closed this campus.' }
      : paused
        ? { tone: 'warn' as const, label: 'Under maintenance', why: 'Buyers cannot place orders right now.' }
        : data.live
          ? { tone: 'good' as const, label: 'Live', why: 'Stores are open and riders are online.' }
          : counts?.stores === 0
            ? { tone: 'warn' as const, label: 'Not trading', why: 'No stores have been tagged to this campus yet.' }
            : { tone: 'warn' as const, label: 'Not trading', why: 'No riders are active, so nothing can be delivered.' }

  return (
    <>
      <PageHeader
        title={data?.campus?.name ?? 'Your campus'}
        subtitle={
          data?.campus
            ? [data.campus.city, data.campus.state].filter(Boolean).join(', ') || 'Campus operations'
            : undefined
        }
        actions={
          <Toolbar>
            <Button
              size="sm"
              icon={RefreshCw}
              loading={overview.isFetching}
              onClick={() => overview.refetch()}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              variant={paused ? 'primary' : 'danger'}
              icon={Wrench}
              onClick={() => setMaintenanceOpen(true)}
            >
              {paused ? 'Reopen campus' : 'Pause campus'}
            </Button>
          </Toolbar>
        }
      />

      {verdict && (
        <Card className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={verdict.tone} dot>
              {verdict.label}
            </Badge>
            <p className="text-[13.5px] text-ink-soft">{verdict.why}</p>
          </div>
          {paused && data?.campus?.maintenance?.message && (
            <p className="mt-3 rounded-lg bg-raised px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-soft">
              “{data.campus.maintenance.message}”
            </p>
          )}
        </Card>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat
          label="Riders online"
          value={`${count(counts?.activeRiders)} / ${count(counts?.riders)}`}
          hint="Active right now, of all riders on this campus"
          icon={Bike}
          tone={counts?.activeRiders ? 'good' : 'bad'}
          loading={overview.isLoading}
        />
        <Stat
          label="Stores"
          value={count(counts?.stores)}
          hint="Tagged to this campus"
          icon={Building2}
          tone={counts?.stores ? 'good' : 'warn'}
          loading={overview.isLoading}
        />
        <Stat
          label="Products"
          value={count(counts?.products)}
          hint="Listed across those stores"
          icon={Package}
          loading={overview.isLoading}
        />
        <Stat
          label="Buyers"
          value={count(counts?.buyers)}
          hint="Students registered here"
          icon={Users}
          loading={overview.isLoading}
        />
        <Stat
          label="Vendors waiting"
          value={count(counts?.pendingVendors)}
          hint={counts?.pendingVendors ? 'Applications you can approve' : 'Nothing waiting'}
          icon={ShoppingBag}
          tone={counts?.pendingVendors ? 'warn' : 'good'}
          loading={overview.isLoading}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <QuickLink to="/campus/orders" icon={ShoppingBag} label="Orders" hint="What is being ordered today" />
        <QuickLink
          to="/campus/vendors"
          icon={Building2}
          label="Vendors"
          hint={counts?.pendingVendors ? `${count(counts.pendingVendors)} waiting for approval` : 'Approve and manage sellers'}
        />
        <QuickLink to="/campus/riders" icon={Bike} label="Riders" hint="Who is delivering right now" />
      </div>

      {maintenanceOpen && (
        <MaintenanceDialog
          campusName={data?.campus?.name ?? 'this campus'}
          enabling={!paused}
          audience={(counts?.buyers ?? 0) + (counts?.riders ?? 0)}
          onClose={() => setMaintenanceOpen(false)}
          onDone={async () => {
            queryClient.invalidateQueries({ queryKey: ['campus-overview'] })
            // The shell's paused banner reads from the session, not this query.
            await refresh()
          }}
        />
      )}
    </>
  )
}

function QuickLink({
  to,
  icon: Icon,
  label,
  hint,
}: {
  to: string
  icon: typeof Bike
  label: string
  hint: string
}) {
  return (
    <Link
      to={to}
      className="group rounded-xl border border-line bg-panel p-4 transition-colors hover:border-brand/40 hover:bg-raised"
    >
      <Icon className="mb-2.5 h-5 w-5 text-ink-faint transition-colors group-hover:text-brand" aria-hidden />
      <p className="text-[13.5px] font-bold text-ink">{label}</p>
      <p className="mt-0.5 text-[12px] text-ink-faint">{hint}</p>
    </Link>
  )
}

/**
 * Pausing the campus.
 *
 * The count of people about to be notified is on the button's own screen
 * because it is the part that is hard to take back — the flag can be flipped
 * again in a second, the notification cannot be unsent.
 */
function MaintenanceDialog({
  campusName,
  enabling,
  audience,
  onClose,
  onDone,
}: {
  campusName: string
  enabling: boolean
  audience: number
  onClose: () => void
  onDone: () => void | Promise<void>
}) {
  const [message, setMessage] = useState('')
  const [notify, setNotify] = useState(true)

  const save = useMutation({
    mutationFn: () =>
      campusApi.setMaintenance({
        enabled: enabling,
        message: message.trim() || undefined,
        notify,
        channels: ['push', 'inapp'],
      }),
    onSuccess: async () => {
      toast.success(enabling ? `${campusName} is paused` : `${campusName} is back online`)
      await onDone()
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not change maintenance mode.')),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={enabling ? `Pause ${campusName}` : `Reopen ${campusName}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={enabling ? 'danger' : 'primary'}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {enabling ? 'Pause campus' : 'Reopen campus'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <p className="text-[13px] leading-relaxed text-ink-soft">
          {enabling
            ? 'Buyers stop being able to order here, and everyone on the campus is told why.'
            : 'Ordering resumes, and everyone on the campus is told it is working again.'}
        </p>

        {enabling && (
          <Textarea
            label="What to tell them"
            rows={3}
            placeholder={`Ordering is paused while we carry out maintenance. We will let you know as soon as it is back.`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        )}

        <label className="flex items-center gap-2.5 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="size-4 rounded border-line accent-brand"
          />
          Notify the campus — about {count(audience)} {audience === 1 ? 'person' : 'people'}
        </label>
      </div>
    </Modal>
  )
}

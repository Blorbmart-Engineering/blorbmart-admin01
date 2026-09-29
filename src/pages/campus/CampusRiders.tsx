import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { BadgeCheck, Bike, RefreshCw } from 'lucide-react'
import { campusApi, errorMessage, type CampusRider } from '../../lib/api'
import { ago, count, text } from '../../lib/format'
import RiderVerificationDialog, { VerificationBadge } from '../../components/RiderVerification'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Detail,
  Empty,
  Modal,
  PageHeader,
  Stat,
  StatusBadge,
  Textarea,
  type Column,
} from '../../components/ui'

/**
 * Riders on this campus.
 *
 * Sorted with the online ones first, because the question this screen is
 * opened to answer is almost always "is anyone able to deliver right now",
 * not "who is on the roster". The second question — "is this person who they
 * say they are" — is the photo check, and riders waiting on it are counted at
 * the top so the queue does not go unnoticed.
 */
export default function CampusRiders() {
  const queryClient = useQueryClient()
  const [reviewing, setReviewing] = useState<CampusRider | null>(null)
  const [suspending, setSuspending] = useState<CampusRider | null>(null)

  const riders = useQuery({
    queryKey: ['campus-riders'],
    queryFn: campusApi.riders,
    staleTime: 20_000,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['campus-riders'] })
    queryClient.invalidateQueries({ queryKey: ['campus-overview'] })
  }

  const rows = riders.data?.riders ?? []
  const online = rows.filter((r) => r.online).length
  const toReview = rows.filter((r) => r.verification.status === 'pending').length

  const columns: Column<CampusRider>[] = [
    {
      key: 'rider',
      header: 'Rider',
      render: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          {r.photoUrl ? (
            <img src={r.photoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-raised text-[11px] font-bold text-ink-faint">
              {(r.name ?? '?').slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{text(r.name)}</p>
            <p className="truncate text-[11.5px] text-ink-faint">{text(r.phone ?? r.email)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'online',
      header: 'Right now',
      render: (r) =>
        r.online ? (
          <Badge tone="good" dot>
            Online
          </Badge>
        ) : (
          <span className="text-[12.5px] text-ink-faint">{r.lastSeenAt ? ago(r.lastSeenAt) : 'Never seen'}</span>
        ),
    },
    { key: 'status', header: 'Account', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'verified', header: 'Photo check', render: (r) => <VerificationBadge status={r.verification.status} /> },
    {
      key: 'vehicle',
      header: 'Vehicle',
      render: (r) => (
        <span className="text-[12.5px] text-ink-soft">{[r.vehicleType, r.plateNumber].filter(Boolean).join(' · ') || '—'}</span>
      ),
    },
    {
      key: 'deliveries',
      header: 'Delivered',
      align: 'right',
      render: (r) => count(r.deliveriesCompleted),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant={r.verification.status === 'pending' ? 'primary' : 'ghost'}
            onClick={() => setReviewing(r)}
          >
            {r.verification.status === 'pending' ? 'Review' : 'Photos'}
          </Button>
          {r.status === 'active' && (
            <Button size="sm" variant="ghost" onClick={() => setSuspending(r)}>
              Suspend
            </Button>
          )}
          {r.status === 'suspended' && <ReinstateButton rider={r} onDone={refresh} />}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Riders"
        subtitle="Who can deliver on your campus, and who has been checked."
        actions={
          <Button size="sm" icon={RefreshCw} loading={riders.isFetching} onClick={() => riders.refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Online now"
          value={count(online)}
          hint={online === 0 ? 'Nothing can be delivered right now' : 'Available to take a delivery'}
          icon={Bike}
          tone={online ? 'good' : 'bad'}
          loading={riders.isLoading}
        />
        <Stat
          label="Photos to check"
          value={count(toReview)}
          hint={toReview ? 'Selfie and ID waiting for you' : 'Nobody waiting'}
          icon={BadgeCheck}
          tone={toReview ? 'warn' : 'neutral'}
          loading={riders.isLoading}
        />
        <Stat
          label="Riders on campus"
          value={count(rows.length)}
          hint="Registered here, online or not"
          loading={riders.isLoading}
        />
      </div>

      <Card bodyClassName="p-0">
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(r) => r.uid}
          loading={riders.isLoading}
          error={riders.isError ? errorMessage(riders.error) : null}
          onRetry={() => riders.refetch()}
          empty={
            <Empty
              icon={Bike}
              title="No riders yet"
              message="Nobody has signed up to deliver on your campus. Until one does, orders cannot be fulfilled."
            />
          }
        />
      </Card>

      {reviewing && (
        <RiderVerificationDialog
          rider={reviewing}
          decide={campusApi.setRiderVerification}
          onClose={() => setReviewing(null)}
          onDone={refresh}
        />
      )}

      {suspending && <SuspendDialog rider={suspending} onClose={() => setSuspending(null)} onDone={refresh} />}
    </>
  )
}

function ReinstateButton({ rider, onDone }: { rider: CampusRider; onDone: () => void }) {
  const save = useMutation({
    mutationFn: () => campusApi.setRiderStatus(rider.uid, 'active'),
    onSuccess: () => {
      toast.success('Rider reinstated')
      onDone()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not reinstate the rider.')),
  })
  return (
    <Button size="sm" variant="ghost" loading={save.isPending} onClick={() => save.mutate()}>
      Reinstate
    </Button>
  )
}

/**
 * Takes a rider off the road. Asks for a reason because it is the record of
 * why — usually a safety report — and the rider sees it when they sign in.
 */
function SuspendDialog({ rider, onClose, onDone }: { rider: CampusRider; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const save = useMutation({
    mutationFn: () => campusApi.setRiderStatus(rider.uid, 'suspended', reason.trim()),
    onSuccess: () => {
      toast.success('Rider suspended')
      onDone()
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not suspend the rider.')),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="Suspend this rider"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={save.isPending} disabled={!reason.trim()} onClick={() => save.mutate()}>
            Suspend
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="rounded-lg border border-line bg-surface-sunk px-3.5 py-3">
          <Detail label="Rider">{text(rider.name)}</Detail>
          <Detail label="Phone">{text(rider.phone)}</Detail>
          <Detail label="Delivered">{count(rider.deliveriesCompleted)}</Detail>
        </div>
        <p className="text-[13px] leading-relaxed text-ink-soft">
          They are taken offline at once and cannot take jobs or sign in to the rider app until reinstated. A delivery
          they are carrying right now is not cancelled — check the Orders page.
        </p>
        <Textarea label="Reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  )
}

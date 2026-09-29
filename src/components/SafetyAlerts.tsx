import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Bike, CheckCircle2, Eye, MapPin, Phone, RefreshCw, ShieldAlert, User } from 'lucide-react'
import { errorMessage, type SafetyAlert, type SafetyApi, type SafetyPerson } from '../lib/api'
import { ago, dateTime, text } from '../lib/format'
import { Badge, Button, Card, Empty, ErrorState, Modal, PageHeader, Select, Skeleton, Stat, Textarea, Toolbar, cn } from './ui'

/**
 * SOS alerts, for either console.
 *
 * Cards, not a table: an alert is read top to bottom by someone deciding what
 * to do in the next minute — who pressed it, how to call them, where they are,
 * who they were with — and a row of truncated cells hides exactly that.
 *
 * Polls every 15 seconds while open. The push notification is what brings
 * someone here; once they are here, a repeat press moving the pin on the map
 * has to reach them without a refresh.
 */
export default function SafetyAlerts({ api, queryKey, scope }: { api: SafetyApi; queryKey: string; scope: string }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('open')
  const [closing, setClosing] = useState<SafetyAlert | null>(null)

  const alerts = useQuery({
    queryKey: [queryKey, status],
    queryFn: () => api.list(status),
    refetchInterval: 15_000,
    staleTime: 5_000,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: [queryKey] })

  const acknowledge = useMutation({
    mutationFn: (id: string) => api.update(id, 'acknowledge'),
    onSuccess: () => {
      toast.success('Acknowledged — they have been told someone is on it')
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the alert.')),
  })

  const rows = alerts.data?.alerts ?? []
  const open = alerts.data?.open ?? 0

  return (
    <>
      <PageHeader
        title="Safety"
        subtitle={`SOS alerts from riders and customers ${scope}.`}
        actions={
          <Toolbar>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
              <option value="open">Needs action</option>
              <option value="all">All alerts</option>
              <option value="resolved">Closed</option>
            </Select>
            <Button size="sm" icon={RefreshCw} loading={alerts.isFetching} onClick={() => alerts.refetch()}>
              Refresh
            </Button>
          </Toolbar>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Stat
          label="Needs action"
          value={String(open)}
          hint={open ? 'Call them first, then acknowledge' : 'Nothing open right now'}
          icon={ShieldAlert}
          tone={open ? 'bad' : 'good'}
          loading={alerts.isLoading}
        />
        <Stat
          label="Shown"
          value={String(rows.length)}
          hint={status === 'open' ? 'Open and acknowledged' : 'Newest first, open ones on top'}
          loading={alerts.isLoading}
        />
      </div>

      {alerts.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : alerts.isError ? (
        <Card>
          <ErrorState message={errorMessage(alerts.error)} onRetry={() => alerts.refetch()} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <Empty
            icon={ShieldAlert}
            title={status === 'open' ? 'No open alerts' : 'No alerts'}
            message="When a rider or customer presses SOS, it appears here and you are sent a push notification."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              acknowledging={acknowledge.isPending && acknowledge.variables === alert.id}
              onAcknowledge={() => acknowledge.mutate(alert.id)}
              onResolve={() => setClosing(alert)}
            />
          ))}
        </div>
      )}

      {closing && <ResolveDialog alert={closing} api={api} onClose={() => setClosing(null)} onDone={refresh} />}
    </>
  )
}

/**
 * The red count beside "Safety" in the navigation.
 *
 * A head of operations works in a browser, often with no phone registered for
 * push, so an SOS must be visible from whatever page they happen to be on.
 * Shares its cache with the Safety page's "Needs action" view, so opening the
 * page costs no extra request.
 */
export function SafetyCount({ api, queryKey }: { api: SafetyApi; queryKey: string }) {
  const open = useQuery({
    queryKey: [queryKey, 'open'],
    queryFn: () => api.list('open'),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 10_000,
  })
  const n = open.data?.open ?? 0
  if (!n) return null
  return (
    <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-bad px-1.5 text-[11px] font-bold leading-5 text-white">
      {n}
    </span>
  )
}

const STATUS_COPY: Record<SafetyAlert['status'], { label: string; tone: 'bad' | 'warn' | 'good' }> = {
  open: { label: 'Open', tone: 'bad' },
  acknowledged: { label: 'Acknowledged', tone: 'warn' },
  resolved: { label: 'Closed', tone: 'good' },
}

function AlertCard({
  alert,
  acknowledging,
  onAcknowledge,
  onResolve,
}: {
  alert: SafetyAlert
  acknowledging: boolean
  onAcknowledge: () => void
  onResolve: () => void
}) {
  const live = alert.status !== 'resolved'
  const copy = STATUS_COPY[alert.status] ?? STATUS_COPY.open

  return (
    <Card className={cn(alert.status === 'open' && 'border-bad/50')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={copy.tone} dot>
              {copy.label}
            </Badge>
            <span className="text-[12px] text-ink-faint" title={dateTime(alert.createdAt)}>
              {ago(alert.createdAt)}
            </span>
            {alert.presses > 1 && <Badge tone="warn">Pressed {alert.presses}×</Badge>}
          </div>
          <p className="mt-2 text-[15px] font-bold text-ink">
            {alert.reporter.role === 'rider' ? 'Rider' : 'Customer'} {text(alert.reporter.name)} pressed SOS
          </p>
          <p className="text-[12.5px] text-ink-soft">
            {alert.orderId ? (
              <>
                Order <span className="font-semibold text-ink">{alert.orderId}</span>
                {alert.storeName ? ` from ${alert.storeName}` : ''}
                {alert.deliveryStatus ? ` · ${alert.deliveryStatus.replace(/_/g, ' ')}` : ''}
              </>
            ) : (
              'Not on a delivery'
            )}
          </p>
        </div>

        {live && (
          <div className="flex gap-1.5">
            {alert.status === 'open' && (
              <Button size="sm" variant="primary" icon={Eye} loading={acknowledging} onClick={onAcknowledge}>
                Acknowledge
              </Button>
            )}
            <Button size="sm" icon={CheckCircle2} onClick={onResolve}>
              Close
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <PersonCell label="Who pressed it" person={alert.reporter} />
        {alert.counterpart ? (
          <PersonCell label={alert.counterpart.role === 'rider' ? 'Their rider' : 'Their customer'} person={alert.counterpart} />
        ) : (
          <Cell label="With">
            <p className="text-[12.5px] text-ink-faint">Nobody on this order</p>
          </Cell>
        )}
        <Cell label="Where">
          {alert.location ? (
            <>
              <a
                href={alert.mapsUrl ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline"
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                Open in Maps
              </a>
              <p className="text-[11.5px] text-ink-faint">
                {alert.location.accuracy ? `±${alert.location.accuracy}m · ` : ''}
                {alert.location.at ? ago(alert.location.at) : ''}
              </p>
            </>
          ) : (
            <p className="text-[12.5px] text-ink-faint">Location not shared</p>
          )}
          {alert.dropoff?.addressLine1 && (
            <p className="mt-1 text-[11.5px] text-ink-soft">
              Drop-off: {alert.dropoff.addressLine1}
              {alert.dropoff.landmark ? ` · ${alert.dropoff.landmark}` : ''}
            </p>
          )}
        </Cell>
      </div>

      {alert.note && (
        <p className="mt-3 rounded-lg border border-line bg-surface-sunk px-3 py-2 text-[13px] text-ink">“{alert.note}”</p>
      )}

      {(alert.acknowledgedBy || alert.resolvedBy) && (
        <div className="mt-3 space-y-0.5 border-t border-line-soft pt-3 text-[12px] text-ink-faint">
          {alert.acknowledgedBy && (
            <p>
              Acknowledged by {text(alert.acknowledgedBy.name, alert.acknowledgedBy.role ?? 'staff')} {ago(alert.acknowledgedAt)}
            </p>
          )}
          {alert.resolvedBy && (
            <p>
              Closed by {text(alert.resolvedBy.name, alert.resolvedBy.role ?? 'staff')} {ago(alert.resolvedAt)}
              {alert.resolution && (
                <>
                  {' — '}
                  <span className="text-ink-soft">
                    {alert.resolution === 'marked_safe' ? 'they marked themselves safe' : alert.resolution}
                  </span>
                </>
              )}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface-sunk px-3 py-2.5">
      <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-ink-faint">{label}</p>
      {children}
    </div>
  )
}

function PersonCell({ label, person }: { label: string; person: SafetyPerson }) {
  return (
    <Cell label={label}>
      <div className="flex items-center gap-2.5">
        {person.photoUrl ? (
          <img src={person.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-raised text-ink-faint">
            {person.role === 'rider' ? <Bike className="h-4 w-4" aria-hidden /> : <User className="h-4 w-4" aria-hidden />}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink">{text(person.name)}</p>
          {person.phone ? (
            <a href={`tel:${person.phone}`} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline">
              <Phone className="h-3 w-3" aria-hidden />
              {person.phone}
            </a>
          ) : (
            <p className="text-[12px] text-ink-faint">No phone on file</p>
          )}
          {(person.plate || person.vehicle) && (
            <p className="text-[11.5px] text-ink-faint">{[person.vehicle, person.plate].filter(Boolean).join(' · ')}</p>
          )}
        </div>
      </div>
    </Cell>
  )
}

function ResolveDialog({
  alert,
  api,
  onClose,
  onDone,
}: {
  alert: SafetyAlert
  api: SafetyApi
  onClose: () => void
  onDone: () => void
}) {
  const [note, setNote] = useState('')
  const save = useMutation({
    mutationFn: () => api.update(alert.id, 'resolve', note.trim()),
    onSuccess: () => {
      toast.success('Alert closed')
      onDone()
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not close the alert.')),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="Close this alert"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} disabled={!note.trim()} onClick={() => save.mutate()}>
            Close alert
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <p className="text-[13px] leading-relaxed text-ink-soft">
          Write what happened and what was done. This is the record if anyone asks later — including whether a rider
          needs to be suspended.
        </p>
        <Textarea
          label="What happened"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Called the rider — bike broke down near Jaja Hall, safe. Order reassigned."
        />
      </div>
    </Modal>
  )
}

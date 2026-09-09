import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  RefreshCw,
  XCircle,
  Zap,
} from 'lucide-react'
import { adminApi, errorMessage } from '../lib/api'
import { count, dateTime, duration } from '../lib/format'
import { Badge, Button, Card, ErrorState, PageHeader, Stat } from '../components/ui'

/**
 * System health.
 *
 * Built around one question: if something is broken, would this screen show
 * it? So Firestore is measured with a real round trip rather than reported as
 * "connected", and integrations are listed as configured or not — a missing
 * API key is silent at boot and only ever surfaces as a customer's failed
 * payment, which is the worst possible place to discover it.
 */
export default function Health() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: adminApi.health,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

  if (health.isError) {
    return (
      <>
        <PageHeader title="System health" />
        <Card>
          <ErrorState message={errorMessage(health.error)} onRetry={() => health.refetch()} />
        </Card>
      </>
    )
  }

  const data = health.data
  const missing = (data?.integrations ?? []).filter((i) => !i.configured)

  const gradeTone = data?.firestore.grade === 'good' ? 'good' : data?.firestore.grade === 'slow' ? 'warn' : 'bad'

  return (
    <>
      <PageHeader
        title="System health"
        subtitle={data ? `Checked ${dateTime(data.checkedAt)} · refreshes every 30s` : 'Checking…'}
        actions={
          <Button size="sm" icon={RefreshCw} loading={health.isFetching} onClick={() => health.refetch()}>
            Check now
          </Button>
        }
      />

      {/* The banner only appears when something is actually wrong. A dashboard
          that always shows a status bar trains people to ignore it. */}
      {data && !data.firestore.ok && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-bad/40 bg-bad-soft p-4">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-bad" aria-hidden />
          <div>
            <p className="text-[13.5px] font-bold text-bad">Firestore is not responding</p>
            <p className="mt-0.5 text-[12.5px] text-ink-soft">
              {data.firestore.error ?? 'The database did not answer a read.'} Every app is down until this
              clears.
            </p>
          </div>
        </div>
      )}

      {missing.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warn/40 bg-warn-soft p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
          <div>
            <p className="text-[13.5px] font-bold text-warn">
              {missing.length} integration{missing.length > 1 ? 's are' : ' is'} not configured
            </p>
            <p className="mt-0.5 text-[12.5px] text-ink-soft">
              {missing.map((i) => i.name).join(', ')} — the features that depend on{' '}
              {missing.length > 1 ? 'them' : 'it'} will fail for real customers, silently.
            </p>
          </div>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Database latency"
          value={data ? `${count(data.firestore.latencyMs)}ms` : '—'}
          hint={
            data?.firestore.grade === 'good'
              ? 'Normal'
              : data?.firestore.grade === 'slow'
                ? 'Noticeably slow in every app'
                : 'Badly degraded'
          }
          icon={Database}
          tone={gradeTone}
          loading={health.isLoading}
        />
        <Stat
          label="API uptime"
          value={data ? duration(data.process.uptimeSeconds) : '—'}
          hint={
            // A tiny uptime on a host that sleeps is normal, not alarming —
            // said explicitly so nobody reads a cold start as a crash loop.
            data && data.process.uptimeSeconds < 300
              ? 'Recently started — normal after idle'
              : `Node ${data?.process.nodeVersion ?? ''}`
          }
          icon={Cpu}
          tone={data && data.process.uptimeSeconds < 300 ? 'warn' : 'neutral'}
          loading={health.isLoading}
        />
        <Stat
          label="Memory"
          value={data ? `${count(data.process.memoryMb)} MB` : '—'}
          hint={`Environment: ${data?.process.environment ?? '—'}`}
          icon={Cpu}
          loading={health.isLoading}
        />
        <Stat
          label="Orders in the last hour"
          value={count(data?.signals.orders1h)}
          hint={`${count(data?.signals.orders24h)} in 24h`}
          icon={Zap}
          tone="brand"
          loading={health.isLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Integrations" subtitle="Third-party services this platform depends on">
          <ul className="space-y-2.5">
            {(data?.integrations ?? []).map((item) => (
              <li key={item.name} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-ink">{item.name}</p>
                  <p className="text-[11.5px] text-ink-faint">{item.detail}</p>
                </div>
                {item.configured ? (
                  <Badge tone="good">
                    <CheckCircle2 className="h-3 w-3" aria-hidden />
                    Configured
                  </Badge>
                ) : (
                  <Badge tone="bad">
                    <XCircle className="h-3 w-3" aria-hidden />
                    Missing
                  </Badge>
                )}
              </li>
            ))}
            {health.isLoading && <li className="skeleton h-10 rounded-lg" />}
          </ul>
          <p className="mt-3 border-t border-line-soft pt-3 text-[11.5px] leading-relaxed text-ink-faint">
            "Configured" means the key is present on the server. It does not prove the credential is valid —
            only a real transaction does that.
          </p>
        </Card>

        <Card title="Operational signals" subtitle="Numbers that usually move first when something breaks">
          <ul className="space-y-2.5">
            <Signal
              label="Riders online"
              value={count(data?.signals.ridersOnline)}
              tone={data && data.signals.ridersOnline === 0 ? 'bad' : 'good'}
              note={
                data && data.signals.ridersOnline === 0
                  ? 'No rider can be dispatched to right now'
                  : 'Available to take an offer'
              }
            />
            <Signal
              label="Failed bill payments (24h)"
              value={count(data?.signals.failedBills24h)}
              tone={data && data.signals.failedBills24h > 5 ? 'bad' : data && data.signals.failedBills24h > 0 ? 'warn' : 'good'}
              note="A spike usually means the VTU provider, not us"
            />
            <Signal
              label="Rider payouts pending"
              value={count(data?.signals.pendingRiderWithdrawals)}
              tone={data && data.signals.pendingRiderWithdrawals > 5 ? 'warn' : 'good'}
              note="Riders waiting on money"
            />
            <Signal
              label="Server load average"
              value={data ? data.process.loadAverage.toFixed(2) : '—'}
              tone={data && data.process.loadAverage > 2 ? 'warn' : 'good'}
              note="1-minute average"
            />
          </ul>
        </Card>
      </div>
    </>
  )
}

function Signal({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note: string
  tone: 'good' | 'warn' | 'bad'
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-ink">{label}</p>
        <p className="text-[11.5px] text-ink-faint">{note}</p>
      </div>
      <Badge tone={tone} dot>
        {value}
      </Badge>
    </li>
  )
}

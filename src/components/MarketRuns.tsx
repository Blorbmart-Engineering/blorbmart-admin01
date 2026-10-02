import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Bike, Clock, PackageOpen, RefreshCw, Send, Truck } from 'lucide-react'
import { isAxiosError } from 'axios'
import { errorMessage, marketRunsApi, type MarketRun, type MarketRunRider } from '../lib/api'
import { ago, money } from '../lib/format'
import { Badge, Button, Card, Empty, ErrorState, Modal, PageHeader, Select, Skeleton, Stat } from './ui'

/**
 * Handing market runs to riders, for either console.
 *
 * A market run normally sits on every rider's board until one taps it. When
 * nobody does — new riders cannot front the cash, or nobody is online near
 * the market — campus ops picks a rider here. The rider is told at once and
 * the job is exactly what they would have got by tapping it.
 *
 * A rider below the run's cost is not hidden: campus ops often knows who can
 * be trusted with ₦8,000 before the tiers do. Picking them asks first.
 */
export default function MarketRuns({ campusId }: { campusId?: string }) {
  const api = marketRunsApi(campusId)
  const queryClient = useQueryClient()
  const queryKey = ['market-runs', campusId ?? 'mine']
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [vouch, setVouch] = useState<{ run: MarketRun; rider: MarketRunRider; cashToPay: number; limit: number } | null>(null)

  const data = useQuery({ queryKey, queryFn: api.list, refetchInterval: 30_000 })
  const riders = data.data?.riders ?? []
  const runs = data.data?.runs ?? []
  const running = data.data?.running ?? []

  const assign = useMutation({
    mutationFn: ({ run, riderId, overrideLimit }: { run: MarketRun; riderId: string; overrideLimit?: boolean }) =>
      api.assign(run.offerId, riderId, overrideLimit),
    onSuccess: (d) => {
      toast.success(`Order ${d.orderId} given to ${d.riderName}. They have been told.`)
      setVouch(null)
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (error, { run, riderId }) => {
      const body = isAxiosError(error) ? (error.response?.data as { code?: string; data?: { cashToPay: number; sourcingLimit: number } }) : null
      const rider = riders.find((r) => r.uid === riderId)
      if (body?.code === 'OVER_LIMIT' && rider && body.data) {
        setVouch({ run, rider, cashToPay: body.data.cashToPay, limit: body.data.sourcingLimit })
        return
      }
      toast.error(errorMessage(error, 'Could not assign that run.'))
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const free = riders.filter((r) => !r.busy)

  return (
    <>
      <PageHeader
        title="Market runs"
        subtitle="Local market orders nobody has taken yet. Pick a rider and they are told at once."
        actions={
          <Button size="sm" icon={RefreshCw} loading={data.isFetching} onClick={() => data.refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Waiting for a rider" value={String(runs.length)} icon={PackageOpen} tone={runs.length ? 'warn' : 'good'} loading={data.isLoading} />
        <Stat label="Riders free" value={String(free.length)} hint={`${free.filter((r) => r.online).length} online now`} icon={Bike} loading={data.isLoading} />
        <Stat label="Runs under way" value={String(running.length)} icon={Truck} loading={data.isLoading} />
      </div>

      {data.isError ? (
        <ErrorState message={errorMessage(data.error, 'Could not load market runs.')} onRetry={() => data.refetch()} />
      ) : data.isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-5">
          <Card title="Waiting for a rider">
            {runs.length === 0 ? (
              <Empty icon={PackageOpen} title="Nothing waiting" message="Every market run on your campus has a rider." />
            ) : (
              <div className="space-y-3">
                {runs.map((run) => {
                  const choice = picked[run.offerId] ?? ''
                  const chosen = riders.find((r) => r.uid === choice)
                  return (
                    <div key={run.offerId} className="rounded-lg border border-line-soft p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[13px] font-bold text-ink">{run.orderId}</span>
                        <Badge tone="info">{money(run.cashToPay)} to buy</Badge>
                        <Badge tone="good">Rider earns {money(run.deliveryEarning)}</Badge>
                        {run.expired && <Badge tone="warn">Off riders’ boards</Badge>}
                        {run.declinedCount > 0 && <Badge tone="neutral">Skipped by {run.declinedCount}</Badge>}
                      </div>
                      <p className="mt-1 text-[12.5px] text-ink-soft">
                        {run.itemCount} item{run.itemCount === 1 ? '' : 's'}: {run.itemSummary.join(', ') || '—'}
                        {run.dropoffArea ? ` · to ${run.dropoffArea}` : ''}
                        {run.distanceKm != null ? ` · ${run.distanceKm} km` : ''}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-faint">
                        <Clock className="h-3 w-3" aria-hidden /> Waiting {ago(run.createdAt)}
                        {run.deliverBy ? ` · deliver by ${new Date(run.deliverBy).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
                      </p>
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <Select
                          label="Rider"
                          value={choice}
                          onChange={(e) => setPicked((p) => ({ ...p, [run.offerId]: e.target.value }))}
                          className="min-w-[240px] flex-1"
                        >
                          <option value="">Choose a rider…</option>
                          {riders.map((r) => (
                            <option key={r.uid} value={r.uid} disabled={r.busy}>
                              {r.name}
                              {r.busy ? ' — on a delivery' : r.online ? ' — online' : ' — offline'}
                              {` · limit ${money(r.sourcingLimit)}`}
                              {r.sourcingLimit < run.cashToPay ? ' (below cost)' : ''}
                            </option>
                          ))}
                        </Select>
                        <Button
                          variant="primary"
                          icon={Send}
                          disabled={!choice}
                          loading={assign.isPending && assign.variables?.run.offerId === run.offerId}
                          onClick={() => assign.mutate({ run, riderId: choice })}
                        >
                          Assign
                        </Button>
                      </div>
                      {chosen && !chosen.online && (
                        <p className="mt-1.5 text-[12px] text-warn">{chosen.name} is offline. Call them to make sure they see it.</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <Card title="Under way">
            {running.length === 0 ? (
              <Empty icon={Truck} title="No market runs under way" />
            ) : (
              <div className="divide-y divide-line-soft">
                {running.map((d) => (
                  <div key={d.deliveryId} className="flex flex-wrap items-center gap-2 py-2.5 text-[13px]">
                    <span className="font-mono font-semibold text-ink">{d.orderId}</span>
                    <span className="text-ink-soft">{d.riderName}</span>
                    <Badge tone="info">{d.status.replace(/_/g, ' ')}</Badge>
                    <span className="text-ink-faint">{money(d.cashToPay)}</span>
                    {d.assignedBy && <Badge tone="neutral">Assigned{d.assignedBy.overrideLimit ? ' over limit' : ''}</Badge>}
                    <span className="ml-auto text-[12px] text-ink-faint">{ago(d.assignedAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <Modal
        open={Boolean(vouch)}
        onClose={() => setVouch(null)}
        title="Above this rider’s limit"
        footer={
          <>
            <Button variant="ghost" onClick={() => setVouch(null)}>
              Pick someone else
            </Button>
            <Button
              variant="primary"
              loading={assign.isPending}
              onClick={() => vouch && assign.mutate({ run: vouch.run, riderId: vouch.rider.uid, overrideLimit: true })}
            >
              Assign anyway
            </Button>
          </>
        }
      >
        {vouch && (
          <p className="text-[13px] leading-relaxed text-ink-soft">
            This run needs {vouch.rider.name} to pay {money(vouch.cashToPay)} at the market, and their limit is{' '}
            {money(vouch.limit)}
            {vouch.limit <= 0 ? ' — they have not done enough deliveries to front cash yet' : ''}. They are reimbursed when they
            confirm what they paid. Only assign it if you trust them with that amount; it is recorded against your name.
          </p>
        )}
      </Modal>
    </>
  )
}

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { MessageSquareWarning, RefreshCw, Star } from 'lucide-react'
import { adminApi, errorMessage, type HeldReview, type RatingSummaryRow } from '../lib/api'
import { dateTime, shortId, text } from '../lib/format'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Empty,
  Modal,
  PageHeader,
  Select,
  Stat,
  Toolbar,
  type Column,
} from '../components/ui'

/**
 * Service quality: how stores and riders are rated, worst first, and the
 * public reviews held back by moderation.
 *
 * Stars count towards averages whether the customer chose public or private.
 * Private comments are shown here for operations; the store or rider sees
 * them without the customer's name, order or exact time.
 */
export default function Ratings() {
  const queryClient = useQueryClient()
  const [days, setDays] = useState(30)
  const [report, setReport] = useState<{ kind: 'store' | 'rider'; id: string; name: string } | null>(null)

  const overview = useQuery({ queryKey: ['rating-overview', days], queryFn: () => adminApi.ratingOverview(days) })
  const held = useQuery({ queryKey: ['held-reviews'], queryFn: () => adminApi.heldReviews('pending') })
  const detail = useQuery({
    queryKey: ['rating-report', report?.kind, report?.id, days],
    queryFn: () => adminApi.ratingReport(report!.kind, report!.id, days),
    enabled: Boolean(report),
  })

  const moderate = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approved' | 'hidden' }) => adminApi.moderateReview(id, decision),
    onSuccess: (_d, v) => {
      toast.success(v.decision === 'approved' ? 'Review published' : 'Review hidden')
      queryClient.invalidateQueries({ queryKey: ['held-reviews'] })
      queryClient.invalidateQueries({ queryKey: ['rating-overview'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the review.')),
  })

  const summaryColumns = (kind: 'store' | 'rider'): Column<RatingSummaryRow>[] => [
    {
      key: 'name',
      header: kind === 'store' ? 'Store' : 'Rider',
      render: (r) => <span className="font-semibold text-ink">{text(r.name, shortId(r.id, 12))}</span>,
    },
    {
      key: 'avg',
      header: 'Average',
      align: 'right',
      render: (r) => <Badge tone={r.average < 3 ? 'bad' : r.average < 4 ? 'warn' : 'good'}>{`${r.average.toFixed(2)}★`}</Badge>,
    },
    { key: 'count', header: 'Ratings', align: 'right', render: (r) => r.count },
    {
      key: 'low',
      header: '1–2★',
      align: 'right',
      render: (r) => (r.low ? <span className="font-semibold text-bad">{r.low}</span> : '0'),
    },
  ]

  const heldColumns: Column<HeldReview>[] = [
    { key: 'store', header: 'Store', render: (r) => text(r.storeName) },
    { key: 'stars', header: 'Stars', render: (r) => `${r.food}★` },
    { key: 'comment', header: 'Comment', render: (r) => <span className="text-[12.5px]">{text(r.comment)}</span> },
    {
      key: 'why',
      header: 'Held because',
      render: (r) => <span className="text-[12px] text-ink-soft">{(r.moderation.reasons ?? []).join('; ')}</span>,
    },
    {
      key: 'act',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={() => moderate.mutate({ id: r.id, decision: 'hidden' })}>
            Hide
          </Button>
          <Button size="sm" variant="primary" onClick={() => moderate.mutate({ id: r.id, decision: 'approved' })}>
            Publish
          </Button>
        </div>
      ),
    },
  ]

  const o = overview.data
  const d = detail.data

  return (
    <>
      <PageHeader
        title="Ratings & feedback"
        subtitle="How customers rate stores and riders, worst first, and public reviews waiting for a decision."
        actions={
          <Toolbar>
            <Select label="Period" value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="w-36">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </Select>
            <div className="pb-0.5">
              <Button size="sm" icon={RefreshCw} loading={overview.isFetching} onClick={() => overview.refetch()}>
                Refresh
              </Button>
            </div>
          </Toolbar>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Stores rated" value={String(o?.stores.length ?? 0)} icon={Star} loading={overview.isLoading} />
        <Stat label="Riders rated" value={String(o?.riders.length ?? 0)} loading={overview.isLoading} />
        <Stat
          label="Reviews held"
          value={String(held.data?.length ?? 0)}
          icon={MessageSquareWarning}
          tone={(held.data?.length ?? 0) > 0 ? 'warn' : 'good'}
          loading={held.isLoading}
        />
      </div>

      {(held.data?.length ?? 0) > 0 && (
        <Card className="mb-4" title="Public reviews held for moderation" bodyClassName="p-0">
          <DataTable columns={heldColumns} rows={held.data ?? []} keyOf={(r) => r.id} />
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Stores" bodyClassName="p-0">
          <DataTable
            columns={summaryColumns('store')}
            rows={o?.stores ?? []}
            keyOf={(r) => r.id}
            loading={overview.isLoading}
            error={overview.isError ? errorMessage(overview.error) : null}
            onRowClick={(r) => setReport({ kind: 'store', id: r.id, name: text(r.name, r.id) })}
            empty={<Empty title="No store ratings in this period" />}
          />
        </Card>
        <Card title="Riders" bodyClassName="p-0">
          <DataTable
            columns={summaryColumns('rider')}
            rows={o?.riders ?? []}
            keyOf={(r) => r.id}
            loading={overview.isLoading}
            onRowClick={(r) => setReport({ kind: 'rider', id: r.id, name: shortId(r.id, 12) })}
            empty={<Empty title="No rider ratings in this period" />}
          />
        </Card>
      </div>

      <Modal open={Boolean(report)} onClose={() => setReport(null)} title={report ? `${report.name}: feedback report` : ''} wide>
        {detail.isLoading && <p className="text-[13px] text-ink-soft">Loading…</p>}
        {detail.isError && <p className="text-[13px] text-bad">{errorMessage(detail.error)}</p>}
        {d && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Average" value={d.average == null ? '—' : `${d.average}★`} />
              <Stat label="Ratings" value={String(d.count)} />
              <Stat label="4–5★" value={String(d.positive)} tone="good" />
              <Stat label="1–2★" value={String(d.negative)} tone={d.negative ? 'bad' : 'good'} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-ink-faint">Common compliments</p>
                {d.compliments.length ? (
                  d.compliments.map((c) => <p key={c.tag} className="text-[13px]">{`${c.tag} · ${c.count}`}</p>)
                ) : (
                  <p className="text-[13px] text-ink-soft">None yet</p>
                )}
              </div>
              <div>
                <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-ink-faint">Common complaints</p>
                {d.complaints.length ? (
                  d.complaints.map((c) => <p key={c.tag} className="text-[13px]">{`${c.tag} · ${c.count}`}</p>)
                ) : (
                  <p className="text-[13px] text-ink-soft">None</p>
                )}
              </div>
            </div>
            {d.trend.length > 1 && (
              <div>
                <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-ink-faint">Week by week</p>
                <p className="text-[13px]">{d.trend.map((w) => `${w.week.slice(5)}: ${w.average}★ (${w.count})`).join('  ·  ')}</p>
              </div>
            )}
            <div>
              <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-ink-faint">Comments</p>
              {d.comments.length === 0 && <p className="text-[13px] text-ink-soft">No comments in this period.</p>}
              <ul className="space-y-2">
                {d.comments.map((c, i) => (
                  <li key={i} className="text-[13px]">
                    <span className="font-semibold">{`${c.stars}★`}</span> {c.comment}{' '}
                    <span className="text-[11.5px] text-ink-faint">
                      {`${c.visibility === 'public' ? 'public' : 'private'} · ${text(c.orderId)} · ${dateTime(c.createdAt)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

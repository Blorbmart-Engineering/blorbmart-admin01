import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Ban, CheckCircle2, Clock, Eye, Flag, Phone, RefreshCw, RotateCcw, Scale, Undo2 } from 'lucide-react'
import { errorMessage, marketplaceApi, type ModerationListing, type ModerationOrder } from '../lib/api'
import { ago, money } from '../lib/format'
import { Badge, Button, Card, Empty, ErrorState, Modal, PageHeader, Skeleton, Stat, Textarea } from './ui'
import MarketplaceSellers from './MarketplaceSellers'

/**
 * The student marketplace, from the campus team's side — for either console.
 *
 * Three queues, most urgent first:
 *   * disputes: money held between two students, waiting on a decision;
 *   * reported listings: hidden automatically after several reports, or
 *     flagged and still showing;
 *   * quiet sales: accepted a week ago and never handed over — worth a call
 *     before either side files a dispute.
 *
 * Refund and release both move real money and cannot be undone, so each one
 * goes through a confirmation that says exactly who gets what.
 */
export default function MarketplaceModeration({ campusId }: { campusId?: string }) {
  const api = marketplaceApi(campusId)
  const queryClient = useQueryClient()
  const queryKey = ['marketplace-queue', campusId ?? 'mine']
  const [deciding, setDeciding] = useState<{ order: ModerationOrder; outcome: 'refund' | 'release' } | null>(null)
  const [hiding, setHiding] = useState<ModerationListing | null>(null)
  const [note, setNote] = useState('')

  const queue = useQuery({ queryKey, queryFn: api.queue, refetchInterval: 60_000 })
  const refresh = () => queryClient.invalidateQueries({ queryKey })

  const moderate = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: 'hide' | 'restore' | 'dismiss'; reason?: string }) =>
      api.moderate(id, action, reason),
    onSuccess: (_, { action }) => {
      toast.success(action === 'hide' ? 'Taken down — the seller has been told' : action === 'restore' ? 'Back up for sale' : 'Reports cleared')
      setHiding(null)
      setNote('')
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the listing.')),
  })

  const resolve = useMutation({
    mutationFn: ({ id, outcome, note }: { id: string; outcome: 'refund' | 'release'; note?: string }) => api.resolve(id, outcome, note),
    onSuccess: (_, { outcome }) => {
      toast.success(outcome === 'refund' ? 'Refunded to the buyer' : 'Released to the seller')
      setDeciding(null)
      setNote('')
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not settle the dispute.')),
  })

  const data = queue.data
  const reported = data?.listings ?? []

  return (
    <>
      <PageHeader
        title="Student marketplace"
        subtitle="Who may sell, disputes, reported listings and sales that have gone quiet."
        actions={
          <Button size="sm" icon={RefreshCw} loading={queue.isFetching} onClick={() => queue.refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Disputes" value={String(data?.disputes.length ?? 0)} icon={Scale} tone={data?.disputes.length ? 'bad' : 'good'} hint="Money held until you decide" loading={queue.isLoading} />
        <Stat label="Reported listings" value={String(reported.length)} icon={Flag} tone={reported.length ? 'warn' : 'good'} hint="Hidden after 3 reports" loading={queue.isLoading} />
        <Stat label="Quiet sales" value={String(data?.stale.length ?? 0)} icon={Clock} hint="Accepted over a week ago" loading={queue.isLoading} />
      </div>

      {queue.isError ? (
        <ErrorState message={errorMessage(queue.error, 'Could not load the marketplace queue.')} onRetry={() => queue.refetch()} />
      ) : queue.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <div className="space-y-5">
          <Card title="Disputes" subtitle="Call both students before deciding. Refund and release cannot be undone.">
            {data?.disputes.length ? (
              <div className="space-y-3">
                {data.disputes.map((o) => (
                  <OrderRow key={o.id} order={o}>
                    <Button size="sm" variant="danger" icon={Undo2} onClick={() => setDeciding({ order: o, outcome: 'refund' })}>
                      Refund buyer
                    </Button>
                    <Button size="sm" variant="primary" icon={CheckCircle2} onClick={() => setDeciding({ order: o, outcome: 'release' })}>
                      Pay seller
                    </Button>
                  </OrderRow>
                ))}
              </div>
            ) : (
              <Empty icon={Scale} title="No disputes" message="Every sale on your campus is going smoothly." />
            )}
          </Card>

          <MarketplaceSellers campusId={campusId} />

          <Card title="Reported listings">
            {reported.length ? (
              <div className="space-y-3">
                {reported.map((l) => (
                  <ListingRow key={l.id} listing={l}>
                    {l.status === 'hidden' ? (
                      <Button size="sm" icon={RotateCcw} loading={moderate.isPending} onClick={() => moderate.mutate({ id: l.id, action: 'restore' })}>
                        Put back up
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="danger" icon={Ban} onClick={() => setHiding(l)}>
                          Take down
                        </Button>
                        <Button size="sm" variant="ghost" icon={Eye} loading={moderate.isPending} onClick={() => moderate.mutate({ id: l.id, action: 'dismiss' })}>
                          It is fine
                        </Button>
                      </>
                    )}
                  </ListingRow>
                ))}
              </div>
            ) : (
              <Empty icon={Flag} title="Nothing reported" />
            )}
          </Card>

          {Boolean(data?.stale.length) && (
            <Card title="Quiet sales" subtitle="Accepted over a week ago and not handed over. The buyer's money is still held.">
              <div className="space-y-3">
                {data!.stale.map((o) => (
                  <OrderRow key={o.id} order={o}>
                    <Button size="sm" variant="danger" icon={Undo2} onClick={() => setDeciding({ order: o, outcome: 'refund' })}>
                      Refund buyer
                    </Button>
                    <Button size="sm" icon={CheckCircle2} onClick={() => setDeciding({ order: o, outcome: 'release' })}>
                      Pay seller
                    </Button>
                  </OrderRow>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      <Modal
        open={Boolean(deciding)}
        onClose={() => setDeciding(null)}
        title={deciding?.outcome === 'refund' ? 'Refund the buyer?' : 'Pay the seller?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button
              variant={deciding?.outcome === 'refund' ? 'danger' : 'primary'}
              loading={resolve.isPending}
              onClick={() => deciding && resolve.mutate({ id: deciding.order.id, outcome: deciding.outcome, note: note.trim() || undefined })}
            >
              {deciding?.outcome === 'refund' ? 'Refund' : 'Pay seller'} {deciding ? money(deciding.order.amount) : ''}
            </Button>
          </>
        }
      >
        {deciding && (
          <div className="space-y-3 text-[13px] text-ink-soft">
            <p>
              {deciding.outcome === 'refund'
                ? `${money(deciding.order.amount)} goes back to ${deciding.order.buyer.name}'s wallet and the listing is taken down.`
                : `${deciding.order.seller.name} receives the sale in their marketplace earnings, and the item is marked sold.`}{' '}
              Both students are told. This cannot be undone.
            </p>
            <Textarea label="Note to both students (optional)" value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(hiding)}
        onClose={() => setHiding(null)}
        title="Take this listing down?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setHiding(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={moderate.isPending} onClick={() => hiding && moderate.mutate({ id: hiding.id, action: 'hide', reason: note.trim() || undefined })}>
              Take down
            </Button>
          </>
        }
      >
        <Textarea label="Reason the seller will see" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. Exam papers cannot be sold on Blorbmart" />
      </Modal>
    </>
  )
}

function OrderRow({ order, children }: { order: ModerationOrder; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line-soft p-3">
      <div className="flex gap-3">
        <Thumb src={order.listing.photo} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[13.5px] font-bold text-ink">{order.listing.title}</span>
            <Badge tone={order.status === 'disputed' ? 'bad' : 'warn'}>{order.status === 'disputed' ? 'Disputed' : 'Accepted'}</Badge>
            <span className="text-[12.5px] font-semibold text-ink">{money(order.amount)}</span>
          </div>
          {order.dispute && (
            <p className="mt-1 text-[12.5px] text-ink-soft">
              <span className="font-semibold capitalize">{order.dispute.by}</span>: “{order.dispute.reason}” · {ago(order.dispute.openedAt)}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-faint">
            <Person label="Buyer" name={order.buyer.name} phone={order.buyer.phone} />
            <Person label="Seller" name={order.seller.name} phone={order.seller.phone} />
            {order.meetupNote && <span>Meet-up: {order.meetupNote}</span>}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">{children}</div>
    </div>
  )
}

function ListingRow({ listing, children }: { listing: ModerationListing; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line-soft p-3">
      <div className="flex gap-3">
        <Thumb src={listing.photos[0]} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[13.5px] font-bold text-ink">{listing.title}</span>
            <Badge tone={listing.status === 'hidden' ? 'bad' : 'warn'}>{listing.status === 'hidden' ? 'Hidden' : 'Showing'}</Badge>
            <span className="text-[12.5px] font-semibold text-ink">{money(listing.price)}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-soft">{listing.description || 'No description.'}</p>
          <p className="mt-1 text-[12px] text-ink-faint">
            {listing.sellerName} · {listing.categoryLabel} · listed {ago(listing.createdAt)}
          </p>
          {listing.reports?.length ? (
            <ul className="mt-2 space-y-0.5 text-[12px] text-ink-soft">
              {listing.reports.map((r, i) => (
                <li key={i}>
                  <Flag className="mr-1 inline h-3 w-3 text-warn" aria-hidden />
                  {r.reason}
                  {r.note ? ` — “${r.note}”` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">{children}</div>
    </div>
  )
}

function Person({ label, name, phone }: { label: string; name: string; phone?: string | null }) {
  return (
    <span>
      {label}: <span className="font-semibold text-ink-soft">{name}</span>
      {phone && (
        <a href={`tel:${phone}`} className="ml-1.5 inline-flex items-center gap-1 text-brand hover:underline">
          <Phone className="h-3 w-3" aria-hidden />
          {phone}
        </a>
      )}
    </span>
  )
}

function Thumb({ src }: { src?: string | null }) {
  return (
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-raised">
      {src && <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />}
    </div>
  )
}

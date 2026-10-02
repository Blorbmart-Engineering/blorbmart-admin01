import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { BadgeCheck, Ban, Phone, UserCheck, UserX } from 'lucide-react'
import { errorMessage, marketplaceApi, type MarketSeller, type SellerStatus } from '../lib/api'
import { ago } from '../lib/format'
import { Badge, Button, Card, Empty, Modal, Select, Skeleton, Textarea } from './ui'

/**
 * Who may sell on the student marketplace, for either console.
 *
 * A student applies with their name as on their ID, matric number, a photo of
 * the ID and a selfie. Approve when the face matches and the ID is for this
 * campus; reject with a reason they can act on. Suspending a verified seller
 * also takes their items off the marketplace.
 */
export default function MarketplaceSellers({ campusId }: { campusId?: string }) {
  const api = marketplaceApi(campusId)
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<SellerStatus>('pending')
  const [deciding, setDeciding] = useState<{ seller: MarketSeller; decision: 'rejected' | 'suspended' } | null>(null)
  const [reason, setReason] = useState('')
  const [zoom, setZoom] = useState<string | null>(null)
  const queryKey = ['marketplace-sellers', campusId ?? 'mine', status]

  const sellers = useQuery({ queryKey, queryFn: () => api.sellers(status), refetchInterval: 60_000 })

  const review = useMutation({
    mutationFn: ({ uid, decision, reason }: { uid: string; decision: 'verified' | 'rejected' | 'suspended'; reason?: string }) =>
      api.reviewSeller(uid, decision, reason),
    onSuccess: (_, { decision }) => {
      toast.success(decision === 'verified' ? 'Approved — they can list now' : decision === 'rejected' ? 'Rejected — they have been told why' : 'Suspended — their items are down')
      setDeciding(null)
      setReason('')
      queryClient.invalidateQueries({ queryKey: ['marketplace-sellers'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the seller.')),
  })

  const rows = sellers.data ?? []

  return (
    <>
      <Card
        title="Sellers"
        subtitle="Only students you verify can list. Match the selfie to the ID, and check the ID is for this campus."
        actions={
          <Select value={status} onChange={(e) => setStatus(e.target.value as SellerStatus)} className="w-40">
            <option value="pending">Waiting for you</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </Select>
        }
      >
        {sellers.isLoading ? (
          <Skeleton className="h-28" />
        ) : rows.length === 0 ? (
          <Empty icon={UserCheck} title={status === 'pending' ? 'No one waiting' : `No ${status} sellers`} />
        ) : (
          <div className="space-y-3">
            {rows.map((s) => (
              <div key={s.uid} className="flex flex-wrap gap-3 rounded-lg border border-line-soft p-3">
                <div className="flex gap-2">
                  <Photo src={s.idPhotoUrl} label="Student ID" onOpen={setZoom} />
                  <Photo src={s.selfieUrl} label="Selfie" onOpen={setZoom} />
                </div>
                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-bold text-ink">{s.fullName || 'No name'}</span>
                    <Badge tone={s.status === 'verified' ? 'good' : s.status === 'pending' ? 'warn' : 'bad'}>{s.status}</Badge>
                  </div>
                  <p className="mt-1 text-[12.5px] text-ink-soft">
                    Matric <span className="font-mono font-semibold text-ink">{s.matricNumber || '—'}</span> · applied {ago(s.submittedAt)}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-faint">
                    {s.email || ''}
                    {s.phone && (
                      <a href={`tel:${s.phone}`} className="ml-2 inline-flex items-center gap-1 text-brand hover:underline">
                        <Phone className="h-3 w-3" aria-hidden />
                        {s.phone}
                      </a>
                    )}
                  </p>
                  {s.reason && <p className="mt-1 text-[12.5px] text-bad">“{s.reason}”</p>}
                </div>
                <div className="flex w-full flex-wrap items-start justify-end gap-2 sm:w-auto">
                  {s.status === 'pending' && (
                    <>
                      <Button size="sm" variant="danger" icon={UserX} onClick={() => setDeciding({ seller: s, decision: 'rejected' })}>
                        Reject
                      </Button>
                      <Button size="sm" variant="primary" icon={BadgeCheck} loading={review.isPending} onClick={() => review.mutate({ uid: s.uid, decision: 'verified' })}>
                        Approve
                      </Button>
                    </>
                  )}
                  {s.status === 'verified' && (
                    <Button size="sm" variant="danger" icon={Ban} onClick={() => setDeciding({ seller: s, decision: 'suspended' })}>
                      Suspend
                    </Button>
                  )}
                  {s.status === 'suspended' && (
                    <Button size="sm" icon={BadgeCheck} loading={review.isPending} onClick={() => review.mutate({ uid: s.uid, decision: 'verified' })}>
                      Let them sell again
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(deciding)}
        onClose={() => setDeciding(null)}
        title={deciding?.decision === 'rejected' ? `Reject ${deciding.seller.fullName || 'this student'}?` : `Suspend ${deciding?.seller.fullName || 'this seller'}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!reason.trim()}
              loading={review.isPending}
              onClick={() => deciding && review.mutate({ uid: deciding.seller.uid, decision: deciding.decision, reason: reason.trim() })}
            >
              {deciding?.decision === 'rejected' ? 'Reject' : 'Suspend'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[13px] text-ink-soft">
          <p>
            {deciding?.decision === 'rejected'
              ? 'They can fix it and apply again. Tell them exactly what to change.'
              : 'Their items come off the marketplace now. Sales already paid for still finish or get refunded as usual.'}
          </p>
          <Textarea
            label="Reason the student will see"
            value={reason}
            maxLength={300}
            rows={3}
            onChange={(e) => setReason(e.target.value)}
            placeholder={deciding?.decision === 'rejected' ? 'e.g. The ID photo is blurry — retake it in good light' : 'e.g. Several buyers reported items that were not as described'}
          />
        </div>
      </Modal>

      <Modal open={Boolean(zoom)} onClose={() => setZoom(null)} title="Photo" wide>
        {zoom && <img src={zoom} alt="" className="mx-auto max-h-[65vh] rounded-lg object-contain" />}
      </Modal>
    </>
  )
}

function Photo({ src, label, onOpen }: { src: string | null; label: string; onOpen: (src: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => src && onOpen(src)}
      className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-raised text-[11px] text-ink-faint"
      title={`${label} — click to enlarge`}
    >
      {src ? <img src={src} alt={label} className="h-full w-full object-cover" loading="lazy" /> : label}
    </button>
  )
}

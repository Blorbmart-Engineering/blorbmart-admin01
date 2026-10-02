import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { BadgeCheck, ImageOff } from 'lucide-react'
import { errorMessage, type VerificationStatus } from '../lib/api'
import { dateTime, text } from '../lib/format'
import { Badge, Button, Detail, Modal, Textarea } from './ui'

const TONE: Record<VerificationStatus, 'neutral' | 'warn' | 'good' | 'bad'> = {
  unverified: 'neutral',
  pending: 'warn',
  verified: 'good',
  rejected: 'bad',
}

const LABEL: Record<VerificationStatus, string> = {
  unverified: 'No photos',
  pending: 'To review',
  verified: 'Verified',
  rejected: 'Rejected',
}

export const VerificationBadge = ({ status }: { status: VerificationStatus }) => (
  <Badge tone={TONE[status] ?? 'neutral'} dot>
    {LABEL[status] ?? status}
  </Badge>
)

export interface VerifiableRider {
  uid: string
  name: string | null
  phone: string | null
  vehicleType: string | null
  plateNumber: string | null
  verification: { status: VerificationStatus; reason: string | null; submittedAt: number | null; decidedByRole?: string | null }
  /** The rider's Didit ID check, when they did one. */
  kyc?: { status: string | null; name: string | null } | null
  documents: {
    idType?: string | null
    idNumber?: string | null
    selfieUrl?: string | null
    idImageUrl?: string | null
  } | null
}

/**
 * The check itself: the selfie beside the ID, and the name on the account.
 *
 * Verifying is what puts this face in front of a customer as "verified", so
 * the photos are shown large enough to actually compare. Rejecting needs a
 * reason because it is sent to the rider, who has to know what to retake.
 */
export default function RiderVerificationDialog({
  rider,
  decide,
  onClose,
  onDone,
}: {
  rider: VerifiableRider
  decide: (uid: string, status: 'verified' | 'rejected', reason?: string) => Promise<unknown>
  onClose: () => void
  onDone: () => void
}) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const docs = rider.documents
  const complete = Boolean(docs?.selfieUrl && docs?.idImageUrl)

  const save = useMutation({
    mutationFn: (status: 'verified' | 'rejected') => decide(rider.uid, status, status === 'rejected' ? reason.trim() : undefined),
    onSuccess: (_data, status) => {
      toast.success(status === 'verified' ? 'Rider verified' : 'Sent back to the rider')
      onDone()
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the rider.')),
  })

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Check this rider"
      footer={
        rejecting ? (
          <>
            <Button onClick={() => setRejecting(false)}>Back</Button>
            <Button
              variant="danger"
              loading={save.isPending}
              disabled={!reason.trim()}
              onClick={() => save.mutate('rejected')}
            >
              Send back
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            {complete && (
              <>
                <Button variant="danger" onClick={() => setRejecting(true)}>
                  Reject
                </Button>
                <Button
                  variant="primary"
                  icon={BadgeCheck}
                  loading={save.isPending}
                  onClick={() => save.mutate('verified')}
                >
                  Verify
                </Button>
              </>
            )}
          </>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-bold text-ink">{text(rider.name)}</p>
          <VerificationBadge status={rider.verification.status} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Photo label="Selfie" url={docs?.selfieUrl} />
          <Photo label="ID" url={docs?.idImageUrl} />
        </div>

        <div className="rounded-lg border border-line bg-surface-sunk px-3.5 py-3">
          <Detail label="ID type">{text(docs?.idType)}</Detail>
          <Detail label="ID number">{text(docs?.idNumber)}</Detail>
          <Detail label="Phone">{text(rider.phone)}</Detail>
          <Detail label="Vehicle">{[rider.vehicleType, rider.plateNumber].filter(Boolean).join(' · ') || '—'}</Detail>
          {rider.verification.submittedAt && <Detail label="Sent">{dateTime(rider.verification.submittedAt)}</Detail>}
          {rider.verification.reason && <Detail label="Last rejected">{rider.verification.reason}</Detail>}
          {rider.kyc && (
            <Detail label="Didit ID check">
              {rider.kyc.status || 'Started'}
              {rider.verification.decidedByRole === 'didit' ? ' · decided by Didit' : ''}
            </Detail>
          )}
          {rider.kyc?.name && <Detail label="Name on ID">{rider.kyc.name}</Detail>}
        </div>

        {!complete ? (
          <p className="text-[13px] leading-relaxed text-ink-soft">
            This rider has not sent both photos yet. They are asked for them in the rider app, under Account → Get
            verified.
          </p>
        ) : rejecting ? (
          <Textarea
            label="What to fix (sent to the rider)"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. The ID photo is blurred — retake it in good light."
          />
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Verify only if the selfie is clearly the person on the ID and the name matches the account. Customers see
            this photo and a verified mark when the rider is on the way to them.
          </p>
        )}
      </div>
    </Modal>
  )
}

function Photo({ label, url }: { label: string; url?: string | null }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-surface-sunk">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" title="Open full size">
          <img src={url} alt={label} className="h-64 w-full object-contain" />
        </a>
      ) : (
        <div className="grid h-64 place-items-center text-ink-faint">
          <ImageOff className="h-6 w-6" aria-hidden />
        </div>
      )}
      <figcaption className="border-t border-line-soft px-3 py-1.5 text-[11.5px] font-semibold text-ink-faint">{label}</figcaption>
    </figure>
  )
}

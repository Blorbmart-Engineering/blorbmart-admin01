import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Ban, Gift, RefreshCw } from 'lucide-react'
import { adminApi, errorMessage, type GiftCardRow } from '../lib/api'
import { ago, count, money, shortId, text } from '../lib/format'
import {
  Button,
  Card,
  DataTable,
  Detail,
  Empty,
  Modal,
  PageHeader,
  Select,
  Stat,
  StatusBadge,
  Textarea,
  Toolbar,
  type Column,
} from '../components/ui'

/**
 * Gift cards.
 *
 * "Outstanding" is money the platform holds for cards nobody has redeemed
 * yet — a liability, not revenue. Staff see the last four characters of a
 * code and never the rest: no screen here can show or re-send one.
 *
 * Cancelling is for a charge-back or a stolen code. It only works on an
 * unused card, and can put the value back in the buyer's wallet in the same
 * step.
 */
export default function GiftCards() {
  const [status, setStatus] = useState('all')
  const [target, setTarget] = useState<GiftCardRow | null>(null)
  const client = useQueryClient()

  const cards = useQuery({
    queryKey: ['gift-cards', status],
    queryFn: () => adminApi.giftCards({ status: status === 'all' ? undefined : status, limit: 300 }),
    staleTime: 30_000,
  })

  const rows = cards.data?.cards ?? []
  const summary = cards.data?.summary

  const columns: Column<GiftCardRow>[] = [
    {
      key: 'card',
      header: 'Card',
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{text(c.design?.headline, 'Gift card')}</p>
          <p className="truncate text-[11.5px] text-ink-faint">
            {c.to ? `To ${c.to}` : 'No name'}
            {c.from ? ` · from ${c.from}` : ''}
          </p>
        </div>
      ),
    },
    { key: 'amount', header: 'Value', align: 'right', render: (c) => <span className="font-semibold text-ink">{money(c.amount)}</span> },
    { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
    { key: 'code', header: 'Code', render: (c) => <span className="tabular text-[12px]">{c.codeLast4 ? `••••-${c.codeLast4}` : '—'}</span> },
    { key: 'buyer', header: 'Bought by', render: (c) => <span className="text-[12px]">{text(c.purchaserEmail, shortId(c.purchaserId, 10))}</span> },
    {
      key: 'redeemer',
      header: 'Redeemed by',
      render: (c) => (c.redeemedBy ? <span className="text-[12px]">{text(c.redeemedByEmail, shortId(c.redeemedBy, 10))}</span> : '—'),
    },
    { key: 'paid', header: 'Paid with', render: (c) => (c.paymentMethod === 'wallet' ? 'Wallet' : 'Paystack') },
    { key: 'when', header: 'Bought', align: 'right', render: (c) => ago(c.createdAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) =>
        c.status === 'active' ? (
          <Button size="sm" variant="danger" icon={Ban} onClick={() => setTarget(c)}>
            Cancel
          </Button>
        ) : null,
    },
  ]

  return (
    <>
      <PageHeader
        title="Gift cards"
        subtitle="Cards bought, redeemed, and the value still waiting to be spent."
        actions={
          <Button size="sm" icon={RefreshCw} loading={cards.isFetching} onClick={() => cards.refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Sold" value={money(summary?.soldValue)} hint={`${count(summary?.sold ?? 0)} cards paid for`} icon={Gift} loading={cards.isLoading} />
        <Stat label="Redeemed" value={money(summary?.redeemedValue)} hint={`${count(summary?.redeemed ?? 0)} cards used`} tone="good" loading={cards.isLoading} />
        <Stat
          label="Outstanding"
          value={money(summary?.outstandingValue)}
          hint={`${count(summary?.outstanding ?? 0)} unused cards — held for their owners`}
          tone="warn"
          loading={cards.isLoading}
        />
        <Stat
          label="Redemption rate"
          value={summary?.sold ? `${Math.round((summary.redeemed / summary.sold) * 100)}%` : '—'}
          hint="Of cards paid for"
          loading={cards.isLoading}
        />
      </div>

      <Card
        bodyClassName="p-0"
        title={
          <Toolbar>
            <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="redeemed">Redeemed</option>
              <option value="pending_payment">Awaiting payment</option>
              <option value="expired">Expired</option>
              <option value="revoked">Cancelled</option>
            </Select>
          </Toolbar>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(c) => c.id}
          loading={cards.isLoading}
          error={cards.isError ? errorMessage(cards.error) : null}
          onRetry={() => cards.refetch()}
          empty={<Empty icon={Gift} title="No gift cards" message="Nothing matches this filter yet." />}
        />
      </Card>

      {target && (
        <RevokeModal
          card={target}
          onClose={() => setTarget(null)}
          onDone={() => {
            setTarget(null)
            void client.invalidateQueries({ queryKey: ['gift-cards'] })
          }}
        />
      )}
    </>
  )
}

function RevokeModal({ card, onClose, onDone }: { card: GiftCardRow; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [refund, setRefund] = useState(true)

  const revoke = useMutation({
    mutationFn: () => adminApi.revokeGiftCard(card.id, { reason: reason.trim(), refund }),
    onSuccess: () => {
      toast.success(refund ? 'Card cancelled and refunded to the buyer' : 'Card cancelled')
      onDone()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not cancel the card.')),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="Cancel this gift card?"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="danger" icon={Ban} loading={revoke.isPending} disabled={reason.trim().length < 3} onClick={() => revoke.mutate()}>
            Cancel card
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Detail label="Card">{`${text(card.design?.headline, 'Gift card')} · ${money(card.amount)}`}</Detail>
        <Detail label="Bought by">{text(card.purchaserEmail, card.purchaserId)}</Detail>
        <p className="text-[13px] text-ink-soft">
          The code stops working at once. This cannot be undone, and only works while the card is unused.
        </p>
        <Textarea label="Why" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Charge-back on the card payment, reported stolen code…" />
        <label className="flex items-center gap-2 text-[13.5px] text-ink">
          <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
          Put {money(card.amount)} back in the buyer’s wallet
        </label>
        {refund && card.paymentMethod !== 'wallet' && (
          <p className="text-[12px] text-warn">
            This card was paid by card. On a charge-back the money has already gone back to the payer — refunding the wallet too would pay them twice.
          </p>
        )}
      </div>
    </Modal>
  )
}

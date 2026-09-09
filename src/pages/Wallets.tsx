import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Banknote, RefreshCw, Wallet as WalletIcon } from 'lucide-react'
import { adminApi, errorMessage, type Withdrawal } from '../lib/api'
import { ago, count, money, shortId, text } from '../lib/format'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Detail,
  Empty,
  Input,
  Modal,
  PageHeader,
  Select,
  Stat,
  StatusBadge,
  Toolbar,
  type Column,
} from '../components/ui'

/**
 * Wallets and payouts.
 *
 * Three separate wallet systems exist — buyer, seller, rider — and nothing has
 * ever added them up. The total is a real liability: money the platform is
 * holding on somebody else's behalf. The payout queue below it is the part
 * that gets chased daily, so both live on one screen.
 */
export default function Wallets() {
  const queryClient = useQueryClient()
  const [system, setSystem] = useState('all')
  const [status, setStatus] = useState('pending')
  const [selected, setSelected] = useState<Withdrawal | null>(null)
  const [note, setNote] = useState('')
  const [pendingAction, setPendingAction] = useState('')

  const summary = useQuery({
    queryKey: ['wallet-summary'],
    queryFn: adminApi.walletSummary,
    staleTime: 60_000,
  })

  const withdrawals = useQuery({
    queryKey: ['withdrawals', system, status],
    queryFn: () => adminApi.withdrawals({ system, status, limit: 200 }),
    staleTime: 20_000,
  })

  const reconcile = useMutation({
    mutationFn: ({ w, next }: { w: Withdrawal; next: string }) =>
      adminApi.setWithdrawalStatus(w.system, w.id, next, note || undefined),
    onSuccess: (_d, variables) => {
      toast.success(`Marked ${variables.next}`)
      queryClient.invalidateQueries({ queryKey: ['withdrawals'] })
      queryClient.invalidateQueries({ queryKey: ['wallet-summary'] })
      setSelected(null)
      setNote('')
      setPendingAction('')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the payout.')),
  })

  const columns: Column<Withdrawal>[] = [
    {
      key: 'who',
      header: 'Account',
      render: (w) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{text(w.accountName, 'Unknown')}</p>
          <p className="truncate text-[11.5px] text-ink-faint">
            {text(w.bankName)} {w.accountMasked ? `· ${w.accountMasked}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'system',
      header: 'Type',
      render: (w) => <Badge tone={w.system === 'rider' ? 'info' : 'brand'}>{w.system}</Badge>,
    },
    { key: 'amount', header: 'Amount', align: 'right', render: (w) => <span className="font-semibold text-ink">{money(w.amount)}</span> },
    { key: 'status', header: 'Status', render: (w) => <StatusBadge status={w.status} /> },
    { key: 'ref', header: 'Reference', render: (w) => <span className="text-[12px]">{shortId(w.reference, 14)}</span> },
    { key: 'when', header: 'Requested', align: 'right', render: (w) => ago(w.initiatedAt) },
  ]

  const rows = withdrawals.data?.withdrawals ?? []
  const pendingTotal = rows.filter((w) => w.status === 'pending').reduce((s, w) => s + w.amount, 0)

  return (
    <>
      <PageHeader
        title="Wallets & payouts"
        subtitle="Money the platform is holding, and the queue of people waiting for it."
        actions={
          <Button
            size="sm"
            icon={RefreshCw}
            loading={summary.isFetching || withdrawals.isFetching}
            onClick={() => {
              summary.refetch()
              withdrawals.refetch()
            }}
          >
            Refresh
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Total float held"
          value={money(summary.data?.totalFloat)}
          hint="Across all three wallet systems"
          icon={WalletIcon}
          tone="info"
          loading={summary.isLoading}
        />
        {(summary.data?.systems ?? []).map((s) => (
          <Stat
            key={s.system}
            label={`${s.system} wallets`}
            value={money(s.availableBalance)}
            hint={`${count(s.wallets)} accounts${s.truncated ? ` (first ${count(summary.data?.cap)})` : ''}`}
            loading={summary.isLoading}
          />
        ))}
      </div>

      {/* Cash outstanding is the rider trust ladder's exposure: money riders
          are holding after fronting it at a restaurant counter. */}
      {(summary.data?.cashOutstanding ?? 0) > 0 && (
        <div className="mb-4 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3">
          <p className="text-[13px] font-bold text-warn">
            {money(summary.data?.cashOutstanding)} of rider cash outstanding
          </p>
          <p className="mt-0.5 text-[12.5px] text-ink-soft">
            Money riders have fronted at restaurants and not yet settled. This is the platform's live credit
            exposure.
          </p>
        </div>
      )}

      <Card
        bodyClassName="p-0"
        title={
          <Toolbar>
            <Select label="Wallet" value={system} onChange={(e) => setSystem(e.target.value)} className="w-40">
              <option value="all">All systems</option>
              <option value="rider">Rider</option>
              <option value="seller">Seller</option>
            </Select>
            <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="all">All</option>
            </Select>
            {pendingTotal > 0 && (
              <div className="pb-0.5">
                <Badge tone="warn">{money(pendingTotal)} awaiting payout</Badge>
              </div>
            )}
          </Toolbar>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(w) => `${w.system}-${w.id}`}
          loading={withdrawals.isLoading}
          error={withdrawals.isError ? errorMessage(withdrawals.error) : null}
          onRetry={() => withdrawals.refetch()}
          onRowClick={(w) => setSelected(w)}
          empty={
            <Empty
              icon={Banknote}
              title="No payouts here"
              message={status === 'pending' ? 'Nobody is waiting on a payout right now.' : 'Try another status.'}
            />
          }
        />
      </Card>

      <Modal
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null)
          setNote('')
        }}
        title="Payout"
        footer={
          selected && (
            <>
              <Button onClick={() => setSelected(null)}>Close</Button>
              <Button
                variant="danger"
                loading={reconcile.isPending && pendingAction === 'failed'}
                onClick={() => {
                  setPendingAction('failed')
                  reconcile.mutate({ w: selected, next: 'failed' })
                }}
              >
                Mark failed
              </Button>
              <Button
                variant="primary"
                loading={reconcile.isPending && pendingAction === 'completed'}
                onClick={() => {
                  setPendingAction('completed')
                  reconcile.mutate({ w: selected, next: 'completed' })
                }}
              >
                Mark completed
              </Button>
            </>
          )
        }
      >
        {selected && (
          <div className="space-y-4">
            <div>
              <Detail label="Amount">
                <span className="text-[15px] font-bold">{money(selected.amount)}</span>
              </Detail>
              <Detail label="System">{selected.system}</Detail>
              <Detail label="Status">
                <StatusBadge status={selected.status} />
              </Detail>
              <Detail label="Account name">{text(selected.accountName)}</Detail>
              <Detail label="Bank">{text(selected.bankName)}</Detail>
              <Detail label="Account">{text(selected.accountMasked)}</Detail>
              <Detail label="Reference">{text(selected.reference)}</Detail>
              <Detail label="User">{text(selected.userId)}</Detail>
              <Detail label="Requested">{ago(selected.initiatedAt)}</Detail>
              {selected.failureReason && <Detail label="Failure">{selected.failureReason}</Detail>}
            </div>

            {/* Stated plainly, because the obvious assumption is the dangerous
                one: this button does not move money. */}
            <div className="rounded-lg border border-line bg-raised px-3 py-2.5">
              <p className="text-[12px] leading-relaxed text-ink-soft">
                This only corrects the recorded status — it does not send or reverse any money. Use it when the
                bank transfer settled or failed outside the automated flow, after confirming in Paystack.
              </p>
            </div>

            <Input
              label="Note (recorded in the activity log)"
              placeholder="e.g. Confirmed settled in Paystack, ref 4471"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        )}
      </Modal>
    </>
  )
}

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Search, Wallet as WalletIcon } from 'lucide-react'
import { adminApi, errorMessage, type Row } from '../lib/api'
import { dateTime, money, shortId, text } from '../lib/format'
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
  Textarea,
  Toolbar,
  type Column,
} from '../components/ui'

const idOf = (row: Row) => String(row.id ?? row.uid ?? row.userId ?? '')

const newRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

/**
 * A customer's wallet, and corrections to it.
 *
 * A balance is never typed in. The admin states a credit or a debit and a
 * reason, reviews the balance it will leave, and confirms. The server refuses
 * the change if the balance moved since it was shown here, so a correction is
 * always made against the figure the admin actually saw. Every correction is
 * a ledger row on the customer's history and an entry in the audit list below.
 */
export default function CustomerWallets() {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const userId = params.get('user') || ''
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')

  const [direction, setDirection] = useState<'credit' | 'debit'>('credit')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [reviewing, setReviewing] = useState<{ requestId: string; expectedBalance: number } | null>(null)

  const permission = useQuery({ queryKey: ['wallet-adjust-permission'], queryFn: adminApi.walletAdjustPermission, staleTime: 300_000 })

  const results = useQuery({
    queryKey: ['wallet-customer-search', search],
    queryFn: () => adminApi.users({ q: search, role: 'buyer', limit: 20 }),
    enabled: search.length >= 2,
  })

  const wallet = useQuery({
    queryKey: ['customer-wallet', userId],
    queryFn: () => adminApi.customerWallet(userId),
    enabled: Boolean(userId),
  })

  const adjust = useMutation({
    mutationFn: () =>
      adminApi.adjustCustomerWallet(userId, {
        direction,
        amount: Number(amount),
        reason: reason.trim(),
        requestId: reviewing!.requestId,
        expectedBalance: reviewing!.expectedBalance,
      }),
    onSuccess: (r) => {
      toast.success(r.repeat ? 'Already applied' : `Balance is now ${money(r.newBalance)}`)
      setReviewing(null)
      setAmount('')
      setReason('')
      queryClient.invalidateQueries({ queryKey: ['customer-wallet', userId] })
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'The adjustment was not made.'))
      // A moved balance needs a fresh look, not a retry of the same review.
      setReviewing(null)
      queryClient.invalidateQueries({ queryKey: ['customer-wallet', userId] })
    },
  })

  const w = wallet.data
  const value = Number(amount)
  const amountValid = Number.isFinite(value) && value > 0 && Math.round(value * 100) === value * 100
  const after = w ? (direction === 'credit' ? w.balance + value : w.balance - value) : 0
  const canReview = Boolean(w) && amountValid && reason.trim().length >= 10 && after >= 0 && value <= (w?.maxAdjustment ?? 0)

  const resultColumns: Column<Row>[] = [
    {
      key: 'who',
      header: 'Customer',
      render: (u) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{text(`${text(u.firstName, '')} ${text(u.lastName, '')}`.trim(), 'Unnamed')}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{text(u.email)}</p>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (u) => text(u.phone) },
  ]

  return (
    <>
      <PageHeader
        title="Customer wallets"
        subtitle="Look up a customer's balance and ledger, and correct it with a recorded reason."
      />

      <Card
        className="mb-4"
        title={
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setSearch(q.trim())
            }}
          >
            <Toolbar>
              <Input label="Find a customer" placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />
              <div className="pb-0.5">
                <Button type="submit" size="sm" icon={Search}>Search</Button>
              </div>
            </Toolbar>
          </form>
        }
        bodyClassName={search ? 'p-0' : 'hidden'}
      >
        {search && (
          <DataTable
            columns={resultColumns}
            rows={results.data?.users ?? []}
            keyOf={(u, i) => idOf(u) || String(i)}
            loading={results.isLoading}
            error={results.isError ? errorMessage(results.error) : null}
            onRowClick={(u) => {
              setParams({ user: idOf(u) })
              setSearch('')
            }}
            empty={<Empty title="No customer matches" message="Try part of the email or the phone number." />}
          />
        )}
      </Card>

      {!userId && <Empty icon={WalletIcon} title="Choose a customer" message="Search above, or open a wallet from a funding alert." />}
      {wallet.isError && <p className="text-[13px] text-bad">{errorMessage(wallet.error)}</p>}

      {w && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Customer" value={text(w.name, 'Unnamed')} hint={text(w.email)} />
            <Stat label="Balance" value={money(w.balance)} hint={w.heldBalance ? `${money(w.heldBalance)} held` : 'Nothing held'} icon={WalletIcon} tone="info" />
            <Stat
              label="Ledger check"
              value={w.ledgerCheck.matches === null ? 'No record' : w.ledgerCheck.matches ? 'Matches' : 'Differs'}
              hint={w.ledgerCheck.lastRecordedBalance === null ? 'No ledger row records a balance' : `Last ledger balance ${money(w.ledgerCheck.lastRecordedBalance)}`}
              tone={w.ledgerCheck.matches === false ? 'bad' : 'good'}
            />
            <Stat label="Corrections" value={String(w.adjustments.length)} hint="Made by admins, all time" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
            <Card title="Ledger (latest 50)" bodyClassName="p-0">
              <DataTable
                columns={[
                  { key: 'when', header: 'When', render: (t) => dateTime(t.createdAt) },
                  { key: 'type', header: 'Type', render: (t) => t.type },
                  { key: 'status', header: 'Status', render: (t) => t.status },
                  { key: 'amount', header: 'Amount', align: 'right', render: (t) => <span className="font-semibold">{money(t.amount)}</span> },
                  { key: 'after', header: 'Balance after', align: 'right', render: (t) => (t.newBalance == null ? '—' : money(t.newBalance)) },
                  { key: 'ref', header: 'Reference', render: (t) => <span className="text-[12px]">{shortId(t.reference, 14)}</span> },
                ]}
                rows={w.transactions}
                keyOf={(t) => t.id}
                empty={<Empty title="No wallet history" />}
              />
            </Card>

            <Card title="Correct the balance">
              {permission.data && !permission.data.canAdjust ? (
                <p className="text-[12.5px] leading-relaxed text-ink-soft">
                  Your admin account cannot change balances. An account needs <code>adminPermissions: ["wallet_adjust"]</code> on
                  its users record, or its email in <code>WALLET_ADJUST_ADMIN_EMAILS</code> on the server.
                </p>
              ) : (
                <div className="space-y-3">
                  <Select label="Change" value={direction} onChange={(e) => setDirection(e.target.value as 'credit' | 'debit')}>
                    <option value="credit">Credit: add money</option>
                    <option value="debit">Debit: take money out</option>
                  </Select>
                  <Input label="Amount (₦)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <Textarea
                    label="Reason (kept on the customer's ledger)"
                    placeholder="e.g. Order BLB-1042 was charged twice; refunding the second charge"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  {amountValid && (
                    <p className={`text-[12.5px] ${after < 0 ? 'text-bad' : 'text-ink-soft'}`}>
                      {money(w.balance)} → {money(after)}
                      {after < 0 && '. A balance cannot go below zero.'}
                      {value > w.maxAdjustment && `. One correction can be at most ${money(w.maxAdjustment)}.`}
                    </p>
                  )}
                  <Button
                    variant="primary"
                    disabled={!canReview}
                    onClick={() => setReviewing({ requestId: newRequestId(), expectedBalance: w.balance })}
                  >
                    Review correction
                  </Button>
                </div>
              )}
            </Card>
          </div>

          <Card className="mt-4" title="Correction history" bodyClassName="p-0">
            <DataTable
              columns={[
                { key: 'when', header: 'When', render: (a) => dateTime(a.createdAt) },
                { key: 'dir', header: 'Change', render: (a) => <Badge tone={a.direction === 'credit' ? 'good' : 'warn'}>{a.direction} {money(a.amount)}</Badge> },
                { key: 'bal', header: 'Balance', render: (a) => `${money(a.previousBalance)} → ${money(a.newBalance)}` },
                { key: 'reason', header: 'Reason', render: (a) => <span className="text-[12.5px]">{a.reason}</span> },
                { key: 'by', header: 'By', render: (a) => text(a.adminEmail, a.adminUid) },
              ]}
              rows={w.adjustments}
              keyOf={(a) => a.id}
              empty={<Empty title="No corrections" message="No admin has changed this balance." />}
            />
          </Card>
        </>
      )}

      <Modal
        open={Boolean(reviewing)}
        onClose={() => setReviewing(null)}
        title="Confirm the correction"
        footer={
          <>
            <Button onClick={() => setReviewing(null)}>Back</Button>
            <Button variant={direction === 'debit' ? 'danger' : 'primary'} loading={adjust.isPending} onClick={() => adjust.mutate()}>
              {direction === 'credit' ? `Credit ${money(value)}` : `Debit ${money(value)}`}
            </Button>
          </>
        }
      >
        {w && reviewing && (
          <div className="space-y-3">
            <Detail label="Customer">{`${text(w.name, 'Unnamed')} · ${text(w.email)}`}</Detail>
            <Detail label="Balance now">{money(reviewing.expectedBalance)}</Detail>
            <Detail label={direction === 'credit' ? 'Add' : 'Take out'}>
              <span className="font-bold">{money(value)}</span>
            </Detail>
            <Detail label="Balance after">
              <span className="font-bold">{money(after)}</span>
            </Detail>
            <Detail label="Reason">{reason.trim()}</Detail>
            <p className="rounded-lg border border-line bg-raised px-3 py-2.5 text-[12px] leading-relaxed text-ink-soft">
              This moves real money in the customer's wallet and cannot be undone except by another correction. It is
              recorded on their ledger and in the audit list with your name. If the balance changes before you confirm,
              nothing is applied and you will be asked to look again.
            </p>
          </div>
        )}
      </Modal>
    </>
  )
}

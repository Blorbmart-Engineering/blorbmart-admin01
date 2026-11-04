import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { RefreshCw, ScanSearch, ShieldAlert } from 'lucide-react'
import { adminApi, errorMessage, type FundingAlert } from '../lib/api'
import { ago, dateTime, money, shortId, text } from '../lib/format'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Detail,
  Empty,
  Modal,
  PageHeader,
  Select,
  Textarea,
  Toolbar,
  type Column,
  type Tone,
} from '../components/ui'

const STATUS_TONE: Record<string, Tone> = { open: 'warn', cleared: 'good', suspicious: 'bad', escalated: 'info' }

const DECISIONS = [
  { value: 'cleared', label: 'Cleared', hint: 'Checked, and the top-up is genuine.' },
  { value: 'suspicious', label: 'Suspicious', hint: 'Looks wrong. Follow up on the account.' },
  { value: 'escalated', label: 'Escalated', hint: 'Needs someone else to look, for example the Paystack dispute team.' },
]

/**
 * Large and rapid wallet top-ups, for an admin to look at.
 *
 * An alert is a prompt, not a verdict. Nothing on this page blocks an account
 * or moves money: a decision is recorded with a note and kept. A balance that
 * genuinely needs correcting is corrected from Customer wallets, where the
 * change is audited on its own.
 */
export default function FundingAlerts() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('open')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [decision, setDecision] = useState('cleared')
  const [note, setNote] = useState('')

  const alerts = useQuery({
    queryKey: ['funding-alerts', status],
    queryFn: () => adminApi.fundingAlerts(status),
    staleTime: 20_000,
  })

  const detail = useQuery({
    queryKey: ['funding-alert', selectedId],
    queryFn: () => adminApi.fundingAlert(selectedId as string),
    enabled: Boolean(selectedId),
  })

  const review = useMutation({
    mutationFn: () => adminApi.reviewFundingAlert(selectedId as string, decision, note.trim()),
    onSuccess: () => {
      toast.success('Decision recorded')
      setNote('')
      queryClient.invalidateQueries({ queryKey: ['funding-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['funding-alert', selectedId] })
      queryClient.invalidateQueries({ queryKey: ['funding-alert-count'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not record the decision.')),
  })

  const scan = useMutation({
    mutationFn: () => adminApi.scanFundingAlerts(7),
    onSuccess: (r) => {
      toast.success(r.raised ? `${r.raised} new alert${r.raised === 1 ? '' : 's'} from ${r.checked} top-ups` : `Checked ${r.checked} top-ups. Nothing new.`)
      queryClient.invalidateQueries({ queryKey: ['funding-alerts'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not scan top-ups.')),
  })

  const columns: Column<FundingAlert>[] = [
    {
      key: 'who',
      header: 'Customer',
      render: (a) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{text(a.customer.name, 'Unnamed')}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{text(a.customer.email)}</p>
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Why',
      render: (a) => (
        <Badge tone={a.kind === 'large_funding' ? 'warn' : 'info'}>
          {a.kind === 'large_funding' ? 'Large top-up' : `${a.dayCount} top-ups in a day`}
        </Badge>
      ),
    },
    { key: 'amount', header: 'Amount', align: 'right', render: (a) => <span className="font-semibold text-ink">{money(a.amount)}</span> },
    { key: 'channel', header: 'Channel', render: (a) => (a.channel === 'bank_transfer' ? 'Bank transfer' : a.channel === 'card' ? 'Card' : text(a.channel)) },
    { key: 'ref', header: 'Reference', render: (a) => <span className="text-[12px]">{shortId(a.reference, 16)}</span> },
    { key: 'risk', header: 'Account signs', render: (a) => (a.customer.riskReasons?.length ? <Badge tone="bad">{a.customer.riskReasons.length}</Badge> : '—') },
    { key: 'status', header: 'Status', render: (a) => <Badge tone={STATUS_TONE[a.status] ?? 'neutral'}>{a.status}</Badge> },
    { key: 'when', header: 'Funded', align: 'right', render: (a) => ago(a.fundedAt ?? a.createdAt) },
  ]

  const rows = alerts.data?.alerts ?? []
  const limits = alerts.data?.thresholds
  const d = detail.data

  return (
    <>
      <PageHeader
        title="Funding alerts"
        subtitle={
          limits
            ? `Top-ups above ${money(limits.single)}, or more than ${money(limits.daily)} in a day. A prompt to check, not proof of fraud.`
            : 'Large and rapid wallet top-ups, for review.'
        }
        actions={
          <>
            <Button size="sm" icon={ScanSearch} loading={scan.isPending} onClick={() => scan.mutate()}>
              Scan last 7 days
            </Button>
            <Button size="sm" icon={RefreshCw} loading={alerts.isFetching} onClick={() => alerts.refetch()}>
              Refresh
            </Button>
          </>
        }
      />

      <Card
        bodyClassName="p-0"
        title={
          <Toolbar>
            <Select label="Show" value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
              <option value="open">Awaiting review</option>
              <option value="reviewed">Reviewed</option>
              <option value="suspicious">Suspicious</option>
              <option value="escalated">Escalated</option>
              <option value="cleared">Cleared</option>
              <option value="all">All</option>
            </Select>
          </Toolbar>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(a) => a.id}
          loading={alerts.isLoading}
          error={alerts.isError ? errorMessage(alerts.error) : null}
          onRetry={() => alerts.refetch()}
          onRowClick={(a) => {
            setSelectedId(a.id)
            setDecision('cleared')
            setNote('')
          }}
          empty={<Empty icon={ShieldAlert} title="Nothing here" message={status === 'open' ? 'No top-up is waiting on a review.' : 'Try another filter.'} />}
        />
      </Card>

      <Modal
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title="Funding alert"
        wide
        footer={
          <>
            <Button onClick={() => setSelectedId(null)}>Close</Button>
            <Button variant="primary" loading={review.isPending} disabled={note.trim().length < 5} onClick={() => review.mutate()}>
              Record decision
            </Button>
          </>
        }
      >
        {detail.isLoading && <p className="text-[13px] text-ink-soft">Loading…</p>}
        {detail.isError && <p className="text-[13px] text-bad">{errorMessage(detail.error)}</p>}
        {d && (
          <div className="space-y-5">
            <div className="grid gap-x-6 sm:grid-cols-2">
              <div>
                <Detail label="Amount"><span className="text-[15px] font-bold">{money(d.alert.amount)}</span></Detail>
                <Detail label="Reason">{d.alert.reasons.join('; ')}</Detail>
                <Detail label="Reference">{text(d.alert.reference)}</Detail>
                <Detail label="Channel">{d.alert.channel === 'bank_transfer' ? 'Bank transfer' : text(d.alert.channel)}</Detail>
                <Detail label="Verified">
                  {d.alert.verification.paystackVerified ? <Badge tone="good">Paystack confirmed before credit</Badge> : <Badge tone="warn">Not confirmed</Badge>}
                </Detail>
                <Detail label="Funded">{dateTime(d.alert.fundedAt)}</Detail>
                <Detail label="Status"><Badge tone={STATUS_TONE[d.alert.status] ?? 'neutral'}>{d.alert.status}</Badge></Detail>
              </div>
              <div>
                <Detail label="Customer">{text(d.alert.customer.name, 'Unnamed')}</Detail>
                <Detail label="Email">{text(d.alert.customer.email)}</Detail>
                <Detail label="Phone">{text(d.alert.customer.phone)}</Detail>
                <Detail label="Account opened">{dateTime(d.alert.customer.accountCreatedAt)}</Detail>
                <Detail label="Wallet now">{money(d.wallet.balance)}</Detail>
                <Detail label="Day so far">{`${d.alert.dayCount} top-ups, ${money(d.alert.dayTotal)}`}</Detail>
                <Detail label="Wallet">
                  <Link className="font-semibold text-brand" to={`/customer-wallets?user=${encodeURIComponent(d.alert.userId)}`}>
                    Open customer wallet
                  </Link>
                </Detail>
              </div>
            </div>

            {(d.alert.customer.riskReasons?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-bad/30 bg-bad-soft px-3 py-2.5">
                <p className="text-[12.5px] font-bold text-bad">Signs of throwaway account details</p>
                <ul className="mt-1 list-disc pl-5 text-[12.5px] text-ink-soft">
                  {d.alert.customer.riskReasons?.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
            )}

            {d.otherAlerts.length > 0 && (
              <p className="text-[12.5px] text-ink-soft">
                This customer has {d.otherAlerts.length} other alert{d.otherAlerts.length === 1 ? '' : 's'}:{' '}
                {d.otherAlerts.map((o) => `${money(o.amount)} (${o.status})`).join(', ')}.
              </p>
            )}

            <div>
              <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-faint">Recent ledger</p>
              <div className="max-h-56 overflow-auto rounded-lg border border-line">
                <table className="w-full text-[12.5px]">
                  <tbody>
                    {d.transactions.map((t) => (
                      <tr key={t.id} className="border-b border-line last:border-0">
                        <td className="px-3 py-1.5 text-ink-soft">{dateTime(t.createdAt)}</td>
                        <td className="px-3 py-1.5">{t.type}</td>
                        <td className="px-3 py-1.5">{t.status}</td>
                        <td className="px-3 py-1.5 text-right font-semibold">{money(t.amount)}</td>
                        <td className="px-3 py-1.5 text-ink-faint">{shortId(t.reference, 14)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {d.reviews.length > 0 && (
              <div>
                <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-ink-faint">Decisions so far</p>
                <ul className="space-y-1.5 text-[12.5px]">
                  {d.reviews.map((r) => (
                    <li key={r.id}>
                      <Badge tone={STATUS_TONE[r.decision] ?? 'neutral'}>{r.decision}</Badge>{' '}
                      <span className="text-ink-soft">{text(r.adminEmail, r.adminUid)} · {dateTime(r.createdAt)}</span>
                      <p className="mt-0.5 text-ink">{r.note}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-3 rounded-lg border border-line bg-raised px-3 py-3">
              <p className="text-[12px] leading-relaxed text-ink-soft">
                Recording a decision changes nothing on the customer's account or wallet. It is kept, with your name,
                on this alert's history.
              </p>
              <Select label="Decision" value={decision} onChange={(e) => setDecision(e.target.value)}>
                {DECISIONS.map((o) => (
                  <option key={o.value} value={o.value}>{`${o.label}: ${o.hint}`}</option>
                ))}
              </Select>
              <Textarea
                label="What you checked"
                placeholder="e.g. Card holder name matches the account; customer confirmed on WhatsApp"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

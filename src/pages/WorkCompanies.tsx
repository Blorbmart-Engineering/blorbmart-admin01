import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Briefcase } from 'lucide-react'
import { adminApi, errorMessage, type WorkCompanyDetail, type WorkCompanyRow } from '../lib/api'
import { Badge, Button, Card, DataTable, Detail, Empty, Input, Modal, PageHeader, Select, Textarea, type Tone } from '../components/ui'

/**
 * Blorbmart for Work: companies paying for their staff's meals.
 *
 * Approve applications (with the plan and seat price), suspend or close a
 * company, correct a meal budget, and mark an invoice paid when the money
 * came by bank transfer straight to our account. Every action is audited by
 * the backend.
 */

const naira = (n: number) => `₦${Math.round(Number(n) || 0).toLocaleString('en-NG')}`
const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
const STATUS_TONE: Record<string, Tone> = { pending: 'warn', active: 'good', suspended: 'bad', closed: 'neutral', rejected: 'bad' }
const monthKey = () => {
  const d = new Date(Date.now() + 3600_000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function WorkCompanies() {
  const [status, setStatus] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const list = useQuery({ queryKey: ['work-companies', status], queryFn: () => adminApi.workCompanies(status) })
  const month = monthKey()

  const rows = list.data ?? []
  const pending = rows.filter((r) => r.status === 'pending').length
  const fees = rows.reduce((sum, r) => sum + (r.feesPaid || 0), 0)
  const budgets = rows.reduce((sum, r) => sum + (r.balance || 0), 0)

  return (
    <>
      <PageHeader
        title="Work companies"
        subtitle="Blorbmart for Work — organisations that pay for their staff's meals."
        actions={
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Waiting for approval</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="closed">Closed</option>
            <option value="rejected">Rejected</option>
          </Select>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card title="Waiting for approval"><p className="text-2xl font-semibold text-ink">{pending}</p></Card>
        <Card title="Seat fees collected (all time)"><p className="text-2xl font-semibold text-ink">{naira(fees)}</p></Card>
        <Card title="Meal budgets held" subtitle="Company money, owed to vendors and riders as staff eat."><p className="text-2xl font-semibold text-ink">{naira(budgets)}</p></Card>
      </div>
      <Card>
        <DataTable<WorkCompanyRow>
          loading={list.isLoading}
          error={list.isError ? errorMessage(list.error) : null}
          onRetry={() => list.refetch()}
          rows={rows}
          keyOf={(r) => r.id}
          onRowClick={(r) => setOpenId(r.id)}
          empty={<Empty icon={Briefcase} title="No companies yet" message="Organisations apply from Blorbmart for Work in the shop." />}
          columns={[
            { key: 'name', header: 'Company', render: (r) => <span><span className="block font-semibold text-ink">{r.name}</span><span className="text-[11.5px] text-ink-faint">{r.kind} · {r.campusName}</span></span> },
            { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status] || 'neutral'}>{r.status}</Badge> },
            { key: 'plan', header: 'Plan', render: (r) => `${r.planLabel} · ${naira(r.seatFee)}/seat` },
            { key: 'staff', header: 'Staff / paid seats', align: 'right', render: (r) => `${r.activeMembers} / ${r.seats?.[month] || 0}` },
            { key: 'balance', header: 'Budget', align: 'right', render: (r) => naira(r.balance) },
            { key: 'fees', header: 'Fees paid', align: 'right', render: (r) => naira(r.feesPaid) },
          ]}
        />
      </Card>
      {openId && <CompanyModal id={openId} onClose={() => setOpenId(null)} />}
    </>
  )
}

function CompanyModal({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const detail = useQuery({ queryKey: ['work-company', id], queryFn: () => adminApi.workCompany(id) })
  const [reason, setReason] = useState('')
  const [plan, setPlan] = useState<string>('')
  const [seatFee, setSeatFee] = useState<string>('')
  const [adjust, setAdjust] = useState({ amount: '', reason: '', reference: '' })
  const [transfer, setTransfer] = useState<{ invoiceId: string; bankReference: string; note: string } | null>(null)

  const refresh = (data?: WorkCompanyDetail) => {
    if (data) queryClient.setQueryData(['work-company', id], data)
    queryClient.invalidateQueries({ queryKey: ['work-company', id] })
    queryClient.invalidateQueries({ queryKey: ['work-companies'] })
  }

  const act = useMutation({
    mutationFn: (action: string) => adminApi.workCompanyStatus(id, {
      action,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      ...(plan ? { plan } : {}),
      ...(seatFee !== '' ? { seatFee: seatFee === 'plan' ? null : Number(seatFee) } : {}),
    }),
    onSuccess: (data, action) => { toast.success(`Done: ${action}`); setReason(''); refresh(data) },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const doAdjust = useMutation({
    mutationFn: () => adminApi.workCompanyAdjust(id, { amount: Number(adjust.amount), reason: adjust.reason, ...(adjust.reference ? { reference: adjust.reference } : {}) }),
    onSuccess: (r) => { toast.success(`Budget now ${naira(r.balance)}`); setAdjust({ amount: '', reason: '', reference: '' }); refresh() },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const doTransfer = useMutation({
    mutationFn: () => adminApi.workInvoiceTransfer(id, transfer!.invoiceId, { bankReference: transfer!.bankReference, note: transfer!.note }),
    onSuccess: (data) => { toast.success('Invoice marked paid'); setTransfer(null); refresh(data) },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const d = detail.data
  const c = d?.company

  return (
    <Modal open onClose={onClose} title={c?.name || 'Company'} wide>
      {!d || !c ? (
        <p className="text-[13px] text-ink-faint">{detail.isError ? errorMessage(detail.error) : 'Loading…'}</p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Detail label="Status"><Badge tone={STATUS_TONE[c.status] || 'neutral'}>{c.status}</Badge>{c.suspendReason ? ` ${c.suspendReason}` : ''}{c.rejectReason ? ` ${c.rejectReason}` : ''}</Detail>
            <Detail label="Campus">{c.campusName}</Detail>
            <Detail label="Kind">{c.kind}</Detail>
            <Detail label="Contact">{c.contactName} · {c.contactPhone} · {c.contactEmail}</Detail>
            <Detail label="Estimated staff">{c.staffEstimate ?? '—'}</Detail>
            <Detail label="Applied">{when(c.createdAt)}</Detail>
            <Detail label="Plan">{c.planLabel} · {naira(c.seatFee)} per seat</Detail>
            <Detail label="Staff on plan">{c.activeMembers}</Detail>
            <Detail label="Meal budget">{naira(d.balance)}</Detail>
            <Detail label="Fees paid">{naira(c.feesPaid)}</Detail>
            <Detail label="Budget funded">{naira(c.budgetFunded)}</Detail>
            <Detail label="Team">{c.team.map((t) => `${t.name || t.email} (${t.role})`).join(', ')}</Detail>
          </div>
          {c.notes && <p className="rounded-lg bg-raised p-3 text-[13px] text-ink-soft">{c.notes}</p>}

          <Card title="Status and price">
            <div className="grid gap-3 sm:grid-cols-3">
              <Select label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
                <option value="">Keep {c.planLabel}</option>
                {d.plans.map((p) => <option key={p.id} value={p.id}>{p.label} — up to {p.maxSeats} staff, {p.maxOffices} office(s), {naira(p.seatFee)}/seat</option>)}
              </Select>
              <Input label="Seat fee (₦, blank = keep, 'plan' = plan price)" value={seatFee} onChange={(e) => setSeatFee(e.target.value.trim())} placeholder={String(c.seatFee)} />
              <Input label="Reason (needed to reject, suspend, close)" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {c.status === 'pending' && <Button variant="primary" loading={act.isPending} onClick={() => act.mutate('approve')}>Approve</Button>}
              {c.status === 'pending' && <Button variant="danger" loading={act.isPending} onClick={() => act.mutate('reject')}>Reject</Button>}
              {c.status === 'active' && <Button variant="danger" loading={act.isPending} onClick={() => act.mutate('suspend')}>Suspend</Button>}
              {c.status === 'suspended' && <Button variant="primary" loading={act.isPending} onClick={() => act.mutate('reactivate')}>Reactivate</Button>}
              {['active', 'suspended'].includes(c.status) && <Button variant="danger" loading={act.isPending} onClick={() => { if (window.confirm(`Close ${c.name}? All staff are taken off. Pay any remaining budget back with a correction below.`)) act.mutate('close') }}>Close</Button>}
              <Button loading={act.isPending} disabled={!plan && seatFee === ''} onClick={() => act.mutate('plan')}>Save plan / price</Button>
            </div>
          </Card>

          <Card title="Correct the meal budget" subtitle="Positive adds, negative takes away. Use for transfers outside an invoice, or paying a closing company back.">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Amount (₦)" value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value.replace(/[^\d.-]/g, '') })} />
              <Input label="Reason" value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} />
              <Input label="Bank / reference (optional, once only)" value={adjust.reference} onChange={(e) => setAdjust({ ...adjust, reference: e.target.value })} />
            </div>
            <div className="mt-3"><Button loading={doAdjust.isPending} disabled={!Number(adjust.amount) || adjust.reason.trim().length < 5} onClick={() => { if (window.confirm(`Change ${c.name}'s budget by ${naira(Number(adjust.amount))}?`)) doAdjust.mutate() }}>Apply correction</Button></div>
          </Card>

          <Card title={`Invoices (${d.invoices.length})`}>
            {d.invoices.length === 0 ? <p className="text-[13px] text-ink-faint">None yet.</p> : (
              <div className="space-y-2">
                {d.invoices.map((inv) => (
                  <div key={inv.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2.5 text-[13px]">
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-ink">{inv.kind === 'topup' ? 'Top-up' : inv.kind === 'seats' ? `+${inv.addSeats} seats` : `${inv.month} · ${inv.seats} seats`}</span>
                      <span className="block text-[11.5px] text-ink-faint">{naira(inv.total)} (fees {naira(inv.feeAmount)}, meals {naira(inv.budgetAmount)}) · {inv.reference} · {when(inv.createdAt)}{inv.paidVia ? ` · paid by ${inv.paidVia} ${when(inv.paidAt)}` : ''}</span>
                    </span>
                    {inv.needsReview && <Badge tone="bad">Payment mismatch</Badge>}
                    <Badge tone={inv.status === 'paid' ? 'good' : inv.status === 'unpaid' ? 'warn' : 'neutral'}>{inv.status}</Badge>
                    {inv.status !== 'paid' && <Button size="sm" onClick={() => setTransfer({ invoiceId: inv.id, bankReference: '', note: '' })}>Mark paid by transfer</Button>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title={`Staff (${d.members.length})`}>
            {d.members.length === 0 ? <p className="text-[13px] text-ink-faint">No staff yet.</p> : (
              <div className="grid gap-1 text-[13px] sm:grid-cols-2">
                {d.members.map((m) => <div key={m.uid} className="truncate">{m.name || m.email || m.phone} · {naira(m.dailyLimit)}/day · {m.deliveryMode}{m.status !== 'active' ? ` · ${m.status}` : ''}</div>)}
              </div>
            )}
          </Card>

          <Card title="Recent budget movements">
            {d.ledger.length === 0 ? <p className="text-[13px] text-ink-faint">None yet.</p> : (
              <div className="space-y-1 text-[12.5px]">
                {d.ledger.map((e) => (
                  <div key={e.id} className="flex gap-2">
                    <span className="w-36 shrink-0 text-ink-faint">{when(e.at)}</span>
                    <span className="w-24 shrink-0">{e.type}</span>
                    <span className={`w-28 shrink-0 text-right font-semibold ${e.amount < 0 ? 'text-bad' : 'text-good'}`}>{naira(e.amount)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-soft">{[e.staffName, e.orderId, e.note].filter(Boolean).join(' · ')}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {transfer && (
            <Card title="Mark invoice paid by bank transfer" subtitle="Only after the money is in Blorbmart's account. A bank reference can be used once.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Bank reference from the statement" value={transfer.bankReference} onChange={(e) => setTransfer({ ...transfer, bankReference: e.target.value })} />
                <Textarea label="Note (optional)" rows={1} value={transfer.note} onChange={(e) => setTransfer({ ...transfer, note: e.target.value })} />
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" loading={doTransfer.isPending} disabled={transfer.bankReference.trim().length < 4} onClick={() => doTransfer.mutate()}>Confirm payment</Button>
                <Button onClick={() => setTransfer(null)}>Cancel</Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </Modal>
  )
}

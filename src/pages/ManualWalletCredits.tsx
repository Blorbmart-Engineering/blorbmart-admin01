import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Search, Upload, CheckCircle } from 'lucide-react'
import { adminApi, errorMessage, type Row } from '../lib/api'
import { money, dateTime, text } from '../lib/format'
import { Badge, Button, Card, DataTable, Empty, Input, PageHeader, Select, Textarea, Toolbar, type Column } from '../components/ui'

const idOf = (row: Row) => String(row.id ?? row.uid ?? '')
const actionKey = () => `manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

function fileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the proof file.'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })
}

export default function ManualWalletCredits() {
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [owner, setOwner] = useState<Row | null>(null)
  const [ownerType, setOwnerType] = useState<'buyer' | 'vendor' | 'rider'>('buyer')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [proof, setProof] = useState<File | null>(null)
  const [proofMeta, setProofMeta] = useState<Row | null>(null)

  const results = useQuery({ queryKey: ['manual-credit-owner-search', search], queryFn: () => adminApi.users({ q: search, limit: 20 }), enabled: search.length >= 2 })
  const pending = useQuery({ queryKey: ['manual-wallet-credits'], queryFn: () => adminApi.manualWalletCredits(), staleTime: 10_000 })
  const upload = useMutation({ mutationFn: async () => { if (!proof) throw new Error('Choose an image or PDF proof first.'); return adminApi.uploadManualCreditProof({ base64: await fileAsBase64(proof), mimeType: proof.type, fileName: proof.name }) }, onSuccess: (r) => { setProofMeta(r); toast.success('Proof uploaded privately.') }, onError: (e) => toast.error(errorMessage(e, 'Proof upload failed.')) })
  const submit = useMutation({ mutationFn: () => adminApi.submitManualWalletCredit({ walletOwnerId: idOf(owner!), ownerType, amountKobo: Math.round(Number(amount) * 100), method, receivedAt, reference, reason, note, proof: proofMeta, actionKey: actionKey() }), onSuccess: (r) => { toast.success(r.status === 'approved' ? 'Wallet credited.' : 'Submitted for second-admin approval.'); queryClient.invalidateQueries({ queryKey: ['manual-wallet-credits'] }); setOwner(null); setProof(null); setProofMeta(null); setAmount(''); setReference(''); setReason(''); setNote('') }, onError: (e) => toast.error(errorMessage(e, 'The credit was not submitted.')) })
  const approve = useMutation({ mutationFn: (id: string) => adminApi.approveManualWalletCredit(id), onSuccess: () => { toast.success('Credit approved.'); queryClient.invalidateQueries({ queryKey: ['manual-wallet-credits'] }) }, onError: (e) => toast.error(errorMessage(e)) })
  const reverse = useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => adminApi.reverseManualWalletCredit(id, reason), onSuccess: () => { toast.success('Credit reversed with a ledger debit.'); queryClient.invalidateQueries({ queryKey: ['manual-wallet-credits'] }) }, onError: (e) => toast.error(errorMessage(e)) })
  const valid = owner && Number(amount) > 0 && Number.isFinite(Number(amount)) && reference.trim() && reason.trim().length >= 10 && proofMeta
  const columns: Column<Row>[] = [
    { key: 'owner', header: 'Wallet owner', render: (r) => <><span className="font-semibold">{text(r.ownerName, r.walletOwnerId)}</span><span className="ml-2 text-[11px] text-ink-faint">{r.ownerType}</span></> },
    { key: 'amount', header: 'Amount', align: 'right', render: (r) => money(Number(r.amountKobo || 0) / 100) },
    { key: 'method', header: 'Method', render: (r) => r.method },
    { key: 'reference', header: 'Reference', render: (r) => r.reference },
    { key: 'when', header: 'Recorded', render: (r) => dateTime(r.createdAt) },
    { key: 'action', header: '', render: (r) => r.status === 'pending_approval' ? <Button size="sm" icon={CheckCircle} onClick={() => approve.mutate(idOf(r))}>Approve</Button> : r.status === 'approved' ? <Button size="sm" variant="danger" onClick={() => { const reason = window.prompt('Reason for reversal (at least 10 characters):') || ''; if (reason.trim().length >= 10) reverse.mutate({ id: idOf(r), reason }); else toast.error('A reversal reason of at least 10 characters is required.') }}>Reverse</Button> : <Badge tone="bad">{r.status}</Badge> },
  ]

  return <>
    <PageHeader title="Physical wallet credits" subtitle="Record cash, bank transfer, or POS money with private proof. Large credits wait for a second admin." />
    <Card className="mb-4" title="Find wallet owner">
      <form onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()) }}><Toolbar><Input label="Name, email, phone or id" value={q} onChange={(e) => setQ(e.target.value)} className="w-80" /><Button type="submit" size="sm" icon={Search}>Search</Button></Toolbar></form>
      {search && <DataTable columns={[{ key: 'who', header: 'Account', render: (r) => <><span className="font-semibold">{text(`${r.firstName || ''} ${r.lastName || ''}`.trim(), r.id)}</span><span className="ml-2 text-ink-faint">{r.role} · {text(r.email, r.phone)}</span></> }]} rows={(results.data?.users || []).filter((r) => ['buyer', 'vendor', 'rider'].includes(String(r.role)))} keyOf={idOf} loading={results.isLoading} error={results.isError ? errorMessage(results.error) : null} onRowClick={(r) => { setOwner(r); setOwnerType(r.role === 'vendor' ? 'vendor' : r.role === 'rider' ? 'rider' : 'buyer'); setSearch('') }} empty={<Empty title="No wallet owner found" />} />}
    </Card>
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <Card title="Manual credits (pending and completed)" bodyClassName="p-0"><DataTable columns={columns} rows={pending.data || []} keyOf={idOf} loading={pending.isLoading} error={pending.isError ? errorMessage(pending.error) : null} empty={<Empty title="No manual credits" />} /></Card>
      <Card title="Record money received">
        {!owner ? <p className="text-[13px] text-ink-soft">Choose a wallet owner first.</p> : <div className="space-y-3">
          <p className="text-[13px] font-semibold">{text(`${owner.firstName || ''} ${owner.lastName || ''}`.trim(), idOf(owner))} <Badge>{ownerType}</Badge></p>
          <Input label="Amount (₦)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="pos">POS</option></Select>
          <Input label="Date received" type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
          <Input label="Reference / receipt number" value={reference} onChange={(e) => setReference(e.target.value)} />
          <Textarea label="Reason (at least 10 characters)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Textarea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          <Input label="Proof (JPG, PNG, WEBP or PDF; max 5 MB)" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => { setProof(e.target.files?.[0] || null); setProofMeta(null) }} />
          <Button variant="outline" icon={Upload} loading={upload.isPending} disabled={!proof} onClick={() => upload.mutate()}>Upload private proof</Button>
          {proofMeta && <p className="text-[12px] text-good">Proof ready: {proofMeta.fileName}</p>}
          <Button variant="primary" disabled={!valid} loading={submit.isPending} onClick={() => submit.mutate()}>Submit wallet credit</Button>
        </div>}
      </Card>
    </div>
  </>
}

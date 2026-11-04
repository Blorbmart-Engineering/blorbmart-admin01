import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { MessageCircle, RefreshCw, Store } from 'lucide-react'
import { adminApi, errorMessage, type ReadinessRow } from '../lib/api'
import { ago, dateTime, text } from '../lib/format'
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
  Stat,
  Textarea,
  Toolbar,
  type Column,
} from '../components/ui'

/** A WhatsApp link to the vendor, with the message already typed. Opens, never sends. */
const whatsApp = (phone: string | null, text: string) => {
  const digits = String(phone || '').replace(/\D/g, '')
  const number = digits.startsWith('234') ? digits : digits.startsWith('0') ? `234${digits.slice(1)}` : digits
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}

const nudgeText = (row: ReadinessRow) =>
  `Hello from Blorbmart! ${row.name} is ${row.score}% set up. To start getting orders, please: ` +
  row.missing.map((m) => m.label.toLowerCase()).join('; ') +
  '. Reply here if you need a hand.'

/**
 * Every store, unready first: what it is missing, how to reach the vendor,
 * and a record of who already did. For the business development team.
 *
 * Messages are opened in WhatsApp for an admin to send themselves, one at a
 * time. Nothing here messages a vendor on its own.
 */
export default function VendorReadiness() {
  const queryClient = useQueryClient()
  const [show, setShow] = useState('incomplete')
  const [selected, setSelected] = useState<ReadinessRow | null>(null)
  const [channel, setChannel] = useState('whatsapp')
  const [note, setNote] = useState('')

  const data = useQuery({ queryKey: ['vendor-readiness'], queryFn: () => adminApi.vendorReadiness(false), staleTime: 60_000 })
  const contacts = useQuery({
    queryKey: ['vendor-contacts', selected?.storeId],
    queryFn: () => adminApi.vendorContacts(selected!.storeId),
    enabled: Boolean(selected),
  })

  const refresh = useMutation({
    mutationFn: () => adminApi.vendorReadiness(true),
    onSuccess: (d) => queryClient.setQueryData(['vendor-readiness'], d),
    onError: (error) => toast.error(errorMessage(error)),
  })

  const record = useMutation({
    mutationFn: () => adminApi.recordVendorContact(selected!.storeId, channel, note.trim()),
    onSuccess: () => {
      toast.success('Recorded')
      setNote('')
      queryClient.invalidateQueries({ queryKey: ['vendor-contacts', selected?.storeId] })
      queryClient.invalidateQueries({ queryKey: ['vendor-readiness'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not record that.')),
  })

  const rows = (data.data?.stores ?? []).filter((r) => (show === 'all' ? true : show === 'ready' ? r.ready : !r.ready))

  const columns: Column<ReadinessRow>[] = [
    {
      key: 'name',
      header: 'Store',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{r.name}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{text(r.campus)}</p>
        </div>
      ),
    },
    { key: 'ready', header: 'Orders', render: (r) => <Badge tone={r.ready ? 'good' : 'warn'}>{r.ready ? 'Ready' : 'Not ready'}</Badge> },
    {
      key: 'score',
      header: 'Complete',
      align: 'right',
      render: (r) => <span className={r.score < 60 ? 'font-semibold text-bad' : 'font-semibold'}>{`${r.score}%`}</span>,
    },
    { key: 'menu', header: 'Menu', align: 'right', render: (r) => `${r.products.available} / ${r.products.total}` },
    {
      key: 'missing',
      header: 'Still to do',
      render: (r) => (
        <span className="text-[12px] text-ink-soft">
          {r.missing.length ? r.missing.slice(0, 3).map((m) => m.label).join(' · ') + (r.missing.length > 3 ? ` +${r.missing.length - 3}` : '') : 'Nothing'}
        </span>
      ),
    },
    { key: 'contact', header: 'Last contacted', align: 'right', render: (r) => (r.lastContactAt ? ago(r.lastContactAt) : 'Never') },
  ]

  return (
    <>
      <PageHeader
        title="Vendor readiness"
        subtitle="Which stores can take orders, what the rest are missing, and who has chased them."
        actions={
          <Button size="sm" icon={RefreshCw} loading={refresh.isPending} onClick={() => refresh.mutate()}>
            Recheck now
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Stores" value={String(data.data?.total ?? 0)} icon={Store} loading={data.isLoading} />
        <Stat label="Ready for orders" value={String(data.data?.ready ?? 0)} tone="good" loading={data.isLoading} />
        <Stat
          label="Not ready"
          value={String((data.data?.total ?? 0) - (data.data?.ready ?? 0))}
          tone="warn"
          loading={data.isLoading}
        />
      </div>

      <Card
        bodyClassName="p-0"
        title={
          <Toolbar>
            <Select label="Show" value={show} onChange={(e) => setShow(e.target.value)} className="w-44">
              <option value="incomplete">Not ready</option>
              <option value="ready">Ready</option>
              <option value="all">All</option>
            </Select>
            {data.data && (
              <p className="pb-1 text-[12px] text-ink-faint">{`Checked ${ago(data.data.generatedAt)}`}</p>
            )}
          </Toolbar>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(r) => r.storeId}
          loading={data.isLoading}
          error={data.isError ? errorMessage(data.error) : null}
          onRetry={() => data.refetch()}
          onRowClick={(r) => setSelected(r)}
          empty={<Empty icon={Store} title="No stores here" />}
        />
      </Card>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.name ?? ''} wide>
        {selected && (
          <div className="space-y-4">
            <div className="grid gap-x-6 sm:grid-cols-2">
              <div>
                <Detail label="Orders">{selected.ready ? 'Ready' : 'Not ready'}</Detail>
                <Detail label="Complete">{`${selected.score}%`}</Detail>
                <Detail label="Menu">{`${selected.products.available} orderable of ${selected.products.total}, ${selected.products.withImages} with photos`}</Detail>
              </div>
              <div>
                <Detail label="Phone">{text(selected.phone)}</Detail>
                <Detail label="Email">{text(selected.email)}</Detail>
                <Detail label="Joined">{dateTime(selected.createdAt)}</Detail>
              </div>
            </div>

            {selected.missing.length > 0 && (
              <div>
                <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-ink-faint">Still to do</p>
                <ul className="space-y-1 text-[13px]">
                  {selected.missing.map((m) => (
                    <li key={m.key}>
                      {m.label} {m.blocking && <Badge tone="bad">blocks orders</Badge>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selected.phone && selected.missing.length > 0 && (
              <a
                className="inline-flex items-center gap-2 text-[13px] font-semibold text-brand"
                href={whatsApp(selected.phone, nudgeText(selected))}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={16} aria-hidden /> Open a WhatsApp message to this vendor
              </a>
            )}

            <div className="space-y-2 rounded-lg border border-line bg-raised px-3 py-3">
              <p className="text-[12px] font-bold uppercase tracking-wide text-ink-faint">Record a contact</p>
              <Select label="How" value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="whatsapp">WhatsApp</option>
                <option value="call">Call</option>
                <option value="email">Email</option>
                <option value="visit">Visit</option>
                <option value="other">Other</option>
              </Select>
              <Textarea label="What was said" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              <Button size="sm" variant="primary" loading={record.isPending} disabled={note.trim().length < 3} onClick={() => record.mutate()}>
                Save
              </Button>
            </div>

            <div>
              <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-ink-faint">History</p>
              {(contacts.data ?? []).length === 0 && <p className="text-[13px] text-ink-soft">Nobody has recorded a contact yet.</p>}
              <ul className="space-y-1.5 text-[13px]">
                {(contacts.data ?? []).map((c) => (
                  <li key={c.id}>
                    <span className="font-semibold">{c.channel}</span> · {dateTime(c.createdAt)} — {c.note}
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

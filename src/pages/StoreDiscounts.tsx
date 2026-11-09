import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Pencil, Plus, Store, Trash2 } from 'lucide-react'
import {
  errorMessage,
  storeDiscountsApi,
  type StoreDiscount,
  type StoreDiscountInput,
  type StoreDiscountKind,
} from '../lib/api'
import { dateTime, money } from '../lib/format'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Empty,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
  Toolbar,
  type Column,
} from '../components/ui'

/**
 * Store discounts: money off at one store, with no code. The customer sees a
 * badge on the store and the discount at checkout.
 *
 * Who pays is chosen per discount. "Blorbmart pays" leaves the vendor's
 * settlement untouched. "The store pays" takes the discount off what that
 * store is settled for each order. Delivery discounts are always paid by
 * Blorbmart: the rider is still paid on the full fee.
 */

const KIND_LABEL: Record<StoreDiscountKind, string> = {
  percent: 'Percent off food',
  fixed: 'Naira off food',
  delivery: 'Off delivery',
}

const STATUS_TONE = { live: 'good', scheduled: 'info', ended: 'neutral', paused: 'warn' } as const

interface Form {
  storeId: string
  kind: StoreDiscountKind
  value: string
  maxDiscount: string
  minSubtotal: string
  fundedBy: 'platform' | 'store'
  startsAt: string
  endsAt: string
  note: string
}

const EMPTY: Form = {
  storeId: '',
  kind: 'delivery',
  value: '300',
  maxDiscount: '',
  minSubtotal: '',
  fundedBy: 'platform',
  startsAt: '',
  endsAt: '',
  note: '',
}

/** An ISO time as the value a datetime-local input wants, in the browser's zone. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const num = (v: string) => (v.trim() === '' ? null : Number(v))

export default function StoreDiscounts() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<StoreDiscount | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Form>(EMPTY)
  const [storeSearch, setStoreSearch] = useState('')

  const list = useQuery({ queryKey: ['store-discounts'], queryFn: storeDiscountsApi.list })
  const stores = useQuery({ queryKey: ['store-discount-stores'], queryFn: storeDiscountsApi.stores, staleTime: 5 * 60_000, enabled: open })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['store-discounts'] })

  const matchingStores = useMemo(() => {
    const q = storeSearch.trim().toLowerCase()
    const all = stores.data ?? []
    const hits = q ? all.filter((s) => `${s.name} ${s.universityName}`.toLowerCase().includes(q)) : all
    // The chosen store stays in the list whatever the search says.
    const chosen = all.find((s) => s.id === form.storeId)
    return chosen && !hits.includes(chosen) ? [chosen, ...hits] : hits
  }, [stores.data, storeSearch, form.storeId])

  const startNew = () => {
    setEditing(null)
    setForm(EMPTY)
    setStoreSearch('')
    setOpen(true)
  }

  const startEdit = (d: StoreDiscount) => {
    setEditing(d)
    setForm({
      storeId: d.storeId,
      kind: d.kind,
      value: d.value == null ? '' : String(d.value),
      maxDiscount: d.maxDiscount == null ? '' : String(d.maxDiscount),
      minSubtotal: d.minSubtotal == null ? '' : String(d.minSubtotal),
      fundedBy: d.fundedBy,
      startsAt: toLocalInput(d.startsAt),
      endsAt: toLocalInput(d.endsAt),
      note: d.note || '',
    })
    setStoreSearch('')
    setOpen(true)
  }

  const body = (): StoreDiscountInput => ({
    storeId: form.storeId,
    kind: form.kind,
    value: num(form.value),
    maxDiscount: form.kind === 'percent' ? num(form.maxDiscount) : null,
    minSubtotal: num(form.minSubtotal),
    fundedBy: form.kind === 'delivery' ? 'platform' : form.fundedBy,
    startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    note: form.note.trim(),
  })

  const save = useMutation({
    mutationFn: () => (editing ? storeDiscountsApi.update(editing.id, body()) : storeDiscountsApi.create({ ...body(), active: true })),
    onSuccess: (d) => {
      toast.success(editing ? 'Discount updated' : `${d.label} is set up at ${d.storeName}`)
      setOpen(false)
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the discount.')),
  })

  const toggle = useMutation({
    mutationFn: (d: StoreDiscount) => storeDiscountsApi.update(d.id, { active: !d.active }),
    onSuccess: (d) => {
      toast.success(d.active ? 'Discount switched on' : 'Discount paused')
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the discount.')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => storeDiscountsApi.remove(id),
    onSuccess: () => {
      toast.success('Discount deleted')
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete the discount.')),
  })

  const columns: Column<StoreDiscount>[] = [
    {
      key: 'store',
      header: 'Store',
      render: (d) => <span className="font-semibold text-ink">{d.storeName || d.storeId}</span>,
    },
    { key: 'label', header: 'Discount', render: (d) => d.label },
    {
      key: 'funded',
      header: 'Paid by',
      render: (d) => <Badge tone={d.fundedBy === 'store' ? 'warn' : 'neutral'}>{d.fundedBy === 'store' ? 'The store' : 'Blorbmart'}</Badge>,
    },
    {
      key: 'when',
      header: 'Runs',
      render: (d) => (
        <span className="text-[12.5px] text-ink-soft">
          {d.startsAt ? dateTime(d.startsAt) : 'Now'} → {d.endsAt ? dateTime(d.endsAt) : 'until stopped'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'State',
      render: (d) => (
        <Badge tone={STATUS_TONE[d.status]} dot>
          {d.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (d) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" icon={Pencil} aria-label={`Edit the discount at ${d.storeName}`} onClick={() => startEdit(d)}>
            {''}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => toggle.mutate(d)}>
            {d.active ? 'Pause' : 'Switch on'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            aria-label={`Delete the discount at ${d.storeName}`}
            onClick={() => {
              if (confirm(`Delete "${d.label}" at ${d.storeName}? Orders already paid keep their discount.`)) remove.mutate(d.id)
            }}
          >
            {''}
          </Button>
        </div>
      ),
    },
  ]

  const valueLabel = form.kind === 'percent' ? 'Percent off' : form.kind === 'fixed' ? 'Naira off (₦)' : 'Naira off delivery (₦)'
  const canSave =
    Boolean(form.storeId) && (form.kind === 'delivery' || Number(form.value) > 0) && !(form.kind === 'percent' && Number(form.value) > 100)

  return (
    <>
      <PageHeader
        title="Store discounts"
        subtitle="Money off at one store, with no code. Customers see it on the store and at checkout."
        actions={
          <Button size="sm" variant="primary" icon={Plus} onClick={startNew}>
            New discount
          </Button>
        }
      />

      <Card bodyClassName="p-0">
        <DataTable
          columns={columns}
          rows={list.data ?? []}
          keyOf={(d) => d.id}
          loading={list.isLoading}
          error={list.isError ? errorMessage(list.error) : null}
          onRetry={() => list.refetch()}
          empty={
            <Empty
              icon={Store}
              title="No store discounts"
              message="Give a store money off food or delivery, for as long as you choose."
              action={
                <Button size="sm" variant="primary" icon={Plus} onClick={startNew}>
                  New discount
                </Button>
              }
            />
          }
        />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit discount · ${editing.storeName}` : 'New store discount'}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={save.isPending} disabled={!canSave} onClick={() => save.mutate()}>
              {editing ? 'Save' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Input
              label="Store"
              placeholder={stores.isLoading ? 'Loading stores…' : 'Search by store or campus'}
              value={storeSearch}
              onChange={(e) => setStoreSearch(e.target.value)}
            />
            <Select
              aria-label="Choose the store"
              value={form.storeId}
              onChange={(e) => setForm({ ...form, storeId: e.target.value })}
            >
              <option value="">{stores.isError ? 'Could not load stores' : 'Choose a store'}</option>
              {matchingStores.slice(0, 200).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.universityName ? ` · ${s.universityName}` : ''}
                  {s.closed ? ' (closed by admin)' : ''}
                </option>
              ))}
            </Select>
          </div>

          <Toolbar className="gap-3">
            <Select
              label="Kind"
              value={form.kind}
              onChange={(e) => {
                const kind = e.target.value as StoreDiscountKind
                setForm({ ...form, kind, value: kind === 'delivery' ? '300' : '', fundedBy: kind === 'delivery' ? 'platform' : form.fundedBy })
              }}
              className="w-48"
            >
              {(Object.keys(KIND_LABEL) as StoreDiscountKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
            <Input
              label={valueLabel}
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={form.kind === 'delivery' ? 'Empty = free delivery' : ''}
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              className="w-48"
            />
          </Toolbar>

          {form.kind === 'delivery' ? (
            <p className="text-[12.5px] text-ink-muted">
              {form.value ? `${money(Number(form.value))} off` : 'The whole'} delivery fee, never more than the fee. Blorbmart pays it; the
              rider is still paid on the full fee.
            </p>
          ) : (
            <Select
              label="Who pays for it"
              value={form.fundedBy}
              onChange={(e) => setForm({ ...form, fundedBy: e.target.value as 'platform' | 'store' })}
            >
              <option value="platform">Blorbmart pays (the store still gets full menu price)</option>
              <option value="store">The store pays (taken off what the store is settled)</option>
            </Select>
          )}

          <Toolbar className="gap-3">
            <Input
              label="Minimum food spend (₦)"
              type="number"
              min={0}
              placeholder="None"
              value={form.minSubtotal}
              onChange={(e) => setForm({ ...form, minSubtotal: e.target.value })}
              className="w-48"
            />
            {form.kind === 'percent' && (
              <Input
                label="Most it can take off (₦)"
                type="number"
                min={0}
                placeholder="No cap"
                value={form.maxDiscount}
                onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                className="w-48"
              />
            )}
          </Toolbar>

          <Toolbar className="gap-3">
            <Input
              label="Starts (empty = now)"
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              className="w-56"
            />
            <Input
              label="Ends (empty = until paused)"
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              className="w-56"
            />
          </Toolbar>

          <Textarea
            label="Note for the team (optional)"
            rows={2}
            maxLength={200}
            placeholder="Why this discount, who agreed it"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />

          <p className="text-[12.5px] text-ink-muted">
            A store gets its single best food discount and the best delivery discount on each order, on top of any promo code the
            customer enters. It never takes the food or delivery below zero.
          </p>
        </div>
      </Modal>
    </>
  )
}

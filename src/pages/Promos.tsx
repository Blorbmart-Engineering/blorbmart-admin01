import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { BadgePercent, Plus, Trash2 } from 'lucide-react'
import { adminApi, errorMessage, type Row } from '../lib/api'
import { count, dateOnly, money, text } from '../lib/format'
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
  Toolbar,
  type Column,
} from '../components/ui'

/**
 * The server normalizes `percentage` to `percent` on write, but codes created
 * before it did that are still stored under the old spelling. Both read as a
 * percentage here so the table does not start rendering "10%" as "₦10".
 */
const isPercent = (type: unknown) => {
  const raw = String(type ?? '').toLowerCase()
  return raw !== 'fixed' && raw !== 'flat' && raw !== 'amount'
}

/** The list endpoint returns either an array or `{promos: [...]}` depending on age. */
const asRows = (data: unknown): Row[] => {
  if (Array.isArray(data)) return data as Row[]
  const wrapped = (data as { promos?: Row[]; codes?: Row[] })?.promos ?? (data as { codes?: Row[] })?.codes
  return Array.isArray(wrapped) ? wrapped : []
}

export default function Promos() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    code: '',
    type: 'percent',
    value: '',
    minSubtotal: '',
    maxDiscount: '',
    usageLimit: '',
    expiresAt: '',
  })

  const promos = useQuery({ queryKey: ['promos'], queryFn: adminApi.promos, staleTime: 60_000 })

  const create = useMutation({
    mutationFn: () =>
      adminApi.createPromo({
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: Number(form.value) || 0,
        minSubtotal: Number(form.minSubtotal) || 0,
        maxDiscount: Number(form.maxDiscount) || 0,
        usageLimit: Number(form.usageLimit) || 0,
        expiresAt: form.expiresAt || null,
        isActive: true,
      }),
    onSuccess: () => {
      toast.success('Promo code created')
      queryClient.invalidateQueries({ queryKey: ['promos'] })
      setOpen(false)
      setForm({ code: '', type: 'percent', value: '', minSubtotal: '', maxDiscount: '', usageLimit: '', expiresAt: '' })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not create the code.')),
  })

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminApi.updatePromo(id, { isActive }),
    onSuccess: () => {
      toast.success('Updated')
      queryClient.invalidateQueries({ queryKey: ['promos'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the code.')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deletePromo(id),
    onSuccess: () => {
      toast.success('Deleted')
      queryClient.invalidateQueries({ queryKey: ['promos'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete the code.')),
  })

  const columns: Column<Row>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (p) => <span className="font-bold tracking-wide text-ink">{text(p.code)}</span>,
    },
    {
      key: 'value',
      header: 'Discount',
      render: (p) =>
        isPercent(p.type) ? `${text(p.value, '0')}%` : money(p.value),
    },
    { key: 'min', header: 'Min spend', align: 'right', render: (p) => money(p.minSubtotal) },
    {
      key: 'used',
      header: 'Used',
      align: 'right',
      render: (p) => `${count(p.usageCount ?? p.timesUsed ?? 0)}${Number(p.usageLimit) > 0 ? ` / ${count(p.usageLimit)}` : ''}`,
    },
    { key: 'expires', header: 'Expires', render: (p) => (p.expiresAt ? dateOnly(p.expiresAt) : 'Never') },
    {
      key: 'state',
      header: 'State',
      render: (p) => (
        <Badge tone={p.isActive === false ? 'neutral' : 'good'} dot>
          {p.isActive === false ? 'Off' : 'Live'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => toggle.mutate({ id: String(p.id), isActive: p.isActive === false })}
          >
            {p.isActive === false ? 'Enable' : 'Disable'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            aria-label={`Delete ${text(p.code)}`}
            onClick={() => {
              if (confirm(`Delete promo code ${text(p.code)}? This cannot be undone.`)) {
                remove.mutate(String(p.id))
              }
            }}
          >
            {''}
          </Button>
        </div>
      ),
    },
  ]

  const rows = asRows(promos.data)

  return (
    <>
      <PageHeader
        title="Promo codes"
        subtitle="Discounts buyers can apply at checkout."
        actions={
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setOpen(true)}>
            New code
          </Button>
        }
      />

      <Card bodyClassName="p-0">
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(p, i) => String(p.id ?? i)}
          loading={promos.isLoading}
          error={promos.isError ? errorMessage(promos.error) : null}
          onRetry={() => promos.refetch()}
          empty={
            <Empty
              icon={BadgePercent}
              title="No promo codes"
              message="Create one to start running a discount."
              action={
                <Button size="sm" variant="primary" icon={Plus} onClick={() => setOpen(true)}>
                  New code
                </Button>
              }
            />
          }
        />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New promo code"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={create.isPending}
              disabled={!form.code.trim() || !form.value}
              onClick={() => create.mutate()}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Input
            label="Code"
            placeholder="WELCOME10"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          />
          <Toolbar className="gap-3">
            <Select
              label="Type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-40"
            >
              <option value="percent">Percentage</option>
              <option value="fixed">Fixed amount</option>
            </Select>
            <Input
              label={form.type === 'percent' ? 'Percent off' : 'Amount off (₦)'}
              type="number"
              inputMode="numeric"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              className="w-40"
            />
          </Toolbar>
          <Toolbar className="gap-3">
            <Input
              label="Minimum spend (₦)"
              type="number"
              value={form.minSubtotal}
              onChange={(e) => setForm({ ...form, minSubtotal: e.target.value })}
              className="w-44"
            />
            {/* Only meaningful for percentage codes: it is the cap that stops
                "20% off" costing an unbounded amount on a large order. */}
            {form.type === 'percent' && (
              <Input
                label="Max discount (₦)"
                type="number"
                value={form.maxDiscount}
                onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                className="w-44"
              />
            )}
          </Toolbar>
          <Toolbar className="gap-3">
            <Input
              label="Usage limit (0 = unlimited)"
              type="number"
              value={form.usageLimit}
              onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
              className="w-52"
            />
            <Input
              label="Expires"
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              className="w-44"
            />
          </Toolbar>
        </div>
      </Modal>
    </>
  )
}

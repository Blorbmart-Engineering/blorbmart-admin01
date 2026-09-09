import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Percent, Plus, Trash2 } from 'lucide-react'
import { adminApi, errorMessage, type Row } from '../lib/api'
import { text } from '../lib/format'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Empty,
  Input,
  Modal,
  PageHeader,
  type Column,
} from '../components/ui'

const asRows = (data: unknown): Row[] => {
  if (Array.isArray(data)) return data as Row[]
  const wrapped = (data as { commissions?: Row[] })?.commissions
  return Array.isArray(wrapped) ? wrapped : []
}

const rowId = (c: Row) => String(c.categoryId ?? c.id ?? '')
const percentOf = (c: Row) => String(c.commissionPercent ?? '')

/**
 * Commission rates.
 *
 * The percentage the platform keeps from a seller on every order in a
 * category. Seller settlement reads these directly, so a number changed here
 * changes what the next vendor is paid — this is live money configuration, not
 * a reporting screen.
 *
 * The resolution order behind it is worth knowing, because it is what makes
 * the "Inactive" state confusing enough to spell out on screen. Settlement
 * takes the category rate only when a row exists AND is active; otherwise it
 * falls through to the vendor's own negotiated rate, and only then to the
 * platform default. So switching a category off does not waive commission —
 * it hands the decision to the vendor record. An admin who reads "Inactive"
 * as "0%" would be giving away margin and never see it in this table.
 */
export default function Commissions() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [percent, setPercent] = useState('')
  const [edits, setEdits] = useState<Record<string, string>>({})

  const commissions = useQuery({
    queryKey: ['category-commissions'],
    queryFn: adminApi.categoryCommissions,
    staleTime: 60_000,
  })

  const clearEdit = (id: string) =>
    setEdits((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })

  const create = useMutation({
    mutationFn: () =>
      adminApi.createCategoryCommission({
        categoryId: categoryId.trim(),
        categoryName: categoryName.trim(),
        commissionPercent: Number(percent) || 0,
        active: true,
      }),
    onSuccess: () => {
      toast.success('Category added')
      queryClient.invalidateQueries({ queryKey: ['category-commissions'] })
      setOpen(false)
      setCategoryId('')
      setCategoryName('')
      setPercent('')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not add that category.')),
  })

  const update = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string
      body: { categoryName?: string; commissionPercent?: number; active?: boolean }
    }) => adminApi.updateCategoryCommission(id, body),
    onSuccess: (_d, v) => {
      toast.success('Rate updated')
      queryClient.invalidateQueries({ queryKey: ['category-commissions'] })
      clearEdit(v.id)
    },
    onError: (error, v) => {
      toast.error(errorMessage(error, 'Could not update that rate.'))
      clearEdit(v.id)
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteCategoryCommission(id),
    onSuccess: () => {
      toast.success('Category removed')
      queryClient.invalidateQueries({ queryKey: ['category-commissions'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not remove that category.')),
  })

  const columns: Column<Row>[] = [
    {
      key: 'category',
      header: 'Category',
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{text(c.categoryName)}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{rowId(c)}</p>
        </div>
      ),
    },
    {
      key: 'percent',
      header: 'Commission',
      align: 'right',
      render: (c) => {
        const id = rowId(c)
        const current = edits[id]
        const shown = current ?? percentOf(c)
        const parsed = Number(shown)
        const valid = shown !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
        const dirty = current !== undefined && current !== percentOf(c)

        return (
          <div className="flex items-center justify-end gap-2">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                value={shown}
                onChange={(e) => setEdits({ ...edits, [id]: e.target.value })}
                className="h-8 w-20 rounded-md border border-line bg-raised px-2 text-right text-[13px] tabular text-ink outline-none focus:border-brand"
                aria-label={`Commission percent for ${text(c.categoryName)}`}
              />
              <span className="text-[13px] text-ink-faint">%</span>
            </div>
            {dirty && (
              <Button
                size="sm"
                variant="primary"
                loading={update.isPending}
                disabled={!valid}
                onClick={() => update.mutate({ id, body: { commissionPercent: parsed } })}
              >
                Save
              </Button>
            )}
          </div>
        )
      },
    },
    {
      key: 'state',
      header: 'State',
      render: (c) => (
        <Badge tone={c.active === false ? 'neutral' : 'good'} dot>
          {c.active === false ? 'Not applied' : 'Applied'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => update.mutate({ id: rowId(c), body: { active: c.active === false } })}
          >
            {c.active === false ? 'Apply' : 'Stop applying'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            aria-label={`Remove ${text(c.categoryName)}`}
            onClick={() => {
              if (
                confirm(
                  `Remove the "${text(c.categoryName)}" rate?\n\n` +
                    'Orders in this category will fall back to each vendor’s own rate, ' +
                    'or the platform default where they have none. This does not set ' +
                    'commission to zero.',
                )
              ) {
                remove.mutate(rowId(c))
              }
            }}
          >
            {''}
          </Button>
        </div>
      ),
    },
  ]

  const rows = asRows(commissions.data)
  const newPercent = Number(percent)
  const newPercentValid =
    percent !== '' && Number.isFinite(newPercent) && newPercent >= 0 && newPercent <= 100

  return (
    <>
      <PageHeader
        title="Commission rates"
        subtitle="What the platform keeps from a seller on each order, by category."
        actions={
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setOpen(true)}>
            Add category
          </Button>
        }
      />

      <Card className="mb-4">
        <p className="text-[12.5px] leading-relaxed text-ink-soft">
          Seller settlement uses a category rate only while it is{' '}
          <span className="font-semibold text-ink">Applied</span>. A category that is not
          applied — or has no row here at all — falls back to the vendor&apos;s own
          negotiated rate, and to the platform default where they have none.{' '}
          <span className="font-semibold text-ink">
            Stopping a rate does not make commission zero.
          </span>
        </p>
      </Card>

      <Card bodyClassName="p-0">
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(c, i) => rowId(c) || String(i)}
          loading={commissions.isLoading}
          error={commissions.isError ? errorMessage(commissions.error) : null}
          onRetry={() => commissions.refetch()}
          empty={
            <Empty
              icon={Percent}
              title="No category rates"
              message="Add a category to charge a rate other than the vendor or platform default."
              action={
                <Button size="sm" variant="primary" icon={Plus} onClick={() => setOpen(true)}>
                  Add category
                </Button>
              }
            />
          }
        />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add category rate"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={create.isPending}
              disabled={!categoryId.trim() || !categoryName.trim() || !newPercentValid}
              onClick={() => create.mutate()}
            >
              Add category
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Input
            label="Category id"
            placeholder="e.g. food_drinks"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          />
          <Input
            label="Display name"
            placeholder="e.g. Food & Drinks"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
          />
          <Input
            label="Commission (%)"
            type="number"
            inputMode="decimal"
            placeholder="10"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
          {percent !== '' && !newPercentValid && (
            <p className="text-[12px] font-semibold text-bad">
              Commission must be between 0 and 100.
            </p>
          )}
          <p className="text-[12px] leading-relaxed text-ink-faint">
            The id must match what products carry, not the display name — settlement looks
            the rate up by id, so a mismatch silently leaves orders on the vendor or
            platform rate. Re-using an existing id overwrites that category&apos;s rate.
          </p>
        </div>
      </Modal>
    </>
  )
}

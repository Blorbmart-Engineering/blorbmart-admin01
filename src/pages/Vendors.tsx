import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Building2, Download, Search } from 'lucide-react'
import { adminApi, errorMessage, type Row } from '../lib/api'
import { ago, money, text, titleCase } from '../lib/format'
import {
  Button,
  Card,
  DataTable,
  Detail,
  Empty,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Toolbar,
  type Column,
} from '../components/ui'

/**
 * Vendors, and the approval queue that gates a storefront going live.
 *
 * Deletion is offered but kept visually quiet and behind a typed confirmation:
 * it removes a business and everything attached to it, and unlike a suspension
 * there is nothing to undo afterwards.
 */
export default function Vendors() {
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()

  const status = params.get('status') ?? 'all'
  const q = params.get('q') ?? ''
  const [search, setSearch] = useState(q)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Row | null>(null)
  const [reason, setReason] = useState('')
  const [confirmDelete, setConfirmDelete] = useState('')

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (!value || value === 'all') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
    setPage(1)
  }

  const vendors = useQuery({
    queryKey: ['vendors', status, q, page],
    queryFn: () => adminApi.vendors({ status, q, page, limit: 50 }),
    staleTime: 30_000,
  })

  const idOf = (v: Row) => String(v.id ?? v.userId ?? v.vendorId ?? '')

  const setStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      adminApi.setVendorStatus(id, next, reason || undefined),
    onSuccess: (_d, v) => {
      toast.success(`Vendor ${v.next}`)
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
      setSelected(null)
      setReason('')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the vendor.')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteVendor(id),
    onSuccess: () => {
      toast.success('Vendor deleted')
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      setSelected(null)
      setConfirmDelete('')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete the vendor.')),
  })

  const columns: Column<Row>[] = [
    {
      key: 'vendor',
      header: 'Business',
      render: (v) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{text(v.businessName ?? v.storeName, 'Unnamed')}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{text(v.businessEmail ?? v.email)}</p>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (v) => <span className="tabular">{text(v.businessPhone ?? v.phone)}</span> },
    { key: 'campus', header: 'Campus', render: (v) => text(v.universityName ?? v.universityId, 'Not set') },
    { key: 'status', header: 'Status', render: (v) => <StatusBadge status={v.vendorStatus ?? v.status} /> },
    { key: 'sales', header: 'Sales', align: 'right', render: (v) => money(v.totalSales) },
    { key: 'joined', header: 'Joined', align: 'right', render: (v) => ago(v.createdAt) },
  ]

  const rows = vendors.data?.vendors ?? []
  const pagination = vendors.data?.pagination

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle="Businesses selling on Blorbmart."
        actions={
          <Button
            size="sm"
            icon={Download}
            onClick={() =>
              adminApi
                .exportCsv('vendors', { status, q, limit: 5000 })
                .then(() => toast.success('Export downloaded'))
                .catch((e) => toast.error(errorMessage(e, 'Export failed.')))
            }
          >
            Export CSV
          </Button>
        }
      />

      <Card
        bodyClassName="p-0"
        title={
          <Toolbar>
            <Select label="Status" value={status} onChange={(e) => setParam('status', e.target.value)} className="w-44">
              <option value="all">All statuses</option>
              <option value="pending">Pending approval</option>
              <option value="verified">Verified</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="rejected">Rejected</option>
            </Select>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setParam('q', search.trim())
              }}
              className="flex items-end gap-2"
            >
              <Input
                label="Search"
                placeholder="Business, email, phone"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-56"
              />
              <Button type="submit" icon={Search}>
                Find
              </Button>
            </form>
          </Toolbar>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(v, i) => idOf(v) || String(i)}
          loading={vendors.isLoading}
          error={vendors.isError ? errorMessage(vendors.error) : null}
          onRetry={() => vendors.refetch()}
          onRowClick={(v) => setSelected(v)}
          empty={
            <Empty
              icon={Building2}
              title="No vendors"
              message={status === 'pending' ? 'Nothing is waiting for approval.' : 'Nothing matches these filters.'}
            />
          }
        />

        {(pagination?.hasMore || page > 1) && (
          <div className="flex items-center justify-between border-t border-line-soft px-4 py-3">
            <Button size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <span className="text-[12.5px] text-ink-faint">Page {page}</span>
            <Button size="sm" disabled={!pagination?.hasMore} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null)
          setReason('')
          setConfirmDelete('')
        }}
        title={selected ? text(selected.businessName, 'Vendor') : 'Vendor'}
        wide
        footer={
          selected && (
            <>
              <Button onClick={() => setSelected(null)}>Close</Button>
              <Button
                variant="danger"
                loading={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: idOf(selected), next: 'suspended' })}
              >
                Suspend
              </Button>
              <Button
                variant="primary"
                loading={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: idOf(selected), next: 'verified' })}
              >
                Approve
              </Button>
            </>
          )
        }
      >
        {selected && (
          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Business</h3>
                <Detail label="Name">{text(selected.businessName)}</Detail>
                <Detail label="Email">{text(selected.businessEmail)}</Detail>
                <Detail label="Phone">{text(selected.businessPhone)}</Detail>
                <Detail label="Address">{text(selected.address)}</Detail>
                <Detail label="Campus">{text(selected.universityName ?? selected.universityId, 'Not set')}</Detail>
                <Detail label="Status">
                  <StatusBadge status={selected.vendorStatus ?? selected.status} />
                </Detail>
              </div>
              <div>
                <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Trading</h3>
                <Detail label="Total sales">{money(selected.totalSales)}</Detail>
                <Detail label="Wallet balance">{money(selected.walletBalance)}</Detail>
                <Detail label="Rating">{text(selected.rating, '0')}</Detail>
                <Detail label="KYC">{titleCase(text(selected.kycStatus, 'pending'))}</Detail>
                <Detail label="Joined">{ago(selected.createdAt)}</Detail>
                <Detail label="Vendor id">{idOf(selected)}</Detail>
              </div>
            </div>

            <Input
              label="Reason (recorded in the activity log)"
              placeholder="e.g. Documents verified"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />

            {/* Deliberately last, quiet, and gated on typing the name. There is
                no undo for this and it takes the storefront with it. */}
            <details className="rounded-lg border border-bad/30 bg-bad-soft/40 px-3 py-2.5">
              <summary className="cursor-pointer text-[12.5px] font-semibold text-bad">
                Delete this vendor permanently
              </summary>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
                This removes the business and its storefront. It cannot be undone. Type the business name to
                confirm.
              </p>
              <div className="mt-2.5 flex items-end gap-2">
                <Input
                  placeholder={text(selected.businessName)}
                  value={confirmDelete}
                  onChange={(e) => setConfirmDelete(e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="danger"
                  loading={remove.isPending}
                  disabled={confirmDelete.trim() !== text(selected.businessName)}
                  onClick={() => remove.mutate(idOf(selected))}
                >
                  Delete
                </Button>
              </div>
            </details>
          </div>
        )}
      </Modal>
    </>
  )
}

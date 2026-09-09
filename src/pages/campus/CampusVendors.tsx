import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Building2, RefreshCw } from 'lucide-react'
import { campusApi, errorMessage, type CampusVendor } from '../../lib/api'
import { dateOnly, text } from '../../lib/format'
import {
  Button,
  Card,
  DataTable,
  Detail,
  Empty,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  Toolbar,
  type Column,
} from '../../components/ui'

/**
 * Vendors on this campus, and the approval queue.
 *
 * Approving a vendor is what lets a business start taking money on the
 * platform, so it is confirmed in a dialog that shows what is being approved
 * rather than fired from a row button. Rejection asks for a reason, because
 * the vendor is emailed it and "your application was not approved." with no
 * explanation generates a support conversation every time.
 */
export default function CampusVendors() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('all')
  const [decision, setDecision] = useState<{ vendor: CampusVendor; next: 'active' | 'rejected' | 'suspended' } | null>(
    null,
  )

  const vendors = useQuery({
    queryKey: ['campus-vendors', status],
    queryFn: () => campusApi.vendors({ status }),
    staleTime: 30_000,
  })

  const columns: Column<CampusVendor>[] = [
    {
      key: 'business',
      header: 'Business',
      render: (v) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{text(v.businessName)}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{text(v.businessEmail)}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (v) => <StatusBadge status={v.status} /> },
    {
      key: 'phone',
      header: 'Phone',
      render: (v) => <span className="text-[12.5px] text-ink-soft">{text(v.businessPhone)}</span>,
    },
    {
      key: 'joined',
      header: 'Applied',
      align: 'right',
      render: (v) => <span className="text-[12px] text-ink-faint">{v.createdAt ? dateOnly(v.createdAt) : '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (v) => {
        const approved = ['active', 'verified', 'approved'].includes(String(v.status).toLowerCase())
        return (
          <div className="flex justify-end gap-1.5">
            {!approved && (
              <Button size="sm" variant="primary" onClick={() => setDecision({ vendor: v, next: 'active' })}>
                Approve
              </Button>
            )}
            {approved ? (
              <Button size="sm" variant="ghost" onClick={() => setDecision({ vendor: v, next: 'suspended' })}>
                Suspend
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setDecision({ vendor: v, next: 'rejected' })}>
                Reject
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle="Businesses selling on your campus."
        actions={
          <Toolbar>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
              <option value="all">All statuses</option>
              <option value="pending">Waiting for approval</option>
              <option value="active">Approved</option>
              <option value="suspended">Suspended</option>
              <option value="rejected">Rejected</option>
            </Select>
            <Button size="sm" icon={RefreshCw} loading={vendors.isFetching} onClick={() => vendors.refetch()}>
              Refresh
            </Button>
          </Toolbar>
        }
      />

      <Card bodyClassName="p-0">
        <DataTable
          columns={columns}
          rows={vendors.data?.vendors ?? []}
          keyOf={(v) => v.id}
          loading={vendors.isLoading}
          error={vendors.isError ? errorMessage(vendors.error) : null}
          onRetry={() => vendors.refetch()}
          empty={
            <Empty
              icon={Building2}
              title="No vendors"
              message={
                status === 'pending'
                  ? 'Nothing is waiting for approval.'
                  : 'No businesses are tagged to your campus yet.'
              }
            />
          }
        />
      </Card>

      {decision && (
        <DecisionDialog
          vendor={decision.vendor}
          next={decision.next}
          onClose={() => setDecision(null)}
          onDone={() => {
            queryClient.invalidateQueries({ queryKey: ['campus-vendors'] })
            queryClient.invalidateQueries({ queryKey: ['campus-overview'] })
          }}
        />
      )}
    </>
  )
}

function DecisionDialog({
  vendor,
  next,
  onClose,
  onDone,
}: {
  vendor: CampusVendor
  next: 'active' | 'rejected' | 'suspended'
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')

  const copy = {
    active: {
      title: 'Approve this vendor',
      blurb:
        'They will be able to open their store and start taking orders immediately, and are emailed to say so.',
      cta: 'Approve',
      variant: 'primary' as const,
      needsReason: false,
    },
    rejected: {
      title: 'Reject this application',
      blurb: 'They are emailed to say the application was not approved, along with your reason.',
      cta: 'Reject',
      variant: 'danger' as const,
      needsReason: true,
    },
    suspended: {
      title: 'Suspend this vendor',
      blurb: 'Their store stops being visible to buyers and they are emailed. This can be undone.',
      cta: 'Suspend',
      variant: 'danger' as const,
      needsReason: true,
    },
  }[next]

  const save = useMutation({
    mutationFn: () => campusApi.setVendorStatus(vendor.id, next, reason.trim() || undefined),
    onSuccess: () => {
      toast.success(
        next === 'active' ? 'Vendor approved' : next === 'rejected' ? 'Application rejected' : 'Vendor suspended',
      )
      onDone()
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the vendor.')),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={copy.title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={copy.variant} loading={save.isPending} onClick={() => save.mutate()}>
            {copy.cta}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="rounded-lg border border-line bg-surface-sunk px-3.5 py-3">
          <Detail label="Business">{text(vendor.businessName)}</Detail>
          <Detail label="Email">{text(vendor.businessEmail)}</Detail>
          <Detail label="Phone">{text(vendor.businessPhone)}</Detail>
        </div>

        <p className="text-[13px] leading-relaxed text-ink-soft">{copy.blurb}</p>

        {copy.needsReason && (
          <Textarea
            label="Reason (sent to them)"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </div>
    </Modal>
  )
}

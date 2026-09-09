import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Activity as ActivityIcon, Download, RefreshCw } from 'lucide-react'
import { adminApi, errorMessage, type Row } from '../lib/api'
import { ago, dateTime, text, titleCase } from '../lib/format'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Empty,
  PageHeader,
  Select,
  Toolbar,
  type Column,
} from '../components/ui'

/**
 * The audit trail.
 *
 * Everything consequential an admin does writes here — suspensions, refunds,
 * payout reconciliations — alongside system events. It is the answer to "who
 * changed this, and why", which is the question that actually gets asked
 * weeks later when a vendor disputes a suspension.
 */
export default function ActivityLog() {
  const [type, setType] = useState('all')

  const activity = useQuery({
    queryKey: ['activity', type],
    queryFn: () => adminApi.activity({ type, limit: 100 }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const columns: Column<Row>[] = [
    {
      key: 'event',
      header: 'Event',
      render: (a) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{text(a.message, titleCase(text(a.type)))}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{titleCase(text(a.type))}</p>
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (a) => (
        <div className="min-w-0">
          <Badge tone={a.actorType === 'admin' ? 'info' : 'neutral'}>{text(a.actorType, 'system')}</Badge>
          <p className="mt-0.5 truncate text-[11px] text-ink-faint">{text(a.actorId)}</p>
        </div>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      render: (a) => (
        <div className="min-w-0">
          <p className="truncate">{titleCase(text(a.targetType))}</p>
          <p className="truncate text-[11px] text-ink-faint">{text(a.targetId)}</p>
        </div>
      ),
    },
    {
      key: 'when',
      header: 'When',
      align: 'right',
      render: (a) => <span title={dateTime(a.createdAt)}>{ago(a.createdAt)}</span>,
    },
  ]

  const rows = activity.data?.activity ?? []

  return (
    <>
      <PageHeader
        title="Activity log"
        subtitle="Who did what, across the whole platform."
        actions={
          <>
            <Button
              size="sm"
              icon={Download}
              onClick={() =>
                adminApi
                  .exportCsv('activity', { type, limit: 5000 })
                  .then(() => toast.success('Export downloaded'))
                  .catch((e) => toast.error(errorMessage(e, 'Export failed.')))
              }
            >
              Export CSV
            </Button>
            <Button size="sm" icon={RefreshCw} loading={activity.isFetching} onClick={() => activity.refetch()}>
              Refresh
            </Button>
          </>
        }
      />

      <Card
        bodyClassName="p-0"
        title={
          <Toolbar>
            <Select label="Type" value={type} onChange={(e) => setType(e.target.value)} className="w-56">
              <option value="all">All events</option>
              <option value="rider_status_change">Rider status changes</option>
              <option value="withdrawal_reconciled">Payout reconciliations</option>
              <option value="wallet_credit">Wallet credits</option>
              <option value="order_refund">Order refunds</option>
              <option value="vendor_status_change">Vendor status changes</option>
            </Select>
          </Toolbar>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(a, i) => String(a.id ?? i)}
          loading={activity.isLoading}
          error={activity.isError ? errorMessage(activity.error) : null}
          onRetry={() => activity.refetch()}
          empty={<Empty icon={ActivityIcon} title="Nothing logged" message="No events of this type yet." />}
        />
      </Card>
    </>
  )
}

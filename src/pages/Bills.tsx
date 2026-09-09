import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Receipt, RefreshCw } from 'lucide-react'
import { adminApi, errorMessage, type BillPayment } from '../lib/api'
import { ago, count, money, shortId, text, titleCase } from '../lib/format'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Empty,
  PageHeader,
  Select,
  Stat,
  StatusBadge,
  Toolbar,
  type Column,
} from '../components/ui'

const CATEGORIES = ['all', 'airtime', 'data', 'electricity', 'tv', 'betting', 'education']

/**
 * Bill payments.
 *
 * Every row here moved real money to a third-party provider, so the failure
 * rate matters more than the volume: a run of failures is usually the VTU
 * aggregator rather than us, and the difference decides whether anyone needs
 * to be woken up. Simulated purchases are flagged loudly — a test transaction
 * mistaken for a real one is a refund that never needed to happen.
 */
export default function Bills() {
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')

  const bills = useQuery({
    queryKey: ['bills', status, category],
    queryFn: () => adminApi.bills({ status, category, limit: 200 }),
    staleTime: 30_000,
  })

  const rows = bills.data?.bills ?? []
  const totals = bills.data?.totals
  const failed = totals?.byStatus?.failed ?? 0
  const failureRate = rows.length ? Math.round((failed / rows.length) * 100) : 0

  const columns: Column<BillPayment>[] = [
    {
      key: 'service',
      header: 'Service',
      render: (b) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">
            {text(b.serviceName ?? b.serviceId, 'Unknown')}
            {b.simulated && (
              <Badge tone="info" className="ml-2">
                simulated
              </Badge>
            )}
          </p>
          <p className="truncate text-[11.5px] text-ink-faint">{titleCase(text(b.category))}</p>
        </div>
      ),
    },
    { key: 'recipient', header: 'Recipient', render: (b) => <span className="tabular">{text(b.recipient)}</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: (b) => <span className="font-semibold text-ink">{money(b.amount)}</span> },
    {
      key: 'cashback',
      header: 'Cashback',
      align: 'right',
      render: (b) => (b.cashback ? money(b.cashback) : '—'),
    },
    { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
    { key: 'ref', header: 'Reference', render: (b) => <span className="text-[12px]">{shortId(b.reference, 12)}</span> },
    { key: 'when', header: 'When', align: 'right', render: (b) => ago(b.createdAt) },
  ]

  return (
    <>
      <PageHeader
        title="Bill payments"
        subtitle="Airtime, data, electricity, TV and education purchases."
        actions={
          <Button size="sm" icon={RefreshCw} loading={bills.isFetching} onClick={() => bills.refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Transactions shown"
          value={count(rows.length)}
          hint="Most recent first"
          icon={Receipt}
          loading={bills.isLoading}
        />
        <Stat label="Value" value={money(totals?.amount)} hint="Across the rows in view" loading={bills.isLoading} />
        <Stat
          label="Failure rate"
          value={`${failureRate}%`}
          hint={`${count(failed)} failed of ${count(rows.length)}`}
          tone={failureRate > 15 ? 'bad' : failureRate > 5 ? 'warn' : 'good'}
          loading={bills.isLoading}
        />
        <Stat
          label="Successful"
          value={count(
            (totals?.byStatus?.success ?? 0) + (totals?.byStatus?.successful ?? 0) + (totals?.byStatus?.completed ?? 0),
          )}
          hint="Delivered by the provider"
          tone="good"
          loading={bills.isLoading}
        />
      </div>

      <Card
        bodyClassName="p-0"
        title={
          <Toolbar>
            <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
              <option value="all">All statuses</option>
              <option value="success">Success</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </Select>
            <Select
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-44"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? 'All categories' : titleCase(c)}
                </option>
              ))}
            </Select>
          </Toolbar>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(b) => b.id}
          loading={bills.isLoading}
          error={bills.isError ? errorMessage(bills.error) : null}
          onRetry={() => bills.refetch()}
          empty={<Empty icon={Receipt} title="No bill payments" message="Nothing matches these filters." />}
        />
      </Card>
    </>
  )
}

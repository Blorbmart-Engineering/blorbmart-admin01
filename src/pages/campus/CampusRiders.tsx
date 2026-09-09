import { useQuery } from '@tanstack/react-query'
import { Bike, RefreshCw } from 'lucide-react'
import { campusApi, errorMessage, type CampusRider } from '../../lib/api'
import { ago, count, text } from '../../lib/format'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Empty,
  PageHeader,
  Stat,
  StatusBadge,
  type Column,
} from '../../components/ui'

/**
 * Riders on this campus.
 *
 * Sorted with the online ones first, because the question this screen is
 * opened to answer is almost always "is anyone able to deliver right now",
 * not "who is on the roster".
 */
export default function CampusRiders() {
  const riders = useQuery({
    queryKey: ['campus-riders'],
    queryFn: campusApi.riders,
    staleTime: 20_000,
  })

  const rows = riders.data?.riders ?? []
  const online = rows.filter((r) => r.online).length

  const columns: Column<CampusRider>[] = [
    {
      key: 'rider',
      header: 'Rider',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{text(r.name)}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{text(r.phone ?? r.email)}</p>
        </div>
      ),
    },
    {
      key: 'online',
      header: 'Right now',
      render: (r) =>
        r.online ? (
          <Badge tone="good" dot>
            Online
          </Badge>
        ) : (
          <span className="text-[12.5px] text-ink-faint">{r.lastSeenAt ? ago(r.lastSeenAt) : 'Never seen'}</span>
        ),
    },
    { key: 'status', header: 'Account', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'vehicle',
      header: 'Vehicle',
      render: (r) => <span className="text-[12.5px] text-ink-soft">{text(r.vehicleType)}</span>,
    },
    {
      key: 'deliveries',
      header: 'Delivered',
      align: 'right',
      render: (r) => count(r.deliveriesCompleted),
    },
  ]

  return (
    <>
      <PageHeader
        title="Riders"
        subtitle="Who can deliver on your campus."
        actions={
          <Button size="sm" icon={RefreshCw} loading={riders.isFetching} onClick={() => riders.refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Stat
          label="Online now"
          value={count(online)}
          hint={online === 0 ? 'Nothing can be delivered right now' : 'Available to take a delivery'}
          icon={Bike}
          tone={online ? 'good' : 'bad'}
          loading={riders.isLoading}
        />
        <Stat
          label="Riders on campus"
          value={count(rows.length)}
          hint="Registered here, online or not"
          loading={riders.isLoading}
        />
      </div>

      <Card bodyClassName="p-0">
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(r) => r.uid}
          loading={riders.isLoading}
          error={riders.isError ? errorMessage(riders.error) : null}
          onRetry={() => riders.refetch()}
          empty={
            <Empty
              icon={Bike}
              title="No riders yet"
              message="Nobody has signed up to deliver on your campus. Until one does, orders cannot be fulfilled."
            />
          }
        />
      </Card>
    </>
  )
}

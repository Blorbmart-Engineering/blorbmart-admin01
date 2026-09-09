import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { GraduationCap, RefreshCw } from 'lucide-react'
import { adminApi, errorMessage, type CampusRow } from '../lib/api'
import { count } from '../lib/format'
import {
  Badge,
  Button,
  Card,
  DataTable,
  ErrorState,
  PageHeader,
  Stat,
  type Column,
} from '../components/ui'

/**
 * Campus readiness.
 *
 * A campus is only actually open when it has both something to sell and
 * somebody to deliver it. Four separate numbers make that easy to miss, so
 * the server states the conclusion and this screen leads with it: a campus
 * with stores and no riders is not live, however good the other columns look.
 */
export default function Campuses() {
  const campuses = useQuery({
    queryKey: ['campuses'],
    queryFn: adminApi.campuses,
    staleTime: 120_000,
  })

  const rows = campuses.data?.campuses ?? []
  const liveCount = rows.filter((c) => c.live).length

  const columns: Column<CampusRow>[] = [
    {
      key: 'campus',
      header: 'Campus',
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{c.name}</p>
          <p className="truncate text-[11.5px] text-ink-faint">
            {c.shortName}
            {c.city ? ` · ${c.city}` : ''}
            {c.state ? `, ${c.state}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'live',
      header: 'Status',
      render: (c) =>
        c.live ? (
          <Badge tone="good" dot>
            Live
          </Badge>
        ) : (
          <Badge tone="warn" dot>
            {c.stores === 0 ? 'No stores' : 'No active riders'}
          </Badge>
        ),
    },
    { key: 'stores', header: 'Stores', align: 'right', render: (c) => count(c.stores) },
    { key: 'products', header: 'Products', align: 'right', render: (c) => count(c.products) },
    {
      key: 'riders',
      header: 'Riders',
      align: 'right',
      render: (c) => (
        <Link to={`/riders?universityId=${c.id}`} className="hover:text-brand">
          <span className={c.activeRiders === 0 ? 'text-bad' : 'text-ink'}>{count(c.activeRiders)}</span>
          <span className="text-ink-faint"> / {count(c.riders)}</span>
        </Link>
      ),
    },
    { key: 'buyers', header: 'Buyers', align: 'right', render: (c) => count(c.buyers) },
  ]

  if (campuses.isError) {
    return (
      <>
        <PageHeader title="Campuses" />
        <Card>
          <ErrorState message={errorMessage(campuses.error)} onRetry={() => campuses.refetch()} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Campuses"
        subtitle="Where Blorbmart operates, and whether each campus can actually trade."
        actions={
          <Button size="sm" icon={RefreshCw} loading={campuses.isFetching} onClick={() => campuses.refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Campuses live"
          value={`${liveCount} / ${rows.length}`}
          hint="Have both stores and an active rider"
          icon={GraduationCap}
          tone={liveCount === rows.length ? 'good' : 'warn'}
          loading={campuses.isLoading}
        />
        <Stat
          label="Bills-only buyers"
          value={count(campuses.data?.billsOnlyBuyers)}
          hint="Signed up before we reached their school"
          loading={campuses.isLoading}
        />
        <Stat
          label="Untagged stores"
          value={count(campuses.data?.untagged.stores)}
          hint="Visible on every campus until tagged"
          tone={campuses.data?.untagged.stores ? 'warn' : 'good'}
          loading={campuses.isLoading}
        />
        <Stat
          label="Untagged products"
          value={count(campuses.data?.untagged.products)}
          hint="Inherit a campus when their store is tagged"
          tone={campuses.data?.untagged.products ? 'warn' : 'good'}
          loading={campuses.isLoading}
        />
      </div>

      <Card bodyClassName="p-0" title="Campus readiness">
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(c) => c.id}
          loading={campuses.isLoading}
        />
      </Card>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
        Untagged stores and products are shown to buyers on every campus. That is deliberate — it is what let
        campus filtering ship without emptying the catalogue — but the backlog should trend to zero as vendors
        set their campus in the vendor app.
      </p>
    </>
  )
}

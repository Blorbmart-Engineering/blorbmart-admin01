import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Bike,
  Building2,
  Package,
  Receipt,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { adminApi, errorMessage } from '../lib/api'
import { compact, count, money } from '../lib/format'
import { Badge, Button, Card, PageHeader, Stat, statusTone, ErrorState } from '../components/ui'

/**
 * The screen that answers "is anything wrong right now?"
 *
 * Ordered by urgency rather than by importance-in-the-abstract: the queues
 * that need a human come first, because a pending rider or an unapproved
 * vendor is somebody blocked and waiting, while lifetime totals are context
 * that can wait until they have scrolled.
 */
export default function Dashboard() {
  const overview = useQuery({
    queryKey: ['overview'],
    queryFn: adminApi.overview,
    // Live enough to be trusted, slow enough not to hammer a sleeping host.
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const wallets = useQuery({
    queryKey: ['wallet-summary'],
    queryFn: adminApi.walletSummary,
    staleTime: 120_000,
  })

  const data = overview.data
  const loading = overview.isLoading

  if (overview.isError) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card>
          <ErrorState message={errorMessage(overview.error)} onRetry={() => overview.refetch()} />
        </Card>
      </>
    )
  }

  const queues = data?.queues
  const needsAttention = (queues?.ridersPending ?? 0) + (queues?.vendorsPending ?? 0)

  const statusEntries = Object.entries(data?.orderStatus ?? {}).sort((a, b) => b[1] - a[1])

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Everything moving across Blorbmart right now."
        actions={
          <Button
            size="sm"
            icon={RefreshCw}
            loading={overview.isFetching}
            onClick={() => {
              overview.refetch()
              wallets.refetch()
            }}
          >
            Refresh
          </Button>
        }
      />

      {/* ── Queues: people currently blocked on us ───────────────────── */}
      <section className="mb-5">
        <h2 className="mb-2.5 text-[12px] font-bold uppercase tracking-wide text-ink-faint">
          Waiting on you
          {needsAttention > 0 && (
            <Badge tone="warn" className="ml-2">
              {needsAttention}
            </Badge>
          )}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Link to="/riders?status=pending" className="transition-transform hover:-translate-y-0.5">
            <Stat
              label="Riders awaiting approval"
              value={count(queues?.ridersPending)}
              hint="Finished onboarding, cannot take jobs yet"
              icon={Bike}
              tone={queues?.ridersPending ? 'warn' : 'good'}
              loading={loading}
            />
          </Link>
          <Link to="/vendors?status=pending" className="transition-transform hover:-translate-y-0.5">
            <Stat
              label="Vendors awaiting approval"
              value={count(queues?.vendorsPending)}
              hint="Signed up, storefront not live"
              icon={Building2}
              tone={queues?.vendorsPending ? 'warn' : 'good'}
              loading={loading}
            />
          </Link>
          <Link to="/riders" className="transition-transform hover:-translate-y-0.5">
            <Stat
              label="Riders online now"
              value={count(queues?.ridersOnline)}
              hint="Available to receive an offer"
              icon={Bike}
              tone={queues?.ridersOnline ? 'good' : 'bad'}
              loading={loading}
            />
          </Link>
        </div>
      </section>

      {/* ── Trade ────────────────────────────────────────────────────── */}
      <section className="mb-5">
        <h2 className="mb-2.5 text-[12px] font-bold uppercase tracking-wide text-ink-faint">Last 24 hours</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Orders"
            value={count(data?.activity.orders24h)}
            hint={`${count(data?.activity.orders7d)} in the last 7 days`}
            icon={ShoppingBag}
            tone="brand"
            loading={loading}
          />
          <Stat
            label="Order value"
            value={money(data?.activity.gmv24h)}
            hint={`${money(data?.activity.paid24h)} paid`}
            icon={TrendingUp}
            loading={loading}
          />
          <Stat
            label="Bill payments"
            value={count(data?.activity.bills24h)}
            hint="Airtime, data, power, TV"
            icon={Receipt}
            loading={loading}
          />
          <Stat
            label="Wallet float"
            value={money(wallets.data?.totalFloat)}
            hint="Held across buyer, seller and rider wallets"
            icon={Wallet}
            tone="info"
            loading={wallets.isLoading}
          />
        </div>
        {data && (
          <p className="mt-2 text-[11.5px] text-ink-faint">
            Order value is summed over the {count(data.sampledOrders)} most recent orders, so it is exact for a
            normal day and a floor on an exceptional one.
          </p>
        )}
      </section>

      {/* ── Scale ────────────────────────────────────────────────────── */}
      <section className="mb-5">
        <h2 className="mb-2.5 text-[12px] font-bold uppercase tracking-wide text-ink-faint">All time</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="Users" value={compact(data?.counts.users)} icon={Users} loading={loading} />
          <Stat label="Riders" value={compact(data?.counts.riders)} icon={Bike} loading={loading} />
          <Stat label="Vendors" value={compact(data?.counts.vendors)} icon={Building2} loading={loading} />
          <Stat label="Products" value={compact(data?.counts.products)} icon={Package} loading={loading} />
          <Stat label="Orders" value={compact(data?.counts.orders)} icon={ShoppingBag} loading={loading} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Recent order states"
          subtitle={`Across the last ${count(data?.sampledOrders)} orders`}
          actions={
            <Link to="/orders">
              <Button size="sm" variant="ghost">
                View orders
              </Button>
            </Link>
          }
        >
          {statusEntries.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-faint">No orders yet.</p>
          ) : (
            <ul className="space-y-2">
              {statusEntries.map(([status, n]) => {
                const total = statusEntries.reduce((sum, [, v]) => sum + v, 0) || 1
                const pct = Math.round((n / total) * 100)
                return (
                  <li key={status} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-[12.5px] text-ink-soft capitalize">
                      {status.replace(/[_-]+/g, ' ')}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
                      <span
                        className={
                          statusTone(status) === 'good'
                            ? 'block h-full bg-good'
                            : statusTone(status) === 'bad'
                              ? 'block h-full bg-bad'
                              : statusTone(status) === 'warn'
                                ? 'block h-full bg-warn'
                                : 'block h-full bg-brand'
                        }
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="w-14 shrink-0 text-right text-[12.5px] font-semibold text-ink tabular">
                      {count(n)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card
          title="Money held"
          subtitle="Balances owed out across the three wallet systems"
          actions={
            <Link to="/wallets">
              <Button size="sm" variant="ghost">
                Manage
              </Button>
            </Link>
          }
        >
          {wallets.isError ? (
            <ErrorState message={errorMessage(wallets.error)} onRetry={() => wallets.refetch()} />
          ) : (
            <ul className="space-y-2.5">
              {(wallets.data?.systems ?? []).map((system) => (
                <li key={system.system} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold capitalize text-ink">{system.system} wallets</p>
                    <p className="text-[11.5px] text-ink-faint">
                      {count(system.wallets)} accounts
                      {system.truncated && ' (capped)'}
                    </p>
                  </div>
                  <span className="text-[13.5px] font-bold text-ink tabular">
                    {money(system.availableBalance)}
                  </span>
                </li>
              ))}
              {(wallets.data?.pendingWithdrawals ?? []).some((p) => p.count > 0) && (
                <li className="mt-1 border-t border-line-soft pt-2.5">
                  {wallets.data?.pendingWithdrawals
                    .filter((p) => p.count > 0)
                    .map((p) => (
                      <Link
                        key={p.system}
                        to="/wallets"
                        className="flex items-center justify-between gap-3 py-1 text-[12.5px]"
                      >
                        <span className="capitalize text-warn">{p.system} payouts pending</span>
                        <span className="font-semibold text-warn tabular">
                          {count(p.count)} · {money(p.amount)}
                        </span>
                      </Link>
                    ))}
                </li>
              )}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

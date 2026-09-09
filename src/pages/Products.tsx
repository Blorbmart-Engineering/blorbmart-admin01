import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Download, Package, Search } from 'lucide-react'
import { adminApi, errorMessage, type Row } from '../lib/api'
import { ago, count, money, text } from '../lib/format'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Empty,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  Toolbar,
  type Column,
} from '../components/ui'

/**
 * The catalogue.
 *
 * Campus and stock are the two columns worth scanning: an untagged product is
 * showing on every campus, and a zero-stock product is taking up space in a
 * feed it can never be bought from. Both are called out in colour rather than
 * left as numbers to compare by hand.
 */
export default function Products() {
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const products = useQuery({
    queryKey: ['products', status, q, page],
    queryFn: () => adminApi.products({ status, q, page, limit: 50 }),
    staleTime: 60_000,
  })

  const columns: Column<Row>[] = [
    {
      key: 'product',
      header: 'Product',
      render: (p) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{text(p.name, 'Unnamed')}</p>
          <p className="truncate text-[11.5px] text-ink-faint">
            {text(p.storeName ?? p.businessName)} · {text(p.categoryName)}
          </p>
        </div>
      ),
    },
    {
      key: 'campus',
      header: 'Campus',
      render: (p) =>
        p.universityId ? (
          text(p.universityName ?? p.universityId)
        ) : (
          <Badge tone="warn">All campuses</Badge>
        ),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      render: (p) => (
        <span>
          {money(p.discountPrice && Number(p.discountPrice) > 0 ? p.discountPrice : p.price)}
          {Number(p.discountPrice) > 0 && Number(p.discountPrice) < Number(p.price) && (
            <span className="ml-1.5 text-ink-faint line-through">{money(p.price)}</span>
          )}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      align: 'right',
      render: (p) => {
        const stock = Number(p.stockQuantity ?? 0)
        return <span className={stock === 0 ? 'font-semibold text-bad' : ''}>{count(stock)}</span>
      },
    },
    { key: 'sold', header: 'Sold', align: 'right', render: (p) => count(p.totalSold) },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
    { key: 'added', header: 'Added', align: 'right', render: (p) => ago(p.createdAt) },
  ]

  const rows = products.data?.products ?? []
  const pagination = products.data?.pagination

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Everything listed across every store."
        actions={
          <Button
            size="sm"
            icon={Download}
            onClick={() =>
              adminApi
                .exportCsv('products', { status, q, limit: 5000 })
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
            <Select
              label="Status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
              className="w-40"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setQ(search.trim())
                setPage(1)
              }}
              className="flex items-end gap-2"
            >
              <Input
                label="Search"
                placeholder="Product or store"
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
          keyOf={(p, i) => String(p.id ?? i)}
          loading={products.isLoading}
          error={products.isError ? errorMessage(products.error) : null}
          onRetry={() => products.refetch()}
          empty={<Empty icon={Package} title="No products" message="Nothing matches these filters." />}
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
    </>
  )
}

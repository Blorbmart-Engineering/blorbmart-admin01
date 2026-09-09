import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Download, Search, Users as UsersIcon } from 'lucide-react'
import { adminApi, errorMessage, type Row } from '../lib/api'
import { ago, text, titleCase } from '../lib/format'
import {
  Badge,
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
 * Users.
 *
 * Suspending an account is the sharpest thing on this screen, so it is behind
 * a row click and a modal rather than an inline button — a mis-click in a
 * dense table should never be able to lock a real customer out of their food
 * order.
 */
export default function Users() {
  const queryClient = useQueryClient()
  const [role, setRole] = useState('all')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Row | null>(null)
  const [reason, setReason] = useState('')

  const users = useQuery({
    queryKey: ['users', role, q, page],
    queryFn: () => adminApi.users({ role, q, page, limit: 50 }),
    staleTime: 30_000,
  })

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      adminApi.userAction(id, action, reason || undefined),
    onSuccess: (_d, v) => {
      toast.success(`Account ${v.action}`)
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setSelected(null)
      setReason('')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the account.')),
  })

  const idOf = (u: Row) => String(pickId(u))

  const columns: Column<Row>[] = [
    {
      key: 'user',
      header: 'User',
      render: (u) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">
            {text(`${text(u.firstName, '')} ${text(u.lastName, '')}`.trim(), 'Unnamed')}
          </p>
          <p className="truncate text-[11.5px] text-ink-faint">{text(u.email)}</p>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (u) => <span className="tabular">{text(u.phone)}</span> },
    { key: 'role', header: 'Role', render: (u) => <Badge tone={u.role === 'admin' ? 'info' : 'neutral'}>{titleCase(text(u.role, 'buyer'))}</Badge> },
    { key: 'campus', header: 'Campus', render: (u) => text(u.universityName ?? u.universityId, 'Not set') },
    { key: 'status', header: 'Status', render: (u) => <StatusBadge status={text(u.accountStatus, 'active')} /> },
    { key: 'joined', header: 'Joined', align: 'right', render: (u) => ago(u.createdAt) },
  ]

  const rows = users.data?.users ?? []
  const pagination = users.data?.pagination
  const isSuspended = selected && String(selected.accountStatus).toLowerCase() !== 'active'

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Everyone with a Blorbmart account."
        actions={
          <Button
            size="sm"
            icon={Download}
            onClick={() =>
              adminApi
                .exportCsv('users', { role, q, limit: 5000 })
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
            <Select label="Role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }} className="w-40">
              <option value="all">All roles</option>
              <option value="buyer">Buyer</option>
              <option value="vendor">Vendor</option>
              <option value="rider">Rider</option>
              <option value="admin">Admin</option>
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
                placeholder="Name, email, phone"
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
          keyOf={(u, i) => String(pickId(u) ?? i)}
          loading={users.isLoading}
          error={users.isError ? errorMessage(users.error) : null}
          onRetry={() => users.refetch()}
          onRowClick={(u) => setSelected(u)}
          empty={<Empty icon={UsersIcon} title="No users" message="Nothing matches these filters." />}
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
        }}
        title="User account"
        footer={
          selected && (
            <>
              <Button onClick={() => setSelected(null)}>Close</Button>
              {isSuspended ? (
                <Button
                  variant="primary"
                  loading={act.isPending}
                  onClick={() => act.mutate({ id: idOf(selected), action: 'activate' })}
                >
                  Reactivate
                </Button>
              ) : (
                <Button
                  variant="danger"
                  loading={act.isPending}
                  onClick={() => act.mutate({ id: idOf(selected), action: 'suspend' })}
                >
                  Suspend account
                </Button>
              )}
            </>
          )
        }
      >
        {selected && (
          <div className="space-y-4">
            <div>
              <Detail label="Name">
                {text(`${text(selected.firstName, '')} ${text(selected.lastName, '')}`.trim())}
              </Detail>
              <Detail label="Email">{text(selected.email)}</Detail>
              <Detail label="Phone">{text(selected.phone)}</Detail>
              <Detail label="Role">{titleCase(text(selected.role, 'buyer'))}</Detail>
              <Detail label="Campus">{text(selected.universityName ?? selected.universityId, 'Not set')}</Detail>
              <Detail label="Status">
                <StatusBadge status={text(selected.accountStatus, 'active')} />
              </Detail>
              <Detail label="Email verified">{selected.isEmailVerified ? 'Yes' : 'No'}</Detail>
              <Detail label="Joined">{ago(selected.createdAt)}</Detail>
              <Detail label="Last login">{ago(selected.lastLoginAt)}</Detail>
              <Detail label="User id">{text(pickId(selected))}</Detail>
            </div>

            <Input
              label="Reason (recorded in the activity log)"
              placeholder="e.g. Chargeback fraud, confirmed with Paystack"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        )}
      </Modal>
    </>
  )
}

/** Documents are keyed by `id` in some collections and `uid` in others. */
function pickId(row: Row) {
  return row.id ?? row.uid ?? row.userId
}

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
  const [campusId, setCampusId] = useState('')
  const [closeStore, setCloseStore] = useState(true)
  const [confirmRole, setConfirmRole] = useState<'buyer' | 'vendor' | null>(null)
  const [password, setPassword] = useState('')

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

  // Only loaded once a user is opened: most visits to this screen never
  // change anyone's school.
  const campuses = useQuery({
    queryKey: ['campuses', 'manage'],
    queryFn: adminApi.manageCampuses,
    enabled: Boolean(selected),
    staleTime: 120_000,
  })

  const moveCampus = useMutation({
    mutationFn: ({ id, universityId }: { id: string; universityId: string }) =>
      adminApi.setUserCampus(id, universityId, reason || undefined),
    onSuccess: (d) => {
      const extra = [
        d.moved.store && `their store and ${d.moved.products} product${d.moved.products === 1 ? '' : 's'}`,
        d.moved.rider && 'their rider profile',
      ].filter(Boolean)
      toast.success(`Moved to ${d.universityName}${extra.length ? `, with ${extra.join(' and ')}` : ''}`)
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setSelected((s) => (s ? { ...s, universityId: d.universityId, universityName: d.universityName } : s))
      setReason('')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not change the school.')),
  })

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'buyer' | 'vendor' }) =>
      adminApi.setUserRole(id, role, closeStore, reason || undefined),
    onSuccess: (d) => {
      const extra = d.role === 'buyer' && d.storeClosed ? ` and ${d.storeName ?? 'their store'} is closed` : ''
      toast.success(`${d.role === 'buyer' ? 'Now a customer account' : 'Now a vendor account'}${extra}`)
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setSelected((s) => (s ? { ...s, role: d.role } : s))
      setConfirmRole(null)
      setReason('')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not change the account type.')),
  })

  const setUserPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      adminApi.setUserPassword(id, password, reason || undefined),
    onSuccess: () => {
      toast.success('Password changed. They have been signed out everywhere.')
      setReason('')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not change the password.')),
  })

  const openUser = (u: Row) => {
    setSelected(u)
    setCampusId(text(u.universityId, ''))
    setPassword('')
    // A half-confirmed change must never carry over to the next person opened.
    setConfirmRole(null)
    setCloseStore(true)
  }

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(password)
      toast.success('Password copied')
    } catch {
      toast.error('Could not copy. Select it and copy by hand.')
    }
  }

  const selectedRole = selected ? String(selected.role ?? '').toLowerCase() : ''
  const passwordLocked = ['admin', 'super_admin', 'head_of_ops'].includes(selectedRole)

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
  // Same default as the Status badge: accounts created outside the apps (REST
  // sign-ups, old docs) have no accountStatus and are active. Reading the raw
  // field here showed "Reactivate" on an account the modal called active.
  const isSuspended = selected && text(selected.accountStatus, 'active').toLowerCase() !== 'active'

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
          onRowClick={openUser}
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

            <div className="flex items-end gap-2">
              <Select
                label="School"
                value={campusId}
                onChange={(e) => setCampusId(e.target.value)}
                disabled={campuses.isLoading}
                className="min-w-0 flex-1"
              >
                <option value="" disabled>
                  {campuses.isLoading ? 'Loading schools…' : 'Pick a school'}
                </option>
                {(campuses.data?.campuses ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.active ? '' : ' (closed)'}
                  </option>
                ))}
                <option value="bills-only">No campus (bills only)</option>
              </Select>
              <Button
                loading={moveCampus.isPending}
                disabled={!campusId || campusId === text(selected.universityId, '')}
                onClick={() => moveCampus.mutate({ id: idOf(selected), universityId: campusId })}
              >
                Change school
              </Button>
            </div>
            {campuses.isError && (
              <p className="text-[12px] text-bad">{errorMessage(campuses.error, 'Could not load schools.')}</p>
            )}

            {/* Customer or vendor. Admins, heads of ops and riders are managed on their own pages. */}
            {['buyer', 'vendor', 'kitchen', ''].includes(selectedRole) && (
              <div className="rounded-lg border border-line-soft p-3">
                <p className="text-[12px] font-bold uppercase tracking-wide text-ink-faint">Account type</p>
                <p className="mt-1 text-[13px] text-ink-soft">
                  {selectedRole === 'vendor' || selectedRole === 'kitchen'
                    ? 'A vendor account. Making it a customer account turns off their vendor access; they keep their wallet and orders.'
                    : 'A customer account. Only someone who signed up as a vendor before can be made a vendor again.'}
                </p>
                {confirmRole ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-[13px] font-semibold text-ink">
                      {confirmRole === 'buyer'
                        ? `Make ${text(selected.firstName, 'them')} a customer?`
                        : `Make ${text(selected.firstName, 'them')} a vendor again?`}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => setConfirmRole(null)}>
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        loading={changeRole.isPending}
                        onClick={() => changeRole.mutate({ id: idOf(selected), role: confirmRole })}
                      >
                        Yes, change it
                      </Button>
                    </div>
                  </div>
                ) : selectedRole === 'vendor' || selectedRole === 'kitchen' ? (
                  <div className="mt-3 space-y-2">
                    <label className="flex items-center gap-2 text-[13px] text-ink-soft">
                      <input type="checkbox" checked={closeStore} onChange={(e) => setCloseStore(e.target.checked)} />
                      Also close their store, so customers stop seeing it
                    </label>
                    <Button onClick={() => setConfirmRole('buyer')}>Make a customer account</Button>
                  </div>
                ) : (
                  <div className="mt-3">
                    <Button onClick={() => setConfirmRole('vendor')}>Make a vendor account</Button>
                  </div>
                )}
              </div>
            )}

            {passwordLocked ? (
              <p className="text-[12px] text-ink-faint">
                {selectedRole === 'head_of_ops'
                  ? 'Reset a head of operations password from the Campuses page.'
                  : 'Admins change their own password.'}
              </p>
            ) : (
              <div>
                <div className="flex items-end gap-2">
                  <Input
                    label="New password"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="min-w-0 flex-1 font-mono"
                  />
                  <Button onClick={() => setPassword(generatePassword())}>Generate</Button>
                  <Button disabled={!password} onClick={copyPassword}>
                    Copy
                  </Button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[12px] text-ink-faint">
                    Signs them out on every device. Send them the new password yourself.
                  </p>
                  <Button
                    loading={setUserPassword.isPending}
                    disabled={password.length < 8}
                    onClick={() => setUserPassword.mutate({ id: idOf(selected), password })}
                  >
                    Set password
                  </Button>
                </div>
              </div>
            )}

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

/** Twelve characters with no look-alikes (0/O, 1/l/I), easy to read out to a customer. */
function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint32Array(12))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

/** Documents are keyed by `id` in some collections and `uid` in others. */
function pickId(row: Row) {
  return row.id ?? row.uid ?? row.userId
}

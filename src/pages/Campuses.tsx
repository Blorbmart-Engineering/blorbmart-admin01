import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  GraduationCap,
  RefreshCw,
  Plus,
  Megaphone,
  Wrench,
  UserPlus,
  ShieldOff,
  KeyRound,
  Copy,
  AlertTriangle,
} from 'lucide-react'
import { adminApi, errorMessage, type CampusRow } from '../lib/api'
import { count, dateOnly, text } from '../lib/format'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Detail,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  Select,
  Stat,
  Textarea,
  Toolbar,
  type Column,
} from '../components/ui'

/**
 * ────────────────────────────────────────────────────────────────────────────
 * Campuses.
 *
 * This screen used to be a read-only readiness table: four numbers per campus
 * and a verdict. Opening a campus was a code change, and everything about
 * running one — who is in charge of it, whether it is trading, telling the
 * people on it anything — had no home at all.
 *
 * The readiness view is still the top of the page, because "can this campus
 * actually trade" is the question an admin opens it to answer. The actions
 * hang off each row rather than living in a separate section: they are all
 * things you do *to a campus*, and separating them from the numbers that
 * prompted them means picking the campus twice.
 *
 * Two of these are hard to undo and are treated that way. Revoking a head of
 * operations ends someone's access within the hour, and maintenance mode stops
 * a campus trading and pushes a notification to everyone on it — both ask for
 * confirmation, and maintenance says how many people are about to be told.
 * ────────────────────────────────────────────────────────────────────────────
 */

type Dialog =
  | { kind: 'create' }
  | { kind: 'assign'; campus: CampusRow }
  | { kind: 'revoke'; campus: CampusRow }
  | { kind: 'reset'; campus: CampusRow }
  | { kind: 'maintenance'; campus: CampusRow }
  | { kind: 'broadcast'; campus: CampusRow }
  | null

export default function Campuses() {
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<Dialog>(null)

  const campuses = useQuery({
    queryKey: ['campuses'],
    queryFn: adminApi.campuses,
    staleTime: 120_000,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['campuses'] })
  }

  const rows = campuses.data?.campuses ?? []
  const liveCount = rows.filter((c) => c.live).length
  const inMaintenance = rows.filter((c) => c.maintenance?.enabled).length
  const withoutHead = rows.filter((c) => !c.headOfOps || c.headOfOps.status !== 'active').length

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
      render: (c) => {
        if (c.active === false) return <Badge tone="neutral" dot>Closed</Badge>
        if (c.maintenance?.enabled) return <Badge tone="warn" dot>Maintenance</Badge>
        if (c.live) return <Badge tone="good" dot>Live</Badge>
        return <Badge tone="warn" dot>{c.stores === 0 ? 'No stores' : 'No active riders'}</Badge>
      },
    },
    {
      key: 'head',
      header: 'Head of ops',
      render: (c) =>
        c.headOfOps && c.headOfOps.status === 'active' ? (
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-medium text-ink">
              {c.headOfOps.name || c.headOfOps.email}
            </p>
            {c.headOfOps.mustChangePassword && (
              <p className="text-[11px] text-warn">Has not signed in yet</p>
            )}
          </div>
        ) : (
          <span className="text-[12.5px] text-ink-faint">Unassigned</span>
        ),
    },
    { key: 'stores', header: 'Stores', align: 'right', render: (c) => count(c.stores) },
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
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            icon={Megaphone}
            aria-label={`Message ${c.name}`}
            onClick={() => setDialog({ kind: 'broadcast', campus: c })}
          >
            {''}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Wrench}
            aria-label={`Maintenance for ${c.name}`}
            className={c.maintenance?.enabled ? 'text-warn' : undefined}
            onClick={() => setDialog({ kind: 'maintenance', campus: c })}
          >
            {''}
          </Button>
          {c.headOfOps && c.headOfOps.status === 'active' ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                icon={KeyRound}
                aria-label={`Resend password for ${c.name}`}
                onClick={() => setDialog({ kind: 'reset', campus: c })}
              >
                {''}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={ShieldOff}
                aria-label={`Revoke head of operations for ${c.name}`}
                onClick={() => setDialog({ kind: 'revoke', campus: c })}
              >
                {''}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              icon={UserPlus}
              aria-label={`Assign head of operations for ${c.name}`}
              onClick={() => setDialog({ kind: 'assign', campus: c })}
            >
              {''}
            </Button>
          )}
        </div>
      ),
    },
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
        subtitle="Where Blorbmart operates, whether each campus can trade, and who runs it."
        actions={
          <Toolbar>
            <Button size="sm" icon={RefreshCw} loading={campuses.isFetching} onClick={() => campuses.refetch()}>
              Refresh
            </Button>
            <Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ kind: 'create' })}>
              Add campus
            </Button>
          </Toolbar>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Campuses live"
          value={`${liveCount} / ${rows.length}`}
          hint="Open, not in maintenance, with stores and an active rider"
          icon={GraduationCap}
          tone={liveCount === rows.length ? 'good' : 'warn'}
          loading={campuses.isLoading}
        />
        <Stat
          label="In maintenance"
          value={count(inMaintenance)}
          hint={inMaintenance ? 'Buyers on these campuses have been notified' : 'Nothing paused'}
          tone={inMaintenance ? 'warn' : 'good'}
          loading={campuses.isLoading}
        />
        <Stat
          label="Without a head of ops"
          value={count(withoutHead)}
          hint="Nobody accountable for the campus day to day"
          tone={withoutHead ? 'warn' : 'good'}
          loading={campuses.isLoading}
        />
        <Stat
          label="Untagged stores"
          value={count(campuses.data?.untagged.stores)}
          hint="Visible on every campus until tagged"
          tone={campuses.data?.untagged.stores ? 'warn' : 'good'}
          loading={campuses.isLoading}
        />
      </div>

      <Card bodyClassName="p-0" title="Campus readiness">
        <DataTable columns={columns} rows={rows} keyOf={(c) => c.id} loading={campuses.isLoading} />
      </Card>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
        Untagged stores and products are shown to buyers on every campus. That is deliberate — it is what let
        campus filtering ship without emptying the catalogue — but the backlog should trend to zero as vendors
        set their campus in the vendor app.
      </p>

      {dialog?.kind === 'create' && <CreateCampusDialog onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog?.kind === 'assign' && (
        <AssignHeadDialog campus={dialog.campus} onClose={() => setDialog(null)} onDone={refresh} />
      )}
      {dialog?.kind === 'revoke' && (
        <RevokeHeadDialog campus={dialog.campus} onClose={() => setDialog(null)} onDone={refresh} />
      )}
      {dialog?.kind === 'reset' && (
        <ResetPasswordDialog campus={dialog.campus} onClose={() => setDialog(null)} onDone={refresh} />
      )}
      {dialog?.kind === 'maintenance' && (
        <MaintenanceDialog campus={dialog.campus} onClose={() => setDialog(null)} onDone={refresh} />
      )}
      {dialog?.kind === 'broadcast' && (
        <BroadcastDialog campus={dialog.campus} onClose={() => setDialog(null)} />
      )}
    </>
  )
}

/* ──────────────────────────── Add a campus ─────────────────────────────── */

function CreateCampusDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', shortName: '', state: '', city: '' })

  const create = useMutation({
    mutationFn: () =>
      adminApi.createCampus({
        name: form.name.trim(),
        shortName: form.shortName.trim() || undefined,
        state: form.state.trim() || undefined,
        city: form.city.trim() || undefined,
      }),
    onSuccess: (campus) => {
      toast.success(`${campus.name} opened`)
      onDone()
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not open the campus.')),
  })

  // Mirrors the backend's slugify so the admin sees the permanent id before
  // committing to it, rather than discovering it afterwards.
  const previewId = (form.shortName || form.name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a campus"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!form.name.trim()}
            onClick={() => create.mutate()}
          >
            Open campus
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Input
          label="Full name"
          placeholder="Obafemi Awolowo University"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Input
          label="Short name"
          placeholder="OAU"
          value={form.shortName}
          onChange={(e) => setForm({ ...form, shortName: e.target.value })}
        />
        <Toolbar className="gap-3">
          <Input
            label="City"
            placeholder="Ile-Ife"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
          <Input
            label="State"
            placeholder="Osun"
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
          />
        </Toolbar>

        {previewId && (
          <div className="rounded-lg border border-line bg-surface-sunk px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Campus id</p>
            <p className="mt-1 font-mono text-[13px] font-bold text-ink">{previewId}</p>
            <p className="mt-2 flex gap-2 text-[11.5px] leading-relaxed text-ink-faint">
              <AlertTriangle size={26} className="shrink-0 text-warn" strokeWidth={2.25} />
              <span>
                This id is written onto every buyer, store, product and rider on the campus and can never be
                changed afterwards. The names above can be edited freely; this cannot.
              </span>
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ──────────────────── Head of operations: assign ───────────────────────── */

function AssignHeadDialog({
  campus,
  onClose,
  onDone,
}: {
  campus: CampusRow
  onClose: () => void
  onDone: () => void
}) {
  const [form, setForm] = useState({ email: '', name: '', phone: '' })
  const [password, setPassword] = useState<string | null>(null)

  const assign = useMutation({
    mutationFn: () =>
      adminApi.assignHeadOfOps(campus.id, {
        email: form.email.trim(),
        name: form.name.trim() || undefined,
        phone: form.phone.trim() || undefined,
      }),
    onSuccess: (result) => {
      onDone()
      if (result.emailed) {
        toast.success(`Login details sent to ${result.email}`)
        onClose()
        return
      }
      // The email did not send. The dialog stays open holding the password,
      // because closing it is the one action that loses it for good.
      setPassword(result.temporaryPassword ?? null)
      toast.error(result.emailError || 'The account was created but the email did not send.')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not assign the head of operations.')),
  })

  if (password) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Send these details manually"
        footer={<Button variant="primary" onClick={onClose}>Done</Button>}
      >
        <div className="space-y-3.5">
          <p className="text-[13px] leading-relaxed text-ink-soft">
            The account for <strong className="text-ink">{campus.name}</strong> was created, but the
            credentials email did not send. Pass these on yourself — this password is not stored anywhere and
            will not be shown again.
          </p>
          <div className="rounded-lg border border-line bg-surface-sunk px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Email</p>
            <p className="mb-3 text-[13.5px] font-semibold text-ink">{form.email.trim()}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Temporary password
            </p>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 font-mono text-[15px] font-bold tracking-wide text-ink">{password}</code>
              <Button
                size="sm"
                icon={Copy}
                onClick={() => {
                  navigator.clipboard.writeText(password).then(
                    () => toast.success('Copied'),
                    () => toast.error('Could not copy — select it by hand.'),
                  )
                }}
              >
                Copy
              </Button>
            </div>
          </div>
          <p className="text-[12px] text-ink-faint">
            They will be asked to change it after signing in. You can send a fresh one from this screen at any
            time.
          </p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Head of operations — ${campus.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={assign.isPending}
            disabled={!form.email.trim()}
            onClick={() => assign.mutate()}
          >
            Assign and send login
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <p className="text-[13px] leading-relaxed text-ink-soft">
          We will create an account for this address, email them a temporary password, and ask them to set
          their own on first sign-in. If they already have a Blorbmart account, that one is used.
        </p>
        <Input
          label="Email"
          type="email"
          placeholder="name@example.com"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Toolbar className="gap-3">
          <Input
            label="Name (optional)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Phone (optional)"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </Toolbar>
      </div>
    </Modal>
  )
}

/* ──────────────────── Head of operations: revoke ───────────────────────── */

function RevokeHeadDialog({
  campus,
  onClose,
  onDone,
}: {
  campus: CampusRow
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState('')

  const revoke = useMutation({
    mutationFn: () => adminApi.revokeHeadOfOps(campus.id, reason.trim() || undefined),
    onSuccess: (result) => {
      toast.success(
        result.accountDisabled
          ? 'Access revoked and the account disabled'
          : 'Access revoked — their buyer account is untouched',
      )
      onDone()
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not revoke access.')),
  })

  const head = campus.headOfOps

  return (
    <Modal
      open
      onClose={onClose}
      title={`Revoke access — ${campus.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={revoke.isPending}
            disabled={confirm.trim().toUpperCase() !== 'REVOKE'}
            onClick={() => revoke.mutate()}
          >
            Revoke access
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="rounded-lg border border-line bg-surface-sunk px-3.5 py-3">
          <Detail label="Name">{text(head?.name)}</Detail>
          <Detail label="Email">{text(head?.email)}</Detail>
          <Detail label="Assigned">{head?.assignedAt ? dateOnly(head.assignedAt) : '—'}</Detail>
        </div>

        <p className="text-[13px] leading-relaxed text-ink-soft">
          Their live sessions end immediately. If this account exists only to run the campus it is disabled
          outright; if they were already a buyer here, they keep that account and simply lose the role.
        </p>

        <Textarea
          label="Reason (optional, included in the email to them)"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <Input
          label="Type REVOKE to confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="REVOKE"
        />
      </div>
    </Modal>
  )
}

/* ───────────────── Head of operations: resend password ─────────────────── */

function ResetPasswordDialog({
  campus,
  onClose,
  onDone,
}: {
  campus: CampusRow
  onClose: () => void
  onDone: () => void
}) {
  const [password, setPassword] = useState<string | null>(null)

  const reset = useMutation({
    mutationFn: () => adminApi.resetHeadOfOpsPassword(campus.id),
    onSuccess: (result) => {
      onDone()
      if (result.emailed) {
        toast.success(`A new password was sent to ${result.email}`)
        onClose()
        return
      }
      setPassword(result.temporaryPassword ?? null)
      toast.error(result.emailError || 'The password was reset but the email did not send.')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not reset the password.')),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={`New password — ${campus.name}`}
      footer={
        password ? (
          <Button variant="primary" onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={reset.isPending} onClick={() => reset.mutate()}>
              Send new password
            </Button>
          </>
        )
      }
    >
      {password ? (
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-ink-soft">
            The password was reset but the email did not send. Pass this on yourself — it will not be shown
            again.
          </p>
          <div className="rounded-lg border border-line bg-surface-sunk px-3.5 py-3">
            <code className="font-mono text-[15px] font-bold tracking-wide text-ink">{password}</code>
          </div>
        </div>
      ) : (
        <p className="text-[13px] leading-relaxed text-ink-soft">
          This emails <strong className="text-ink">{text(campus.headOfOps?.email)}</strong> a fresh temporary
          password and signs them out everywhere. Use it when the first email never arrived, or when they are
          locked out.
        </p>
      )}
    </Modal>
  )
}

/* ──────────────────────────── Maintenance ──────────────────────────────── */

function MaintenanceDialog({
  campus,
  onClose,
  onDone,
}: {
  campus: CampusRow
  onClose: () => void
  onDone: () => void
}) {
  const enabling = !campus.maintenance?.enabled
  const [message, setMessage] = useState('')
  const [notify, setNotify] = useState(true)
  const [alsoEmail, setAlsoEmail] = useState(false)

  const audience = campus.buyers + campus.riders

  const save = useMutation({
    mutationFn: () =>
      adminApi.setCampusMaintenance(campus.id, {
        enabled: enabling,
        message: message.trim() || undefined,
        notify,
        channels: alsoEmail ? ['push', 'inapp', 'email'] : ['push', 'inapp'],
      }),
    onSuccess: () => {
      toast.success(enabling ? `${campus.name} is under maintenance` : `${campus.name} is back online`)
      onDone()
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not change maintenance mode.')),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={enabling ? `Pause ${campus.name}` : `Reopen ${campus.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={enabling ? 'danger' : 'primary'}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {enabling ? 'Put under maintenance' : 'Take out of maintenance'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {enabling ? (
          <>
            <p className="text-[13px] leading-relaxed text-ink-soft">
              The campus stops reading as live, and everyone on it is told why.
            </p>
            <Textarea
              label="What to tell them"
              rows={3}
              placeholder={`Ordering on ${campus.shortName} is paused while we carry out maintenance. We will let you know as soon as it is back.`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="text-[12px] text-ink-faint">
              Leave blank to use the wording above.
            </p>
          </>
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Ordering resumes, and everyone on the campus is told it is working again.
          </p>
        )}

        <label className="flex items-center gap-2.5 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="size-4 rounded border-line accent-brand"
          />
          Notify the campus — about {count(audience)} {audience === 1 ? 'person' : 'people'}
        </label>

        {notify && (
          <label className="flex items-center gap-2.5 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={alsoEmail}
              onChange={(e) => setAlsoEmail(e.target.checked)}
              className="size-4 rounded border-line accent-brand"
            />
            Send email as well as push and in-app
          </label>
        )}
      </div>
    </Modal>
  )
}

/* ───────────────────────── Campus broadcast ────────────────────────────── */

function BroadcastDialog({ campus, onClose }: { campus: CampusRow; onClose: () => void }) {
  const [form, setForm] = useState({
    title: '',
    body: '',
    audience: 'all' as 'all' | 'buyers' | 'vendors' | 'riders',
    email: false,
  })

  const send = useMutation({
    mutationFn: () =>
      adminApi.broadcastToCampus(campus.id, {
        title: form.title.trim(),
        subject: form.title.trim(),
        body: form.body.trim(),
        audience: form.audience,
        channels: form.email ? ['push', 'inapp', 'email'] : ['push', 'inapp'],
      }),
    onSuccess: (result) => {
      const reached = result.result.inApp?.sentCount ?? result.result.push?.sentCount ?? 0
      toast.success(`Sent to ${count(reached)} on ${campus.shortName}`)
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not send the message.')),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={`Message ${campus.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={Megaphone}
            loading={send.isPending}
            disabled={!form.title.trim() || !form.body.trim()}
            onClick={() => send.mutate()}
          >
            Send
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Select
          label="Who"
          value={form.audience}
          onChange={(e) => setForm({ ...form, audience: e.target.value as typeof form.audience })}
        >
          <option value="all">Everyone on this campus</option>
          <option value="buyers">Buyers only</option>
          <option value="vendors">Vendors only</option>
          <option value="riders">Riders only</option>
        </Select>

        <Input
          label="Title"
          placeholder="Free delivery this weekend"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />

        <Textarea
          label="Message"
          rows={4}
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />

        <label className="flex items-center gap-2.5 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.checked })}
            className="size-4 rounded border-line accent-brand"
          />
          Send email as well as push and in-app
        </label>

        <p className="text-[12px] leading-relaxed text-ink-faint">
          Only people tagged with this campus are included. Anyone who has not set a campus is left out — a
          message about one school reaching a student at another is worse than not sending it.
        </p>
      </div>
    </Modal>
  )
}

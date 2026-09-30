import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Download, HandHeart, Link2, Settings2, Trash2 } from 'lucide-react'
import {
  adminApi,
  errorMessage,
  type VolunteerForm,
  type VolunteerSignup,
  type VolunteerStatus,
} from '../lib/api'
import { ago, count, dateOnly } from '../lib/format'
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
  Stat,
  Textarea,
  Toolbar,
  type Column,
  type Tone,
} from '../components/ui'

/**
 * Volunteers: everyone who filled in the form at blorbmart.com.ng/volunteer,
 * the decision made about each of them, and the form itself.
 *
 * What the public page says is set here, not in the website's code: its
 * title, the intro line, the teams, the message after signing up, and
 * whether it is open. The page shows a form only once there are at least two
 * teams to choose between.
 *
 * The whole list is loaded once and filtered here. It is a few hundred rows
 * at most, and a reviewer flips between teams constantly — a round trip per
 * filter would make that feel like waiting.
 */

/** Where the form can be filled in by anyone. */
const PUBLIC_PAGE = 'https://www.blorbmart.com.ng/volunteer'

/** The settings as typed. Teams are one per line, which is how a list is written. */
interface FormDraft {
  title: string
  intro: string
  teams: string
  confirmation: string
  open: boolean
}

const draftOf = (form: VolunteerForm): FormDraft => ({
  title: form.title,
  intro: form.intro,
  teams: form.teams.join('\n'),
  confirmation: form.confirmation,
  open: form.open,
})

const teamsOf = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

const STATUSES: VolunteerStatus[] = ['new', 'selected', 'waitlisted', 'declined']

const STATUS_TONE: Record<VolunteerStatus, Tone> = {
  new: 'info',
  selected: 'good',
  waitlisted: 'warn',
  declined: 'bad',
}

const label = (status: string) => status[0].toUpperCase() + status.slice(1)
const yesNo = (value: boolean) => (value ? 'Yes' : 'No')

/**
 * One CSV cell. Quoted, and a leading = + - or @ is defused: these are words
 * strangers typed into a public form, and a spreadsheet would run them.
 */
const cell = (value: unknown) => {
  const text = String(value ?? '')
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

function exportCsv(rows: VolunteerSignup[]) {
  const header = [
    'Full name',
    'Phone',
    'Email',
    'Department',
    'Level',
    'First choice',
    'Second choice',
    'Team lead',
    'Both days',
    'Planning meetings',
    'Skills / experience',
    'Status',
    'Assigned team',
    'Signed up',
  ]
  const lines = rows.map((row) =>
    [
      row.fullName,
      row.phone,
      row.email,
      row.department,
      row.level,
      row.firstChoiceTeam,
      row.secondChoiceTeam,
      yesNo(row.wantsTeamLead),
      yesNo(row.availableBothDays),
      yesNo(row.availableForPlanning),
      row.experience,
      row.status,
      row.assignedTeam,
      row.createdAt ?? '',
    ]
      .map(cell)
      .join(','),
  )
  // The BOM is what makes Excel read the file as UTF-8.
  const blob = new Blob([String.fromCharCode(0xfeff) + [header.map(cell).join(','), ...lines].join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `volunteers-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function Volunteers() {
  const queryClient = useQueryClient()
  const [teamFilter, setTeamFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [detailId, setDetailId] = useState<string | null>(null)

  const [editor, setEditor] = useState<FormDraft | null>(null)

  const signups = useQuery({ queryKey: ['volunteer-signups'], queryFn: adminApi.volunteerSignups, staleTime: 15_000 })
  const form = useQuery({ queryKey: ['volunteer-form'], queryFn: adminApi.volunteerForm, staleTime: 30_000 })
  const all = useMemo(() => signups.data?.signups ?? [], [signups.data])

  // The teams on the form, then any a sign-up still carries from before the
  // list was edited: renaming a team must not orphan the people who chose it.
  const teams = useMemo(() => {
    const listed = form.data?.teams ?? []
    const inData = all
      .flatMap((row) => [row.firstChoiceTeam, row.secondChoiceTeam, row.assignedTeam])
      .filter((team) => team && !listed.includes(team))
    return [...listed, ...[...new Set(inData)].sort((a, b) => a.localeCompare(b))]
  }, [all, form.data])

  const saveForm = useMutation({
    mutationFn: (draft: FormDraft) => adminApi.saveVolunteerForm({ ...draft, teams: teamsOf(draft.teams) }),
    onSuccess: (saved) => {
      toast.success(saved.accepting ? 'Saved. The form is open.' : 'Saved. The form is not open yet.')
      queryClient.setQueryData(['volunteer-form'], saved)
      setEditor(null)
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the form settings.')),
  })

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(PUBLIC_PAGE)
      toast.success('Public link copied')
    } catch {
      // Clipboard access can be refused; the URL itself is the useful part.
      toast.error(PUBLIC_PAGE)
    }
  }

  const draftTeams = editor ? teamsOf(editor.teams) : []

  const rows = all.filter(
    (row) =>
      (statusFilter === 'all' || row.status === statusFilter) &&
      (teamFilter === 'all' ||
        [row.firstChoiceTeam, row.secondChoiceTeam, row.assignedTeam].includes(teamFilter)),
  )

  const detail = all.find((row) => row.id === detailId) ?? null

  const review = useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: VolunteerStatus; assignedTeam?: string }) =>
      adminApi.updateVolunteerSignup(id, body),
    onSuccess: (signup) => {
      toast.success(signup.assignedTeam ? `${label(signup.status)} · ${signup.assignedTeam}` : label(signup.status))
      queryClient.invalidateQueries({ queryKey: ['volunteer-signups'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the sign-up.')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteVolunteerSignup(id),
    onSuccess: () => {
      toast.success('Sign-up deleted')
      setDetailId(null)
      queryClient.invalidateQueries({ queryKey: ['volunteer-signups'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete the sign-up.')),
  })

  const columns: Column<VolunteerSignup>[] = [
    {
      key: 'person',
      header: 'Volunteer',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-bold text-ink">{row.fullName}</p>
          <p className="text-[12px] text-ink-faint">
            {row.department} · {row.level} level
          </p>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (row) => <span className="tabular">{row.phone}</span> },
    {
      key: 'teams',
      header: 'Choices',
      render: (row) => (
        <div className="min-w-0 text-[12.5px]">
          <p>{row.firstChoiceTeam}</p>
          <p className="text-ink-faint">then {row.secondChoiceTeam}</p>
        </div>
      ),
    },
    {
      key: 'flags',
      header: 'Notes',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.wantsTeamLead && <Badge tone="brand">Team lead</Badge>}
          {!row.availableBothDays && <Badge tone="warn">Not both days</Badge>}
          {!row.availableForPlanning && <Badge tone="neutral">No planning</Badge>}
        </div>
      ),
    },
    {
      key: 'assigned',
      header: 'Team',
      render: (row) => (row.assignedTeam ? row.assignedTeam : <span className="text-ink-faint">—</span>),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={STATUS_TONE[row.status]} dot>
          {row.status}
        </Badge>
      ),
    },
    { key: 'received', header: 'Signed up', render: (row) => ago(row.createdAt) },
  ]

  return (
    <>
      <PageHeader
        title="Volunteers"
        subtitle="Sign-ups from blorbmart.com.ng/volunteer, and what that page says."
        actions={
          <>
            <Button size="sm" icon={Link2} onClick={() => void copyLink()}>
              Copy link
            </Button>
            <Button size="sm" icon={Download} disabled={!rows.length} onClick={() => exportCsv(rows)}>
              Export {rows.length === all.length ? 'all' : 'these'} as CSV
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={Settings2}
              disabled={!form.data}
              onClick={() => form.data && setEditor(draftOf(form.data))}
            >
              Form settings
            </Button>
          </>
        }
      />

      {/* The one thing that stops the public page working, said where it is fixed. */}
      {form.isError ? (
        <Card className="mb-5">
          <p className="text-[13px] font-semibold text-bad">
            The form settings could not be loaded: {errorMessage(form.error)}
          </p>
        </Card>
      ) : (
        form.data &&
        !form.data.accepting && (
          <Card className="mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-bold text-ink">The public form is not taking sign-ups</p>
                <p className="mt-1 text-[13px] text-ink-faint">
                  {form.data.open
                    ? `It needs at least two teams to choose between, and has ${form.data.teams.length}. Add them in Form settings.`
                    : 'It is switched off. Turn it back on in Form settings.'}
                </p>
              </div>
              <Button size="sm" variant="primary" onClick={() => setEditor(draftOf(form.data))}>
                Open form settings
              </Button>
            </div>
          </Card>
        )
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Signed up" value={count(all.length)} icon={HandHeart} loading={signups.isLoading} />
        <Stat
          label="Not reviewed"
          value={count(all.filter((row) => row.status === 'new').length)}
          tone={all.some((row) => row.status === 'new') ? 'warn' : 'neutral'}
          loading={signups.isLoading}
          hint="Nobody has decided on these"
        />
        <Stat
          label="Selected"
          value={count(all.filter((row) => row.status === 'selected').length)}
          loading={signups.isLoading}
          hint="To add to a WhatsApp group"
        />
        <Stat
          label="Want to lead"
          value={count(all.filter((row) => row.wantsTeamLead).length)}
          loading={signups.isLoading}
          hint="Asked to be considered for team lead"
        />
      </div>

      <Toolbar className="mb-3 gap-3">
        <Select label="Team" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="w-64">
          <option value="all">Every team</option>
          {teams.map((team) => (
            <option key={team} value={team}>
              {team}
            </option>
          ))}
        </Select>
        <Select label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
          <option value="all">Any status</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {label(status)}
            </option>
          ))}
        </Select>
      </Toolbar>

      <Card bodyClassName="p-0">
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(row) => row.id}
          loading={signups.isLoading}
          error={signups.isError ? errorMessage(signups.error) : null}
          onRetry={() => signups.refetch()}
          onRowClick={(row) => setDetailId(row.id)}
          empty={
            <Empty
              icon={HandHeart}
              title={all.length ? 'Nothing matches this filter' : 'No sign-ups yet'}
              message={all.length ? undefined : 'Sign-ups sent from the volunteer page land here.'}
            />
          }
        />
      </Card>

      {/* ── What the public page says ─────────────────────────────────── */}
      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title="Form settings"
        wide
        footer={
          editor && (
            <>
              <Button onClick={() => setEditor(null)}>Cancel</Button>
              <Button
                variant="primary"
                loading={saveForm.isPending}
                disabled={editor.title.trim().length < 3 || editor.confirmation.trim().length < 3}
                onClick={() => saveForm.mutate(editor)}
              >
                Save
              </Button>
            </>
          )
        }
      >
        {editor && (
          <div className="space-y-3.5">
            <Input
              label="Page title"
              placeholder="Volunteer for Build Beyond the Classroom"
              maxLength={120}
              value={editor.title}
              onChange={(e) => setEditor({ ...editor, title: e.target.value })}
            />
            <Textarea
              label="Intro line"
              rows={3}
              maxLength={600}
              placeholder="What the event is, and what a volunteer gets out of it."
              value={editor.intro}
              onChange={(e) => setEditor({ ...editor, intro: e.target.value })}
            />
            <div>
              <Textarea
                label="Teams — one per line"
                rows={8}
                placeholder={'Logistics\nMedia\nWelfare'}
                value={editor.teams}
                onChange={(e) => setEditor({ ...editor, teams: e.target.value })}
              />
              <p className="mt-1.5 text-[12px] text-ink-faint">
                {draftTeams.length} team{draftTeams.length === 1 ? '' : 's'}, shown in both dropdowns in this order.
                {draftTeams.length < 2 && ' The form stays closed until there are at least two.'}
              </p>
            </div>
            <Textarea
              label="Message after signing up"
              rows={3}
              maxLength={600}
              placeholder="Thank you for signing up to volunteer! We will add selected volunteers to their team's WhatsApp group by Friday 10 October."
              value={editor.confirmation}
              onChange={(e) => setEditor({ ...editor, confirmation: e.target.value })}
            />
            <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-ink">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-brand"
                checked={editor.open}
                onChange={(e) => setEditor({ ...editor, open: e.target.checked })}
              />
              <span>
                <span className="font-semibold">Take sign-ups</span>
                <span className="block text-[12px] text-ink-faint">
                  Untick to close the form. The page stays up and says sign-ups are not open.
                </span>
              </span>
            </label>
            {form.data?.updatedBy && (
              <p className="text-[12px] text-ink-faint">
                Last saved by {form.data.updatedBy} · {ago(form.data.updatedAt)}
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetailId(null)}
        title={detail ? detail.fullName : 'Sign-up'}
        footer={
          detail && (
            <>
              <Button
                variant="danger"
                icon={Trash2}
                loading={remove.isPending}
                onClick={() => {
                  if (confirm(`Delete ${detail.fullName}'s sign-up? This cannot be undone.`)) remove.mutate(detail.id)
                }}
              >
                Delete
              </Button>
              <Button onClick={() => setDetailId(null)}>Close</Button>
            </>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div>
              <Detail label="Phone / WhatsApp">
                <a className="text-brand hover:underline" href={`tel:${detail.phone}`}>
                  {detail.phone}
                </a>
              </Detail>
              <Detail label="Email">
                <a className="text-brand hover:underline" href={`mailto:${detail.email}`}>
                  {detail.email}
                </a>
              </Detail>
              <Detail label="Department">
                {detail.department} · {detail.level} level
              </Detail>
              <Detail label="First choice">{detail.firstChoiceTeam}</Detail>
              <Detail label="Second choice">{detail.secondChoiceTeam}</Detail>
              <Detail label="Team lead">{yesNo(detail.wantsTeamLead)}</Detail>
              <Detail label="Both event days">{yesNo(detail.availableBothDays)}</Detail>
              <Detail label="Planning meetings">{yesNo(detail.availableForPlanning)}</Detail>
              <Detail label="Signed up">
                {dateOnly(detail.createdAt)}
                {detail.submissions > 1 && ` · filled in ${detail.submissions} times, latest answers shown`}
              </Detail>
              <Detail label="Status">
                <Badge tone={STATUS_TONE[detail.status]} dot>
                  {detail.status}
                </Badge>
              </Detail>
              {detail.reviewedBy && <Detail label="Last touched by">{detail.reviewedBy}</Detail>}
            </div>

            {detail.experience && (
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                  Skills or past volunteer experience
                </p>
                <p className="whitespace-pre-line rounded-lg border border-line bg-raised p-3 text-[13px] leading-relaxed text-ink-soft">
                  {detail.experience}
                </p>
              </div>
            )}

            <Select
              label="Put on team"
              value={detail.assignedTeam}
              disabled={review.isPending}
              onChange={(e) => review.mutate({ id: detail.id, assignedTeam: e.target.value })}
              className="w-64"
            >
              <option value="">Not assigned</option>
              {/* Their own choices first: that is where most people end up. */}
              {[detail.firstChoiceTeam, detail.secondChoiceTeam, ...teams]
                .filter((team, index, list) => team && list.indexOf(team) === index)
                .map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
            </Select>

            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Mark as</p>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.filter((status) => status !== detail.status).map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    loading={review.isPending && review.variables?.status === status}
                    onClick={() => review.mutate({ id: detail.id, status })}
                  >
                    {label(status)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

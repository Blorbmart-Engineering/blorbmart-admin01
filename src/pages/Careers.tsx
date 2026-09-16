import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Briefcase, Download, FileText, Link2, Plus, Trash2 } from 'lucide-react'
import {
  adminApi,
  errorMessage,
  type ApplicationStatus,
  type CareerApplication,
  type CareerJob,
  type CareerJobDraft,
  type EmploymentType,
  type JobStatus,
  type WorkType,
} from '../lib/api'
import { ago, count, dateOnly, text } from '../lib/format'
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
  cn,
  type Column,
} from '../components/ui'

/**
 * Careers: the roles we post, and the people who answer (FEAT-BM-004).
 *
 * Two tabs rather than two pages, because the questions an operator arrives
 * with alternate between them — "is that role still up?" and "who applied to
 * it?" — and a tab keeps both one click away.
 *
 * A role's status is a select rather than a row of buttons: draft, published
 * and closed are three states of one thing, and a select says that, while
 * Publish/Unpublish/Close buttons make an operator work out which of them is
 * currently true.
 */

const WORK_TYPES: { value: WorkType; label: string }[] = [
  { value: 'onsite', label: 'Onsite' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
]

const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'internship', label: 'Internship' },
  { value: 'contract', label: 'Contract' },
]

const JOB_STATUSES: JobStatus[] = ['draft', 'published', 'closed']
const APPLICATION_STATUSES: ApplicationStatus[] = ['new', 'reviewing', 'shortlisted', 'rejected', 'hired']

const APP_TONE: Record<ApplicationStatus, 'info' | 'warn' | 'good' | 'bad'> = {
  new: 'info',
  reviewing: 'warn',
  shortlisted: 'good',
  hired: 'good',
  rejected: 'bad',
}

/** Where a published role can be read by anyone. */
const PUBLIC_SITE = 'https://www.blorbmart.com.ng'

const labelOf = <T extends string>(list: { value: T; label: string }[], value: T) =>
  list.find((item) => item.value === value)?.label ?? value

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`

/* ─────────────────────────────── The form ────────────────────────────── */

interface Form {
  title: string
  department: string
  workType: WorkType
  location: string
  employmentType: EmploymentType
  description: string
  /** One requirement per line, which is how anybody writing them types them. */
  requirements: string
  deadline: string
}

const EMPTY_FORM: Form = {
  title: '',
  department: '',
  workType: 'onsite',
  location: '',
  employmentType: 'full_time',
  description: '',
  requirements: '',
  deadline: '',
}

const formOf = (job: CareerJob): Form => ({
  title: job.title,
  department: job.department,
  workType: job.workType,
  location: job.location,
  employmentType: job.employmentType,
  description: job.description,
  requirements: job.requirements.join('\n'),
  deadline: job.deadline ? job.deadline.slice(0, 10) : '',
})

const draftOf = (form: Form, status: JobStatus): CareerJobDraft => ({
  title: form.title.trim(),
  department: form.department.trim(),
  workType: form.workType,
  location: form.location.trim(),
  employmentType: form.employmentType,
  description: form.description.trim(),
  requirements: form.requirements
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
  deadline: form.deadline || null,
  status,
})

function Tabs({
  value,
  onChange,
  tabs,
}: {
  value: string
  onChange: (value: string) => void
  tabs: { value: string; label: string; count?: number }[]
}) {
  return (
    <div className="mb-4 inline-flex gap-1 rounded-lg border border-line bg-panel p-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          aria-pressed={value === tab.value}
          className={cn(
            'flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors',
            value === tab.value ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-raised hover:text-ink',
          )}
        >
          {tab.label}
          {tab.count != null && <span className="tabular text-[11.5px] text-ink-faint">{count(tab.count)}</span>}
        </button>
      ))}
    </div>
  )
}

/* ──────────────────────────────── Page ───────────────────────────────── */

export default function Careers() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('roles')
  const [editor, setEditor] = useState<{ job: CareerJob | null; form: Form } | null>(null)
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [detail, setDetail] = useState<CareerApplication | null>(null)

  const jobs = useQuery({ queryKey: ['career-jobs'], queryFn: adminApi.careerJobs, staleTime: 30_000 })
  const applications = useQuery({
    queryKey: ['career-applications', roleFilter, statusFilter],
    queryFn: () =>
      adminApi.careerApplications({
        jobId: roleFilter === 'all' || roleFilter === 'general' ? undefined : roleFilter,
        kind: roleFilter === 'general' ? 'general' : undefined,
        status: statusFilter,
      }),
    staleTime: 15_000,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['career-jobs'] })
    queryClient.invalidateQueries({ queryKey: ['career-applications'] })
  }

  const save = useMutation({
    mutationFn: ({ job, form, status }: { job: CareerJob | null; form: Form; status: JobStatus }) =>
      job ? adminApi.updateCareerJob(job.id, draftOf(form, status)) : adminApi.createCareerJob(draftOf(form, status)),
    onSuccess: (job) => {
      toast.success(job.status === 'published' ? 'Role is live' : 'Saved as a draft')
      setEditor(null)
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the role.')),
  })

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: JobStatus }) => adminApi.updateCareerJob(id, { status }),
    onSuccess: (job) => {
      toast.success(
        job.status === 'published' ? 'Role is live' : job.status === 'closed' ? 'Role closed' : 'Role unpublished',
      )
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not change the status.')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteCareerJob(id),
    onSuccess: () => {
      toast.success('Draft deleted')
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete the role.')),
  })

  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApplicationStatus }) =>
      adminApi.setApplicationStatus(id, status),
    onSuccess: (application) => {
      toast.success(`Marked ${application.status}`)
      setDetail((current) => (current?.id === application.id ? application : current))
      queryClient.invalidateQueries({ queryKey: ['career-applications'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the application.')),
  })

  const download = useMutation({
    mutationFn: (application: CareerApplication) => adminApi.downloadCv(application),
    onError: (error) => toast.error(errorMessage(error, 'Could not download the CV.')),
  })

  const rows = jobs.data?.jobs ?? []
  const apps = applications.data?.applications ?? []
  const open = rows.filter((job) => job.open)
  const drafts = rows.filter((job) => job.status === 'draft')

  const copyLink = async (job: CareerJob) => {
    const url = `${PUBLIC_SITE}/careers/${job.id}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Public link copied')
    } catch {
      // Clipboard access can be refused; the URL itself is the useful part.
      toast.error(url)
    }
  }

  const jobColumns: Column<CareerJob>[] = [
    {
      key: 'role',
      header: 'Role',
      render: (job) => (
        <div className="min-w-0">
          <p className="font-bold text-ink">{job.title}</p>
          <p className="text-[12px] text-ink-faint">{job.department}</p>
        </div>
      ),
    },
    {
      key: 'shape',
      header: 'Type',
      render: (job) => (
        <span className="text-[12.5px]">
          {labelOf(WORK_TYPES, job.workType)} · {labelOf(EMPLOYMENT_TYPES, job.employmentType)}
        </span>
      ),
    },
    { key: 'location', header: 'Location', render: (job) => text(job.location) },
    {
      key: 'status',
      header: 'Status',
      render: (job) => (
        <div className="flex items-center gap-2">
          <Select
            value={job.status}
            aria-label={`Status of ${job.title}`}
            onChange={(e) => setStatus.mutate({ id: job.id, status: e.target.value as JobStatus })}
            className="w-32"
          >
            {JOB_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status === 'draft' ? 'Draft' : status === 'published' ? 'Published' : 'Closed'}
              </option>
            ))}
          </Select>
          {/* Published but past its deadline: live in the database, gone from
              the site. Worth saying out loud on this screen. */}
          {job.status === 'published' && !job.open && <Badge tone="warn">Deadline passed</Badge>}
        </div>
      ),
    },
    { key: 'posted', header: 'Posted', render: (job) => (job.postedAt ? dateOnly(job.postedAt) : '—') },
    { key: 'deadline', header: 'Closes', render: (job) => (job.deadline ? dateOnly(job.deadline) : 'Open-ended') },
    {
      key: 'applications',
      header: 'Applied',
      align: 'right',
      render: (job) =>
        job.applicationCount > 0 ? (
          <button
            className="font-semibold text-brand hover:underline"
            onClick={() => {
              setRoleFilter(job.id)
              setStatusFilter('all')
              setTab('applications')
            }}
          >
            {count(job.applicationCount)}
          </button>
        ) : (
          <span className="text-ink-faint">0</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (job) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setEditor({ job, form: formOf(job) })}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Link2}
            aria-label={`Copy the public link to ${job.title}`}
            onClick={() => void copyLink(job)}
          >
            {''}
          </Button>
          {job.status === 'draft' && job.applicationCount === 0 && (
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              aria-label={`Delete the draft ${job.title}`}
              onClick={() => {
                if (confirm(`Delete the draft "${job.title}"? This cannot be undone.`)) remove.mutate(job.id)
              }}
            >
              {''}
            </Button>
          )}
        </div>
      ),
    },
  ]

  const appColumns: Column<CareerApplication>[] = [
    {
      key: 'candidate',
      header: 'Candidate',
      render: (application) => (
        <div className="min-w-0">
          <p className="font-bold text-ink">{application.name}</p>
          <p className="text-[12px] text-ink-faint">{application.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Applied for',
      render: (application) =>
        application.kind === 'role' ? (
          <span className="text-[12.5px]">{text(application.jobTitle)}</span>
        ) : (
          <span className="text-[12.5px]">
            <Badge tone="neutral">General</Badge>
            {application.areaOfInterest && <span className="ml-2 text-ink-faint">{application.areaOfInterest}</span>}
          </span>
        ),
    },
    { key: 'received', header: 'Received', render: (application) => ago(application.createdAt) },
    {
      key: 'status',
      header: 'Status',
      render: (application) => (
        <Select
          value={application.status}
          aria-label={`Status of ${application.name}`}
          onChange={(e) => review.mutate({ id: application.id, status: e.target.value as ApplicationStatus })}
          className="w-36"
        >
          {APPLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status[0].toUpperCase() + status.slice(1)}
            </option>
          ))}
        </Select>
      ),
    },
    {
      key: 'cv',
      header: '',
      align: 'right',
      render: (application) => (
        <Button
          size="sm"
          variant="ghost"
          icon={Download}
          disabled={!application.cv || download.isPending}
          onClick={() => download.mutate(application)}
        >
          CV
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Careers"
        subtitle="Job postings on blorbmart.com.ng/careers, and everyone who has applied."
        actions={
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditor({ job: null, form: EMPTY_FORM })}>
            New role
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open roles" value={count(open.length)} icon={Briefcase} loading={jobs.isLoading} hint="Live on the website" />
        <Stat label="Drafts" value={count(drafts.length)} loading={jobs.isLoading} hint="Not visible to anyone yet" />
        <Stat
          label="New applications"
          value={count(apps.filter((a) => a.status === 'new').length)}
          tone={apps.some((a) => a.status === 'new') ? 'warn' : 'neutral'}
          loading={applications.isLoading}
          hint="Nobody has looked at these"
        />
        <Stat
          label="General CVs"
          value={count(apps.filter((a) => a.kind === 'general').length)}
          icon={FileText}
          loading={applications.isLoading}
          hint="Sent without a role"
        />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'roles', label: 'Roles', count: rows.length },
          { value: 'applications', label: 'Applications', count: apps.length },
        ]}
      />

      {tab === 'roles' ? (
        <Card bodyClassName="p-0">
          <DataTable
            columns={jobColumns}
            rows={rows}
            keyOf={(job) => job.id}
            loading={jobs.isLoading}
            error={jobs.isError ? errorMessage(jobs.error) : null}
            onRetry={() => jobs.refetch()}
            empty={
              <Empty
                icon={Briefcase}
                title="No roles yet"
                message="Post one and it appears on the careers page as soon as you publish it."
                action={
                  <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditor({ job: null, form: EMPTY_FORM })}>
                    New role
                  </Button>
                }
              />
            }
          />
        </Card>
      ) : (
        <>
          <Toolbar className="mb-3 gap-3">
            <Select label="Role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-64">
              <option value="all">All applications</option>
              <option value="general">General CVs only</option>
              {rows.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </Select>
            <Select label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
              <option value="all">Any status</option>
              {APPLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status[0].toUpperCase() + status.slice(1)}
                </option>
              ))}
            </Select>
          </Toolbar>

          <Card bodyClassName="p-0">
            <DataTable
              columns={appColumns}
              rows={apps}
              keyOf={(application) => application.id}
              loading={applications.isLoading}
              error={applications.isError ? errorMessage(applications.error) : null}
              onRetry={() => applications.refetch()}
              onRowClick={setDetail}
              empty={
                <Empty
                  icon={FileText}
                  title="No applications yet"
                  message={
                    roleFilter === 'all'
                      ? 'Applications sent from the careers page land here, with the CV attached.'
                      : 'Nothing matches this filter.'
                  }
                />
              }
            />
          </Card>
        </>
      )}

      {/* ── The role editor ───────────────────────────────────────────── */}
      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.job ? `Edit ${editor.job.title}` : 'New role'}
        wide
        footer={
          editor && (
            <>
              <Button onClick={() => setEditor(null)}>Cancel</Button>
              {/* A draft is the safe default: a half-written role should not
                  be one accidental click from the public site. */}
              <Button
                loading={save.isPending && save.variables?.status !== 'published'}
                disabled={!editor.form.title.trim() || save.isPending}
                onClick={() => save.mutate({ job: editor.job, form: editor.form, status: 'draft' })}
              >
                Save draft
              </Button>
              <Button
                variant="primary"
                loading={save.isPending && save.variables?.status === 'published'}
                disabled={!editor.form.title.trim() || save.isPending}
                onClick={() => save.mutate({ job: editor.job, form: editor.form, status: 'published' })}
              >
                {editor.job?.status === 'published' ? 'Save & keep live' : 'Publish'}
              </Button>
            </>
          )
        }
      >
        {editor && (
          <div className="space-y-3.5">
            <Toolbar className="gap-3">
              <Input
                label="Job title"
                placeholder="Backend Engineer"
                value={editor.form.title}
                onChange={(e) => setEditor({ ...editor, form: { ...editor.form, title: e.target.value } })}
                className="w-72"
              />
              <Input
                label="Team or department"
                placeholder="Engineering"
                value={editor.form.department}
                onChange={(e) => setEditor({ ...editor, form: { ...editor.form, department: e.target.value } })}
                className="w-56"
              />
            </Toolbar>

            <Toolbar className="gap-3">
              <Select
                label="Work type"
                value={editor.form.workType}
                onChange={(e) => setEditor({ ...editor, form: { ...editor.form, workType: e.target.value as WorkType } })}
                className="w-40"
              >
                {WORK_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
              <Input
                label={editor.form.workType === 'remote' ? 'Location (optional)' : 'Location'}
                placeholder={editor.form.workType === 'remote' ? 'Remote' : 'Osogbo'}
                value={editor.form.location}
                onChange={(e) => setEditor({ ...editor, form: { ...editor.form, location: e.target.value } })}
                className="w-56"
              />
              <Select
                label="Employment"
                value={editor.form.employmentType}
                onChange={(e) =>
                  setEditor({ ...editor, form: { ...editor.form, employmentType: e.target.value as EmploymentType } })
                }
                className="w-44"
              >
                {EMPLOYMENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
              <Input
                label="Application deadline"
                type="date"
                value={editor.form.deadline}
                onChange={(e) => setEditor({ ...editor, form: { ...editor.form, deadline: e.target.value } })}
                className="w-44"
              />
            </Toolbar>

            <Textarea
              label="About the role"
              rows={7}
              placeholder="What the person will do, who they work with, and what a good month looks like."
              value={editor.form.description}
              onChange={(e) => setEditor({ ...editor, form: { ...editor.form, description: e.target.value } })}
            />
            <Textarea
              label="Requirements — one per line"
              rows={5}
              placeholder={'Two years with Node.js\nComfortable owning a service end to end'}
              value={editor.form.requirements}
              onChange={(e) => setEditor({ ...editor, form: { ...editor.form, requirements: e.target.value } })}
            />
            {editor.job && (
              <p className="text-[12px] text-ink-faint">
                Created by {text(editor.job.createdBy)} · last edited {ago(editor.job.updatedAt)}
                {editor.job.applicationCount > 0 && ` · ${count(editor.job.applicationCount)} applied`}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* ── One application ───────────────────────────────────────────── */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? detail.name : 'Application'}
        footer={
          detail && (
            <>
              <Button onClick={() => setDetail(null)}>Close</Button>
              <Button
                variant="primary"
                icon={Download}
                disabled={!detail.cv || download.isPending}
                onClick={() => download.mutate(detail)}
              >
                Download CV
              </Button>
            </>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div>
              <Detail label="Email">
                <a className="text-brand hover:underline" href={`mailto:${detail.email}`}>
                  {detail.email}
                </a>
              </Detail>
              <Detail label="Phone">
                {detail.phone ? (
                  <a className="text-brand hover:underline" href={`tel:${detail.phone}`}>
                    {detail.phone}
                  </a>
                ) : (
                  '—'
                )}
              </Detail>
              <Detail label="Applied for">
                {detail.kind === 'role' ? text(detail.jobTitle) : `General — ${text(detail.areaOfInterest, 'no area given')}`}
              </Detail>
              <Detail label="Received">{dateOnly(detail.createdAt)}</Detail>
              <Detail label="CV">{detail.cv ? `${detail.cv.fileName} · ${kb(detail.cv.size)}` : 'None attached'}</Detail>
              <Detail label="Status">
                <Badge tone={APP_TONE[detail.status]} dot>
                  {detail.status}
                </Badge>
              </Detail>
              {detail.reviewedBy && <Detail label="Last touched by">{detail.reviewedBy}</Detail>}
            </div>

            {detail.note && (
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Their note</p>
                <p className="whitespace-pre-line rounded-lg border border-line bg-raised p-3 text-[13px] leading-relaxed text-ink-soft">
                  {detail.note}
                </p>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Move to</p>
              <div className="flex flex-wrap gap-1.5">
                {APPLICATION_STATUSES.filter((status) => status !== detail.status).map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    loading={review.isPending && review.variables?.status === status}
                    onClick={() => review.mutate({ id: detail.id, status })}
                  >
                    {status[0].toUpperCase() + status.slice(1)}
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

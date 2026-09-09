import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CalendarDays, Plus, Ticket, Trash2, Users } from 'lucide-react'
import {
  adminApi,
  errorMessage,
  type BlorbEvent,
  type EventDraft,
  type EventTicket,
} from '../lib/api'
import { count, dateTime, money, text, titleCase } from '../lib/format'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Empty,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
  Toolbar,
  type Column,
  type Tone,
} from '../components/ui'

/*
 * ────────────────────────────────────────────────────────────────────────────
 * Events.
 *
 * Blorbmart runs its own events — the fresher's party, the careers fair, the
 * matriculation show — as well as hosting organizers who run theirs from the
 * vendor app. This page is the first half of that: staff can create, edit,
 * publish, cancel and check the door on any event on the platform.
 *
 * It writes through the same `eventsService` the organizer app writes through,
 * with only the organizer-ownership check lifted. That is deliberate: tickets
 * bought from an event created here are reserved, priced, issued, signed and
 * scanned by exactly the same code as everyone else's, so there is no second
 * events implementation to keep in step — and no way for an admin-created
 * event to behave subtly differently at the door.
 * ────────────────────────────────────────────────────────────────────────────
 */

const CATEGORIES = ['general', 'party', 'concert', 'sports', 'faith', 'academic', 'career']

const STATUS_TONE: Record<BlorbEvent['status'], Tone> = {
  draft: 'neutral',
  published: 'good',
  cancelled: 'bad',
}

type TierDraft = EventDraft['ticketTypes'][number]

interface FormState extends Omit<EventDraft, 'ticketTypes'> {
  ticketTypes: TierDraft[]
}

/** Declared outside the component so the row type is fixed rather than
 *  inferred from whatever the query happens to have returned yet. */
const ATTENDEE_COLUMNS: Column<EventTicket>[] = [
  { key: 'holder', header: 'Attendee', render: (t) => text(t.holderName) },
  { key: 'phone', header: 'Phone', render: (t) => text(t.holderPhone) },
  { key: 'tier', header: 'Ticket', render: (t) => text(t.ticketTypeName) },
  { key: 'price', header: 'Paid', align: 'right', render: (t) => money(t.price) },
  {
    key: 'status',
    header: 'Status',
    render: (t) => (
      <Badge tone={t.status === 'used' ? 'neutral' : 'good'} dot>
        {t.status === 'used' ? 'Checked in' : 'Valid'}
      </Badge>
    ),
  },
]

const emptyTier = (): TierDraft => ({
  name: '',
  description: '',
  price: 0,
  quantity: 0,
  maxPerOrder: 0,
})

const emptyForm = (): FormState => ({
  title: '',
  description: '',
  category: 'general',
  coverUrl: '',
  venueName: '',
  venueAddress: '',
  city: '',
  startsAt: '',
  endsAt: '',
  organizerName: 'Blorbmart',
  status: 'draft',
  ticketTypes: [emptyTier()],
})

/**
 * `datetime-local` has no timezone, and `new Date('2026-09-20T18:00')` on the
 * server would be read as 18:00 *there* — which on a cloud host is UTC. So the
 * conversion to a fully-qualified instant happens here, on the machine that
 * knows what the person meant.
 */
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`
}

const fromLocalInput = (value: string) => {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

const formFor = (event: BlorbEvent): FormState => ({
  title: event.title,
  description: event.description,
  category: event.category || 'general',
  coverUrl: event.coverUrl,
  venueName: event.venueName,
  venueAddress: event.venueAddress,
  city: event.city,
  startsAt: toLocalInput(event.startsAt),
  endsAt: toLocalInput(event.endsAt),
  organizerName: event.organizerName || 'Blorbmart',
  status: event.status,
  // Ids are carried back so the service can match tiers across the edit and
  // keep their `sold` counts. Dropping them would reset every count to zero.
  ticketTypes: event.ticketTypes.length
    ? event.ticketTypes.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        price: t.price,
        quantity: t.quantity,
        maxPerOrder: t.maxPerOrder,
      }))
    : [emptyTier()],
})

export default function Events() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('all')
  const [editing, setEditing] = useState<BlorbEvent | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [attendeesFor, setAttendeesFor] = useState<BlorbEvent | null>(null)

  const events = useQuery({
    queryKey: ['admin-events'],
    queryFn: () => adminApi.events({ limit: 100 }),
    staleTime: 30_000,
  })

  const rows = useMemo(() => {
    const all = events.data?.events ?? []
    return status === 'all' ? all : all.filter((e) => e.status === status)
  }, [events.data, status])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-events'] })

  const save = useMutation({
    mutationFn: (payload: { id: string | null; draft: EventDraft }) =>
      payload.id ? adminApi.updateEvent(payload.id, payload.draft) : adminApi.createEvent(payload.draft),
    onSuccess: (saved) => {
      toast.success(`"${saved.title}" saved`)
      invalidate()
      closeEditor()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save that event.')),
  })

  const setStatusFor = useMutation({
    mutationFn: (payload: { id: string; status: BlorbEvent['status'] }) =>
      adminApi.setEventStatus(payload.id, payload.status),
    onSuccess: (saved) => {
      toast.success(`"${saved.title}" is now ${saved.status}`)
      invalidate()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update that event.')),
  })

  const attendees = useQuery({
    queryKey: ['admin-event-attendees', attendeesFor?.id],
    queryFn: () => adminApi.eventAttendees(attendeesFor!.id),
    enabled: Boolean(attendeesFor),
  })

  const openNew = () => {
    setEditing(null)
    setForm(emptyForm())
  }

  const openEdit = (event: BlorbEvent) => {
    setEditing(event)
    setForm(formFor(event))
  }

  const closeEditor = () => {
    setEditing(null)
    setForm(null)
  }

  const patch = (changes: Partial<FormState>) =>
    setForm((current) => (current ? { ...current, ...changes } : current))

  const patchTier = (index: number, changes: Partial<TierDraft>) =>
    setForm((current) =>
      current
        ? {
            ...current,
            ticketTypes: current.ticketTypes.map((t, i) => (i === index ? { ...t, ...changes } : t)),
          }
        : current,
    )

  const tiersValid = (form?.ticketTypes ?? []).some((t) => t.name.trim().length > 0)
  const canSave = Boolean(
    form && form.title.trim().length >= 3 && form.startsAt && tiersValid && !save.isPending,
  )

  const submit = () => {
    if (!form) return

    const startsAt = fromLocalInput(form.startsAt)
    if (!startsAt) return toast.error('Set a valid start date and time.')

    const endsAt = form.endsAt ? fromLocalInput(form.endsAt) : null
    if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
      return toast.error('The end time has to be after the start time.')
    }

    const ticketTypes = form.ticketTypes
      .filter((t) => t.name.trim().length > 0)
      .map((t) => ({
        ...(t.id ? { id: t.id } : {}),
        name: t.name.trim(),
        description: t.description.trim(),
        price: Math.max(0, Number(t.price) || 0),
        quantity: Math.max(0, Math.floor(Number(t.quantity) || 0)),
        maxPerOrder: Math.max(0, Math.floor(Number(t.maxPerOrder) || 0)),
      }))

    if (!ticketTypes.length) return toast.error('Add at least one ticket type, even a free one.')

    save.mutate({
      id: editing?.id ?? null,
      draft: { ...form, startsAt, endsAt, ticketTypes },
    })
  }

  const columns: Column<BlorbEvent>[] = [
    {
      key: 'title',
      header: 'Event',
      render: (e) => (
        <div className="min-w-0">
          <div className="truncate font-bold text-ink">{text(e.title)}</div>
          <div className="truncate text-[12px] text-ink-faint">
            {[titleCase(e.category), e.organizerName].filter(Boolean).join(' · ')}
          </div>
        </div>
      ),
    },
    {
      key: 'when',
      header: 'Starts',
      render: (e) => (e.startsAt ? dateTime(e.startsAt) : '—'),
    },
    {
      key: 'where',
      header: 'Venue',
      render: (e) => text([e.venueName, e.city].filter(Boolean).join(', ')),
    },
    {
      key: 'sold',
      header: 'Sold',
      align: 'right',
      render: (e) => (
        <span className="tabular-nums">
          {count(e.totalSold)}
          {e.totalCapacity > 0 ? ` / ${count(e.totalCapacity)}` : ''}
        </span>
      ),
    },
    {
      key: 'price',
      header: 'From',
      align: 'right',
      render: (e) => {
        if (!e.ticketTypes.length) return '—'
        const cheapest = Math.min(...e.ticketTypes.map((t) => t.price))
        return cheapest === 0 ? 'Free' : money(cheapest)
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (e) => (
        <Badge tone={STATUS_TONE[e.status]} dot>
          {titleCase(e.status)}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (e) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" icon={Users} onClick={() => setAttendeesFor(e)}>
            Door
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openEdit(e)}>
            Edit
          </Button>
          {e.status === 'published' ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setStatusFor.mutate({ id: e.id, status: 'draft' })}
            >
              Unpublish
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setStatusFor.mutate({ id: e.id, status: 'published' })}
            >
              Publish
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="Create and run ticketed events across the platform."
        actions={
          <Toolbar className="gap-2">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
              <option value="all">All statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Button size="sm" variant="primary" icon={Plus} onClick={openNew}>
              New event
            </Button>
          </Toolbar>
        }
      />

      <Card bodyClassName="p-0">
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(e) => e.id}
          loading={events.isLoading}
          error={events.isError ? errorMessage(events.error) : null}
          onRetry={() => events.refetch()}
          empty={
            <Empty
              icon={CalendarDays}
              title="No events yet"
              message="Create one to start selling tickets."
              action={
                <Button size="sm" variant="primary" icon={Plus} onClick={openNew}>
                  New event
                </Button>
              }
            />
          }
        />
      </Card>

      {/* ── Editor ─────────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(form)}
        onClose={closeEditor}
        wide
        title={editing ? `Edit "${editing.title}"` : 'New event'}
        footer={
          <>
            <Button onClick={closeEditor}>Cancel</Button>
            <Button variant="primary" loading={save.isPending} disabled={!canSave} onClick={submit}>
              {editing ? 'Save changes' : 'Create event'}
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-3.5">
            <Input
              label="Title"
              placeholder="Freshers' Night 2026"
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
            <Textarea
              label="Description"
              placeholder="What is happening, who is playing, what to bring."
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
            <Toolbar className="gap-3">
              <Select
                label="Category"
                value={form.category}
                onChange={(e) => patch({ category: e.target.value })}
                className="w-44"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {titleCase(c)}
                  </option>
                ))}
              </Select>
              <Input
                label="Organizer shown to buyers"
                value={form.organizerName}
                onChange={(e) => patch({ organizerName: e.target.value })}
                className="w-56"
              />
            </Toolbar>
            <Input
              label="Cover image URL"
              placeholder="https://…"
              value={form.coverUrl}
              onChange={(e) => patch({ coverUrl: e.target.value })}
            />
            <Toolbar className="gap-3">
              <Input
                label="Starts"
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => patch({ startsAt: e.target.value })}
                className="w-56"
              />
              <Input
                label="Ends (optional)"
                type="datetime-local"
                value={form.endsAt ?? ''}
                onChange={(e) => patch({ endsAt: e.target.value })}
                className="w-56"
              />
            </Toolbar>
            <Toolbar className="gap-3">
              <Input
                label="Venue"
                placeholder="Main Auditorium"
                value={form.venueName}
                onChange={(e) => patch({ venueName: e.target.value })}
                className="w-56"
              />
              <Input
                label="City"
                placeholder="Osogbo"
                value={form.city}
                onChange={(e) => patch({ city: e.target.value })}
                className="w-44"
              />
            </Toolbar>
            <Input
              label="Address"
              placeholder="Street and landmark riders and guests can find"
              value={form.venueAddress}
              onChange={(e) => patch({ venueAddress: e.target.value })}
            />

            <div className="space-y-2 rounded-lg border border-line-soft p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                  Ticket types
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Plus}
                  onClick={() =>
                    patch({ ticketTypes: [...form.ticketTypes, emptyTier()] })
                  }
                >
                  Add tier
                </Button>
              </div>

              {form.ticketTypes.map((tier, i) => (
                <div key={tier.id ?? `new-${i}`} className="space-y-2 border-t border-line-soft pt-2.5">
                  <Toolbar className="gap-3">
                    <Input
                      label="Name"
                      placeholder="Regular"
                      value={tier.name}
                      onChange={(e) => patchTier(i, { name: e.target.value })}
                      className="w-44"
                    />
                    <Input
                      label="Price (₦, 0 = free)"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={String(tier.price)}
                      onChange={(e) => patchTier(i, { price: Number(e.target.value) || 0 })}
                      className="w-40"
                    />
                    <Input
                      label="Quantity (0 = unlimited)"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={String(tier.quantity)}
                      onChange={(e) => patchTier(i, { quantity: Number(e.target.value) || 0 })}
                      className="w-48"
                    />
                    <Input
                      label="Max per order"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={String(tier.maxPerOrder)}
                      onChange={(e) => patchTier(i, { maxPerOrder: Number(e.target.value) || 0 })}
                      className="w-36"
                    />
                    {form.ticketTypes.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Trash2}
                        aria-label={`Remove ${tier.name || 'tier'}`}
                        onClick={() =>
                          patch({ ticketTypes: form.ticketTypes.filter((_, j) => j !== i) })
                        }
                      >
                        {''}
                      </Button>
                    )}
                  </Toolbar>
                  {/* Removing a tier that has already sold would strand its
                      holders, so the count is shown next to the delete. */}
                  {editing?.ticketTypes.find((t) => t.id === tier.id)?.sold ? (
                    <p className="text-[11.5px] text-warn">
                      {count(editing.ticketTypes.find((t) => t.id === tier.id)?.sold)} already sold on
                      this tier. Removing it does not cancel those tickets.
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            <p className="text-[11.5px] text-ink-faint">
              New events are saved as a draft. Publish from the list when the details are final —
              a published event is a public page anyone with the link can open.
            </p>
          </div>
        )}
      </Modal>

      {/* ── Door / attendees ───────────────────────────────────────────── */}
      <Modal
        open={Boolean(attendeesFor)}
        onClose={() => setAttendeesFor(null)}
        wide
        title={attendeesFor ? `Door — ${attendeesFor.title}` : 'Door'}
        footer={<Button onClick={() => setAttendeesFor(null)}>Close</Button>}
      >
        <div className="space-y-3">
          <Toolbar className="gap-4 text-[13px]">
            <span className="text-ink-faint">
              Checked in: <strong className="text-ink">{count(attendees.data?.checkedIn ?? 0)}</strong>
            </span>
            <span className="text-ink-faint">
              Tickets issued: <strong className="text-ink">{count(attendees.data?.total ?? 0)}</strong>
            </span>
          </Toolbar>

          <DataTable
            columns={ATTENDEE_COLUMNS}
            rows={attendees.data?.tickets ?? []}
            keyOf={(t) => t.id}
            loading={attendees.isLoading}
            error={attendees.isError ? errorMessage(attendees.error) : null}
            onRetry={() => attendees.refetch()}
            empty={
              <Empty
                icon={Ticket}
                title="No tickets yet"
                message="Nobody has bought a ticket to this event."
              />
            }
          />
        </div>
      </Modal>
    </>
  )
}

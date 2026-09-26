import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  BellRing,
  Eye,
  ImagePlus,
  MonitorSmartphone,
  MousePointerClick,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import {
  adminApi,
  announcementsApi,
  errorMessage,
  type Announcement,
  type AnnouncementInput,
  type CampusRecord,
  type PopupFrequency,
  type PopupState,
} from '../lib/api'
import { toCompressedDataUrl } from '../lib/image'
import { count, dateTime } from '../lib/format'
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
  Toolbar,
  cn,
  type Tone,
} from '../components/ui'

/**
 * In-app pop-ups: a flyer buyers see when they open the app.
 *
 * The flyer is designed elsewhere and uploaded whole, so the server resizes
 * it but never crops it. Headline, note and button are optional extras under
 * the image; a flyer that already says everything can go up on its own.
 *
 * "How often" is kept on each phone, not on the server — the apps remember
 * what they have shown. That is why editing a live pop-up asks whether to show
 * it again: without that, somebody who dismissed the old wording never sees
 * the correction.
 */

const FREQUENCY_LABEL: Record<PopupFrequency, string> = {
  once: 'Once per person',
  daily: 'Once a day',
  every_open: 'Every time the app opens',
}

const STATE: Record<PopupState, { label: string; tone: Tone }> = {
  live: { label: 'Live', tone: 'good' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  ended: { label: 'Ended', tone: 'neutral' },
  paused: { label: 'Paused', tone: 'warn' },
}

/** Screens the buyer apps know how to open from a button. */
const LINK_PRESETS: { value: string; label: string }[] = [
  { value: '', label: 'No button' },
  { value: '/home', label: 'Home' },
  { value: '/hub/restaurants', label: 'Restaurants' },
  { value: '/hub/pharmacy', label: 'Pharmacy' },
  { value: '/bills', label: 'Bills' },
  { value: '/events', label: 'Events' },
  { value: '/gifts', label: 'Gift cards' },
  { value: '/wallet', label: 'Wallet' },
  { value: 'market', label: 'Local market (pick a campus)' },
  { value: 'custom', label: 'Another screen or website…' },
]

const toLocalInput = (ms: number | null) => {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const fromLocalInput = (value: string) => (value ? new Date(value).getTime() : null)

export default function Announcements() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null)
  const [removing, setRemoving] = useState<Announcement | null>(null)
  const [notifying, setNotifying] = useState<Announcement | null>(null)

  const list = useQuery({ queryKey: ['announcements'], queryFn: announcementsApi.list, staleTime: 30_000 })
  const campuses = useQuery({ queryKey: ['campuses-manage'], queryFn: adminApi.manageCampuses, staleTime: 300_000 })
  const campusName = useMemo(() => {
    const map = new Map((campuses.data?.campuses ?? []).map((c) => [c.id, c.shortName || c.name]))
    return (id: string | null) => (id ? map.get(id) ?? id : 'Every campus')
  }, [campuses.data])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['announcements'] })

  const toggle = useMutation({
    mutationFn: (a: Announcement) => announcementsApi.update(a.id, { active: !a.active }),
    onSuccess: (a) => {
      toast.success(a.active ? 'Pop-up resumed' : 'Pop-up paused')
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not change the pop-up.')),
  })

  const items = list.data?.announcements ?? []

  return (
    <>
      <PageHeader
        title="In-app pop-ups"
        subtitle="Flyers buyers see when they open the app. Optionally send a push notification to bring them in."
        actions={
          <Toolbar>
            <Button size="sm" icon={RefreshCw} loading={list.isFetching} onClick={() => list.refetch()}>
              Refresh
            </Button>
            <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing('new')}>
              New pop-up
            </Button>
          </Toolbar>
        }
      />

      {list.isError ? (
        <Card>
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        </Card>
      ) : list.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : !items.length ? (
        <Card>
          <Empty
            icon={MonitorSmartphone}
            title="No pop-ups yet"
            message="Upload a flyer and it will greet buyers the next time they open the app."
            action={
              <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing('new')}>
                Create the first one
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((a) => {
            const state = STATE[a.state]
            const ctr = a.stats.views ? Math.round((a.stats.clicks / a.stats.views) * 100) : 0
            return (
              <div key={a.id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-panel">
                <div className="relative aspect-[4/3] bg-surface-sunk">
                  {a.imageUrl ? (
                    <img src={a.imageUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
                  ) : (
                    <div className="grid h-full place-items-center px-6 text-center text-[15px] font-bold text-ink">
                      {a.title}
                    </div>
                  )}
                  <div className="absolute left-2 top-2">
                    <Badge tone={state.tone} dot>
                      {state.label}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-3.5">
                  <p className="truncate text-[14px] font-bold text-ink">{a.title || 'Flyer only'}</p>
                  <p className="mt-0.5 text-[12px] text-ink-faint">
                    {campusName(a.campusId)} · {FREQUENCY_LABEL[a.frequency]}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-faint">
                    {a.startsAt ? `From ${dateTime(a.startsAt)}` : 'From now'}
                    {a.endsAt ? ` until ${dateTime(a.endsAt)}` : ', no end date'}
                  </p>

                  <div className="mt-2.5 flex flex-wrap gap-3 text-[12px] text-ink-soft">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" aria-hidden /> {count(a.stats.views)} seen
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MousePointerClick className="h-3.5 w-3.5" aria-hidden /> {count(a.stats.clicks)} taps
                      {a.stats.views > 0 && ` (${ctr}%)`}
                    </span>
                    {a.push && (
                      <span className="inline-flex items-center gap-1">
                        <BellRing className="h-3.5 w-3.5" aria-hidden /> pushed {dateTime(a.push.sentAt)}
                      </span>
                    )}
                  </div>

                  <div className="mt-auto flex flex-wrap justify-end gap-1 pt-3">
                    {a.state === 'live' && (
                      <Button size="sm" variant="ghost" icon={BellRing} onClick={() => setNotifying(a)}>
                        Notify
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={a.active ? Pause : Play}
                      loading={toggle.isPending && toggle.variables?.id === a.id}
                      onClick={() => toggle.mutate(a)}
                    >
                      {a.active ? 'Pause' : 'Resume'}
                    </Button>
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(a)} aria-label="Edit" />
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setRemoving(a)} aria-label="Delete" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <Editor
          existing={editing === 'new' ? null : editing}
          campuses={campuses.data?.campuses ?? []}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {notifying && <NotifyDialog announcement={notifying} onClose={() => setNotifying(null)} onDone={refresh} />}
      {removing && <DeleteDialog announcement={removing} onClose={() => setRemoving(null)} onDone={refresh} />}
    </>
  )
}

/* ─────────────────────────────── Editor ─────────────────────────────── */

function Editor({
  existing,
  campuses,
  onClose,
  onSaved,
}: {
  existing: Announcement | null
  campuses: CampusRecord[]
  onClose: () => void
  onSaved: () => void
}) {
  const initialPreset = (() => {
    const link = existing?.ctaLink ?? ''
    if (!link) return ''
    if (link.startsWith('/r/market_')) return 'market'
    return LINK_PRESETS.some((p) => p.value === link) ? link : 'custom'
  })()

  const [title, setTitle] = useState(existing?.title ?? '')
  const [body, setBody] = useState(existing?.body ?? '')
  const [ctaLabel, setCtaLabel] = useState(existing?.ctaLabel ?? '')
  const [preset, setPreset] = useState(initialPreset)
  const [customLink, setCustomLink] = useState(initialPreset === 'custom' ? existing?.ctaLink ?? '' : '')
  const [campusId, setCampusId] = useState(existing?.campusId ?? '')
  const [frequency, setFrequency] = useState<PopupFrequency>(existing?.frequency ?? 'once')
  const [startsAt, setStartsAt] = useState(toLocalInput(existing?.startsAt ?? null))
  const [endsAt, setEndsAt] = useState(toLocalInput(existing?.endsAt ?? null))
  const [important, setImportant] = useState((existing?.priority ?? 0) > 0)
  const [image, setImage] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [push, setPush] = useState(false)
  const [inbox, setInbox] = useState(false)
  const [showAgain, setShowAgain] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const link =
    preset === 'custom'
      ? customLink.trim()
      : preset === 'market'
        ? campusId
          ? `/r/market_${campusId}`
          : ''
        : preset

  const shownImage = image ?? (removeImage ? '' : existing?.imageUrl ?? '')
  const startsLater = (fromLocalInput(startsAt) ?? 0) > Date.now()

  const contentChanged =
    !!existing &&
    (title !== existing.title ||
      body !== existing.body ||
      ctaLabel !== existing.ctaLabel ||
      link !== existing.ctaLink ||
      !!image ||
      removeImage)

  const save = useMutation({
    mutationFn: async () => {
      const input: AnnouncementInput = {
        title: title.trim(),
        body: body.trim(),
        ctaLabel: link ? ctaLabel.trim() : '',
        ctaLink: link,
        campusId: campusId || null,
        frequency,
        priority: important ? 10 : 0,
        startsAt: fromLocalInput(startsAt),
        endsAt: fromLocalInput(endsAt),
      }
      if (image) input.imageBase64 = image
      else if (removeImage) input.removeImage = true

      if (existing) {
        if (contentChanged && showAgain) input.showAgain = true
        await announcementsApi.update(existing.id, input)
        return null
      }
      input.notify = { push, inbox }
      const result = await announcementsApi.create(input)
      return result.notified
    },
    onSuccess: (notified) => {
      if (existing) toast.success('Pop-up saved')
      else if (notified?.push?.sentCount != null)
        toast.success(`Pop-up is live. Push sent to ${count(notified.push.sentCount)} phones.`)
      else toast.success(startsLater ? 'Pop-up scheduled' : 'Pop-up is live')
      onSaved()
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the pop-up.')),
  })

  const valid =
    (shownImage || title.trim()) &&
    (!link || ctaLabel.trim()) &&
    !(preset === 'market' && !campusId) &&
    !(preset === 'custom' && !customLink.trim())

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={existing ? 'Edit pop-up' : 'New pop-up'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>
            {existing ? 'Save' : startsLater ? 'Schedule' : 'Publish'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Flyer</p>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                setPreparing(true)
                try {
                  setImage(await toCompressedDataUrl(file, 1600))
                  setRemoveImage(false)
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Could not use that image.')
                } finally {
                  setPreparing(false)
                }
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={ImagePlus} loading={preparing} onClick={() => fileInput.current?.click()}>
                {shownImage ? 'Change flyer' : 'Upload flyer'}
              </Button>
              {shownImage && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setImage(null)
                    setRemoveImage(true)
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
            <p className="text-[12px] text-ink-faint">
              Portrait works best (1080 × 1350). The whole image is shown, never cropped.
            </p>
          </div>

          <Input
            label="Headline (optional with a flyer)"
            value={title}
            maxLength={80}
            placeholder="Market day is here"
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            label="Message (optional)"
            rows={2}
            maxLength={400}
            value={body}
            placeholder="Fresh pepper, chicken and fish, delivered in under an hour."
            onChange={(e) => setBody(e.target.value)}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Button opens" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {LINK_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
            {preset && (
              <Input
                label="Button label"
                value={ctaLabel}
                maxLength={24}
                placeholder="Shop now"
                onChange={(e) => setCtaLabel(e.target.value)}
              />
            )}
          </div>
          {preset === 'custom' && (
            <Input
              label="Link"
              value={customLink}
              placeholder="/events/abc123 or https://…"
              onChange={(e) => setCustomLink(e.target.value)}
            />
          )}
          {preset === 'market' && !campusId && (
            <p className="text-[12px] font-semibold text-warn">Pick a campus below — each campus has its own market.</p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Who sees it" value={campusId} onChange={(e) => setCampusId(e.target.value)}>
              <option value="">Every campus</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              label="How often"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as PopupFrequency)}
            >
              {(Object.keys(FREQUENCY_LABEL) as PopupFrequency[]).map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABEL[f]}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            <Input label="Ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
          <p className="-mt-1.5 text-[12px] text-ink-faint">Leave Starts empty to go live now, and Ends empty to run until paused.</p>

          <div className="space-y-2.5 rounded-lg border border-line bg-surface-sunk p-3">
            <Check
              checked={important}
              onChange={setImportant}
              label="Show before other pop-ups"
              hint="If several are live, only one shows per app open. Important ones go first."
            />
            {!existing && (
              <>
                <Check
                  checked={push}
                  onChange={setPush}
                  label="Also send a push notification"
                  hint={
                    startsLater
                      ? 'Not sent for a scheduled pop-up. Use Notify once it is live.'
                      : 'Uses the headline and message. Brings people into the app to see the flyer.'
                  }
                />
                <Check
                  checked={inbox}
                  onChange={setInbox}
                  label="Add to their notifications list"
                  hint="Stays in the app's notifications after the pop-up is dismissed."
                />
              </>
            )}
            {existing && contentChanged && (
              <Check
                checked={showAgain}
                onChange={setShowAgain}
                label="Show again to people who already saw it"
                hint="Otherwise only people who have not seen it yet get the new version."
              />
            )}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Preview</p>
          <PhonePreview
            image={shownImage}
            title={title.trim()}
            body={body.trim()}
            cta={link ? ctaLabel.trim() || 'Button' : ''}
          />
        </div>
      </div>
    </Modal>
  )
}

function Check({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="flex items-start gap-2.5">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-[13px] font-semibold text-ink">{label}</span>
        {hint && <span className="block text-[12px] text-ink-faint">{hint}</span>}
      </span>
    </label>
  )
}

/**
 * Roughly what the buyer apps draw: the flyer on a dimmed screen, with any
 * headline, message and button beneath it and a close button in the corner.
 */
function PhonePreview({ image, title, body, cta }: { image: string; title: string; body: string; cta: string }) {
  return (
    <div className="mx-auto w-[240px] rounded-[30px] border-[6px] border-[#1c2433] bg-[#1c2433] shadow-xl">
      <div className="relative flex h-[440px] items-center justify-center overflow-hidden rounded-[24px] bg-[#e9edf3] px-4">
        <div className="absolute inset-0 bg-black/55" aria-hidden />
        <div className="relative w-full overflow-hidden rounded-2xl bg-white shadow-2xl">
          <span className="absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-black/45 text-white">
            <X className="h-3.5 w-3.5" aria-hidden />
          </span>
          {image ? (
            <img src={image} alt="" className="block max-h-[270px] w-full object-contain bg-[#f3f4f6]" />
          ) : null}
          {(title || body || cta || !image) && (
            <div className={cn('px-3.5 pb-3.5', image ? 'pt-3' : 'pt-8')}>
              {(title || !image) && (
                <p className="text-[14px] font-extrabold leading-tight text-[#0b1220]">{title || 'Your headline'}</p>
              )}
              {body && <p className="mt-1 text-[11.5px] leading-snug text-[#475467]">{body}</p>}
              {cta && (
                <span className="mt-3 block rounded-xl bg-[#1f77f1] py-2 text-center text-[12.5px] font-bold text-white">
                  {cta}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────── Dialogs ────────────────────────────── */

function NotifyDialog({
  announcement,
  onClose,
  onDone,
}: {
  announcement: Announcement
  onClose: () => void
  onDone: () => void
}) {
  const [push, setPush] = useState(true)
  const [inbox, setInbox] = useState(false)
  const send = useMutation({
    mutationFn: () => announcementsApi.notify(announcement.id, { push, inbox }),
    onSuccess: (r) => {
      toast.success(
        r.push?.sentCount != null ? `Push sent to ${count(r.push.sentCount)} phones` : 'Notification sent',
      )
      onDone()
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not send it.')),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="Tell buyers about this pop-up"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={BellRing}
            loading={send.isPending}
            disabled={!push && !inbox}
            onClick={() => send.mutate()}
          >
            Send
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {announcement.push && (
          <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] font-semibold text-warn">
            A notification for this pop-up already went out {dateTime(announcement.push.sentAt)}.
          </p>
        )}
        <p className="text-[13px] text-ink-soft">
          Sent to buyers on {announcement.campusId ? announcement.campusId.toUpperCase() : 'every campus'} as “
          {announcement.title || 'Something new on Blorbmart'}”.
        </p>
        <Check checked={push} onChange={setPush} label="Push notification" />
        <Check checked={inbox} onChange={setInbox} label="Add to their notifications list" />
      </div>
    </Modal>
  )
}

function DeleteDialog({
  announcement,
  onClose,
  onDone,
}: {
  announcement: Announcement
  onClose: () => void
  onDone: () => void
}) {
  const remove = useMutation({
    mutationFn: () => announcementsApi.remove(announcement.id),
    onSuccess: () => {
      toast.success('Pop-up deleted')
      onDone()
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete it.')),
  })
  return (
    <Modal
      open
      onClose={onClose}
      title="Delete this pop-up"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
            Delete
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-ink-soft">
        <span className="font-bold text-ink">{announcement.title || 'This flyer'}</span> stops showing straight away and
        its view counts are lost. To stop it but keep the numbers, pause it instead.
      </p>
    </Modal>
  )
}

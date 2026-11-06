import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CalendarRange, Plus, RefreshCw, Sparkles, Square } from 'lucide-react'
import { errorMessage, seasonsApi, type AppSeason, type SeasonApp } from '../lib/api'
import { dateTime } from '../lib/format'
import { Badge, Button, Card, Empty, ErrorState, Input, Modal, PageHeader, Select, Skeleton, cn, type Tone } from '../components/ui'

/**
 * Seasonal app icons: schedule Christmas, Sallah, Independence Day...
 *
 * The phone apps switch their home-screen icon, and the web apps their tab
 * icon, to the live season's. Android can only switch to icons that shipped
 * inside the app, so the list of seasons is fixed by the app build — a new
 * season needs new icons from brand/seasonal-icons and an app release.
 *
 * Phones switch the next time somebody opens the app and leaves it, so a
 * season shows up over a day or two, not on the minute.
 */

const APP_LABEL: Record<SeasonApp, string> = { buyer: 'Customer', vendor: 'Vendor', rider: 'Rider' }
const STATE_TONE: Record<AppSeason['state'], Tone> = { live: 'good', scheduled: 'info', ended: 'neutral' }

/** "2026-12-15T09:00", what a datetime-local input takes, in this browser's time. */
const localInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Icons({ season, apps }: { season: string; apps: SeasonApp[] }) {
  return (
    <div className="flex gap-2">
      {apps.map((app) => (
        <img key={app} src={`/seasons/${app}/${season}.png`} alt={`${APP_LABEL[app]} app, ${season}`} className="h-11 w-11 rounded-[22%]" />
      ))}
    </div>
  )
}

export default function Seasons() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['seasons'], queryFn: seasonsApi.list })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['seasons'] })
  const [open, setOpen] = useState(false)
  const [ending, setEnding] = useState<AppSeason | null>(null)

  const end = useMutation({
    mutationFn: (id: string) => seasonsApi.remove(id),
    onSuccess: () => {
      toast.success('Done — apps go back to the usual icon')
      setEnding(null)
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not end the season.')),
  })

  const seasons = query.data?.seasons ?? []
  const live = seasons.filter((s) => s.state !== 'ended')
  const past = seasons.filter((s) => s.state === 'ended').slice(0, 10)

  return (
    <>
      <PageHeader
        title="Seasonal icons"
        subtitle="Dress the app icons up for Christmas, Sallah, Independence Day and more."
        actions={
          <>
            <Button variant="ghost" icon={RefreshCw} onClick={() => query.refetch()}>
              Refresh
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
              Schedule a season
            </Button>
          </>
        }
      />

      {query.isLoading ? (
        <Skeleton className="h-48" />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error, 'Could not load seasons.')} onRetry={() => query.refetch()} />
      ) : (
        <div className="space-y-5">
          <Card
            title="Live and coming up"
            subtitle="Phones switch the next time someone opens the app and leaves it. The web apps switch on their next page load."
          >
            {live.length ? (
              <div className="space-y-3">
                {live.map((s) => (
                  <SeasonRow key={s.id} season={s}>
                    <Button size="sm" variant="ghost" icon={Square} onClick={() => setEnding(s)}>
                      {s.state === 'live' ? 'End now' : 'Cancel'}
                    </Button>
                  </SeasonRow>
                ))}
              </div>
            ) : (
              <Empty icon={Sparkles} title="Every app shows its usual icon" message="Schedule a season to dress them up." />
            )}
          </Card>

          {past.length > 0 && (
            <Card title="Past seasons">
              <div className="space-y-3">
                {past.map((s) => (
                  <SeasonRow key={s.id} season={s} />
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {open && query.data && (
        <ScheduleModal options={query.data.options} onClose={() => setOpen(false)} onDone={() => { setOpen(false); refresh() }} />
      )}

      <Modal
        open={Boolean(ending)}
        onClose={() => setEnding(null)}
        title={ending?.state === 'live' ? `End ${ending?.label ?? ''} now?` : `Cancel ${ending?.label ?? ''}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEnding(null)}>
              Keep it
            </Button>
            <Button variant="danger" loading={end.isPending} onClick={() => ending && end.mutate(ending.id)}>
              {ending?.state === 'live' ? 'End now' : 'Cancel it'}
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-soft">The apps go back to their usual icon, on phones the next time each one is opened.</p>
      </Modal>
    </>
  )
}

function SeasonRow({ season, children }: { season: AppSeason; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line-soft p-3">
      <Icons season={season.season} apps={season.apps} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-bold text-ink">{season.label}</span>
          <Badge tone={STATE_TONE[season.state]} dot>
            {season.state === 'live' ? 'Live' : season.state === 'scheduled' ? 'Scheduled' : 'Ended'}
          </Badge>
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-faint">
          <CalendarRange className="h-3.5 w-3.5" aria-hidden />
          {dateTime(season.startsAt)} → {dateTime(season.endsAt)} · {season.apps.map((a) => APP_LABEL[a]).join(', ')}
        </p>
      </div>
      {children}
    </div>
  )
}

function ScheduleModal({ options, onClose, onDone }: { options: Record<string, string>; onClose: () => void; onDone: () => void }) {
  const choices = Object.entries(options).filter(([id]) => id !== 'default')
  const [season, setSeason] = useState(choices[0]?.[0] ?? 'christmas')
  const [apps, setApps] = useState<SeasonApp[]>(['buyer', 'vendor', 'rider'])
  const [startsAt, setStartsAt] = useState(localInput(new Date()))
  const [endsAt, setEndsAt] = useState(localInput(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)))

  const save = useMutation({
    mutationFn: () =>
      seasonsApi.create({ season, apps, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() }),
    onSuccess: (s) => {
      toast.success(s.state === 'live' ? `${s.label} is live` : `${s.label} is scheduled`)
      onDone()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not schedule the season.')),
  })

  const toggle = (app: SeasonApp) => setApps((cur) => (cur.includes(app) ? cur.filter((a) => a !== app) : [...cur, app]))

  return (
    <Modal
      open
      onClose={onClose}
      title="Schedule a season"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!apps.length} onClick={() => save.mutate()}>
            Schedule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select label="Season" value={season} onChange={(e) => setSeason(e.target.value)}>
          {choices.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </Select>

        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Apps</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(APP_LABEL) as SeasonApp[]).map((app) => (
              <button
                key={app}
                type="button"
                onClick={() => toggle(app)}
                aria-pressed={apps.includes(app)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border p-2 pr-3 text-[13px] font-semibold',
                  apps.includes(app) ? 'border-brand bg-brand-soft text-ink' : 'border-line text-ink-faint opacity-60',
                )}
              >
                <img src={`/seasons/${app}/${season}.png`} alt="" className="h-9 w-9 rounded-[22%]" />
                {APP_LABEL[app]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          <Input label="Ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
        <p className="text-[12px] text-ink-faint">
          Phones pick it up the next time each app is opened and closed, so start a day or two early for a fixed date.
        </p>
      </div>
    </Modal>
  )
}

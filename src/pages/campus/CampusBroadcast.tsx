import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Megaphone, Send } from 'lucide-react'
import { campusApi, errorMessage } from '../../lib/api'
import { useSession } from '../../contexts/SessionContext'
import { count } from '../../lib/format'
import { Button, Card, Input, PageHeader, Select, Textarea } from '../../components/ui'

/**
 * A message to the campus.
 *
 * There is no campus picker and there cannot be one — the server takes the
 * campus from the sender's own account. That is the whole boundary, so the
 * screen states which campus it is about to message rather than letting the
 * sender assume.
 *
 * Sent messages are not undoable, so the confirm step is a summary of who is
 * about to receive it rather than a generic "are you sure".
 */
const AUDIENCES = [
  { value: 'all', label: 'Everyone on this campus' },
  { value: 'buyers', label: 'Buyers only' },
  { value: 'vendors', label: 'Vendors only' },
  { value: 'riders', label: 'Riders only' },
] as const

export default function CampusBroadcast() {
  const { campus } = useSession()
  const [form, setForm] = useState({
    title: '',
    body: '',
    audience: 'all' as (typeof AUDIENCES)[number]['value'],
    email: false,
  })
  const [sent, setSent] = useState<{ inApp: number; push: number } | null>(null)

  const send = useMutation({
    mutationFn: () =>
      campusApi.broadcast({
        title: form.title.trim(),
        subject: form.title.trim(),
        body: form.body.trim(),
        audience: form.audience,
        channels: form.email ? ['push', 'inapp', 'email'] : ['push', 'inapp'],
      }),
    onSuccess: (result) => {
      setSent({
        inApp: result.result.inApp?.sentCount ?? 0,
        push: result.result.push?.sentCount ?? 0,
      })
      toast.success('Message sent')
      setForm((f) => ({ ...f, title: '', body: '' }))
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not send the message.')),
  })

  const ready = form.title.trim().length > 0 && form.body.trim().length > 0

  return (
    <>
      <PageHeader
        title="Message your campus"
        subtitle={`Reaches people registered at ${campus?.campus?.name ?? 'your campus'} and nobody else.`}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <div className="space-y-3.5">
            <Select
              label="Who should get this"
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value as typeof form.audience })}
            >
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </Select>

            <Input
              label="Title"
              placeholder="Free delivery this weekend"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />

            <Textarea
              label="Message"
              rows={6}
              placeholder="Keep it short — this appears as a push notification."
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

            <div className="pt-1">
              <Button
                variant="primary"
                icon={Send}
                loading={send.isPending}
                disabled={!ready}
                onClick={() => send.mutate()}
              >
                Send to {AUDIENCES.find((a) => a.value === form.audience)?.label.toLowerCase()}
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          <Card title="How this arrives">
            <ul className="space-y-2.5 text-[12.5px] leading-relaxed text-ink-soft">
              <li>
                <strong className="text-ink">Push</strong> — lands on the phone if they granted permission.
              </li>
              <li>
                <strong className="text-ink">In-app</strong> — kept in their notifications list, so it is
                still there an hour later.
              </li>
              <li>
                <strong className="text-ink">Email</strong> — only if you tick the box. Reaches people who
                uninstalled the app.
              </li>
            </ul>
          </Card>

          {sent && (
            <Card title="Last message">
              <p className="text-[12.5px] leading-relaxed text-ink-soft">
                Saved to {count(sent.inApp)} {sent.inApp === 1 ? 'inbox' : 'inboxes'} and pushed to{' '}
                {count(sent.push)} {sent.push === 1 ? 'device' : 'devices'}.
              </p>
              <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
                Fewer devices than inboxes is normal — it counts people with notifications switched on.
              </p>
            </Card>
          )}

          <Card>
            <p className="flex gap-2 text-[11.5px] leading-relaxed text-ink-faint">
              <Megaphone size={26} className="shrink-0 text-ink-faint" strokeWidth={2} aria-hidden />
              <span>
                Only people tagged with your campus are included. Anyone who has not set a campus is left out.
              </span>
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}

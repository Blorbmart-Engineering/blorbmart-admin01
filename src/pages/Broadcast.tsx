import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { AlertTriangle, Megaphone, Send } from 'lucide-react'
import { adminApi, errorMessage, type BroadcastResult, type Row } from '../lib/api'
import { ago, count, text, titleCase } from '../lib/format'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Empty,
  Input,
  PageHeader,
  Select,
  Toolbar,
  type Column,
} from '../components/ui'

const asRows = (data: unknown): Row[] => {
  if (Array.isArray(data)) return data as Row[]
  const wrapped = (data as { broadcasts?: Row[]; history?: Row[] })
  return wrapped?.broadcasts ?? wrapped?.history ?? []
}

type Channel = 'push' | 'email' | 'both'
type Audience = 'all' | 'buyers' | 'vendors' | 'riders'

// The log holds campus messages too, whose `type` is a "+"-joined list such
// as "push+inapp".
const CHANNEL_NAMES: Record<string, string> = { push: 'Push', email: 'Email', inapp: 'In-app' }
const channelLabel = (type: unknown) => {
  const raw = text(type, 'push')
  const parts = raw === 'both' ? ['push', 'email'] : raw.split('+')
  return parts.map((p) => CHANNEL_NAMES[p] ?? titleCase(p)).join(' + ')
}

/** Devices pushed to plus inboxes emailed, as the server logged them. */
const reach = (b: Row) => {
  const result = (b.result ?? {}) as BroadcastResult['result']
  const channels = [result.push, result.email]
  return {
    sent: channels.reduce((n, c) => n + (c?.sentCount ?? 0), 0),
    failed: channels.reduce((n, c) => n + (c?.failedCount ?? 0), 0),
  }
}

/**
 * Broadcast.
 *
 * The one screen here that reaches customers directly, and the only one whose
 * mistakes cannot be taken back — a push notification is on somebody's lock
 * screen the instant it sends. So it costs a typed confirmation, shows exactly
 * who will receive it, and keeps a permanent history of what was sent.
 */
export default function Broadcast() {
  const queryClient = useQueryClient()
  const [channel, setChannel] = useState<Channel>('push')
  const [audience, setAudience] = useState<Audience>('all')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [confirm, setConfirm] = useState('')

  const history = useQuery({
    queryKey: ['broadcast-history'],
    queryFn: adminApi.broadcastHistory,
    staleTime: 60_000,
  })

  const send = useMutation({
    mutationFn: () =>
      adminApi.broadcast({
        type: channel,
        audience,
        title: title.trim(),
        subject: title.trim(),
        body: message.trim(),
      }),
    onSuccess: (result) => {
      const sent = (result?.push?.sentCount ?? 0) + (result?.email?.sentCount ?? 0)
      toast.success(`Broadcast sent to ${count(sent)} ${sent === 1 ? 'recipient' : 'recipients'}`)
      queryClient.invalidateQueries({ queryKey: ['broadcast-history'] })
      setTitle('')
      setMessage('')
      setConfirm('')
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not send the broadcast.')),
  })

  const columns: Column<Row>[] = [
    {
      key: 'message',
      header: 'Message',
      render: (b) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{text(b.title)}</p>
          <p className="truncate text-[11.5px] text-ink-faint">{text(b.body)}</p>
        </div>
      ),
    },
    { key: 'channel', header: 'Channel', render: (b) => <Badge tone="info">{channelLabel(b.type)}</Badge> },
    {
      key: 'audience',
      header: 'Audience',
      render: (b) => `${titleCase(text(b.audience, 'all'))}${b.campusId ? ' · one campus' : ''}`,
    },
    {
      key: 'reach',
      header: 'Delivered',
      align: 'right',
      render: (b) => {
        const { sent, failed } = reach(b)
        return `${count(sent)}${failed ? ` (${count(failed)} failed)` : ''}`
      },
    },
    { key: 'when', header: 'Sent', align: 'right', render: (b) => ago(b.createdAt ?? b.sentAt) },
  ]

  // Said out loud under the button: a greyed-out button with no reason reads
  // as a missing one.
  const blocker =
    title.trim().length < 3
      ? 'Add a title of at least 3 characters.'
      : message.trim().length < 5
        ? 'Write a message of at least 5 characters.'
        : confirm.trim().toUpperCase() !== 'SEND'
          ? 'Type SEND in the box above to unlock sending.'
          : null
  const ready = blocker === null

  return (
    <>
      <PageHeader title="Broadcast" subtitle="Send a push or email to everyone at once." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Card title="Compose">
          <div className="space-y-3.5">
            <Toolbar className="gap-3">
              <Select
                label="Channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value as Channel)}
                className="w-36"
              >
                <option value="push">Push</option>
                <option value="email">Email</option>
                <option value="both">Push + email</option>
              </Select>
              <Select
                label="Audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value as Audience)}
                className="w-40"
              >
                <option value="all">Everyone</option>
                <option value="buyers">Buyers</option>
                <option value="vendors">Vendors</option>
                <option value="riders">Riders</option>
              </Select>
            </Toolbar>

            <Input
              label="Title"
              placeholder="Free delivery this weekend"
              maxLength={65}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <div className="space-y-1.5">
              <label
                htmlFor="broadcast-body"
                className="block text-[11px] font-bold uppercase tracking-wide text-ink-faint"
              >
                Message
              </label>
              <textarea
                id="broadcast-body"
                rows={4}
                maxLength={240}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="No delivery fee on any order over ₦3,000 until Sunday."
                className="w-full resize-y rounded-lg border border-line bg-raised px-3 py-2.5 text-[13.5px] text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-brand"
              />
              <p className="text-right text-[11px] text-ink-faint">{message.length}/240</p>
            </div>

            {/* Everything below is friction on purpose. */}
            <div className="flex items-start gap-2.5 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
              <p className="text-[12px] leading-relaxed text-ink-soft">
                This reaches <span className="font-semibold text-ink">{audience === 'all' ? 'every Blorbmart user' : audience}</span>{' '}
                immediately and cannot be recalled. Type <span className="font-bold text-ink">SEND</span> to
                confirm.
              </p>
            </div>

            {/* No "SEND" placeholder: grey SEND in an empty box looks typed,
                and the button then seems dead for no reason. */}
            <Input
              label="Type SEND to confirm"
              autoComplete="off"
              spellCheck={false}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />

            <div className="space-y-2">
              <Button
                variant="primary"
                icon={Send}
                className="w-full"
                loading={send.isPending}
                disabled={!ready}
                onClick={() => send.mutate()}
              >
                Send broadcast
              </Button>
              {blocker && <p className="text-center text-[11.5px] text-ink-faint">{blocker}</p>}
            </div>
          </div>
        </Card>

        <Card title="Recent broadcasts" bodyClassName="p-0">
          <DataTable
            columns={columns}
            rows={asRows(history.data)}
            keyOf={(b, i) => String(b.id ?? i)}
            loading={history.isLoading}
            error={history.isError ? errorMessage(history.error) : null}
            onRetry={() => history.refetch()}
            empty={<Empty icon={Megaphone} title="Nothing sent yet" message="Broadcasts you send will be listed here." />}
          />
        </Card>
      </div>
    </>
  )
}

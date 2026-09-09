import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { AlertTriangle, Megaphone, Send } from 'lucide-react'
import { adminApi, errorMessage, type Row } from '../lib/api'
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
  const [channel, setChannel] = useState('push')
  const [audience, setAudience] = useState('all')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [confirm, setConfirm] = useState('')

  const history = useQuery({
    queryKey: ['broadcast-history'],
    queryFn: adminApi.broadcastHistory,
    staleTime: 60_000,
  })

  const send = useMutation({
    mutationFn: () => adminApi.broadcast({ channel, audience, title: title.trim(), message: message.trim() }),
    onSuccess: () => {
      toast.success('Broadcast sent')
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
          <p className="truncate text-[11.5px] text-ink-faint">{text(b.message ?? b.body)}</p>
        </div>
      ),
    },
    { key: 'channel', header: 'Channel', render: (b) => <Badge tone="info">{titleCase(text(b.channel, 'push'))}</Badge> },
    { key: 'audience', header: 'Audience', render: (b) => titleCase(text(b.audience, 'all')) },
    {
      key: 'reach',
      header: 'Delivered',
      align: 'right',
      render: (b) => `${count(b.successCount ?? b.sent ?? 0)}${b.failureCount ? ` (${count(b.failureCount)} failed)` : ''}`,
    },
    { key: 'when', header: 'Sent', align: 'right', render: (b) => ago(b.createdAt ?? b.sentAt) },
  ]

  const ready = title.trim().length > 2 && message.trim().length > 4 && confirm.trim().toUpperCase() === 'SEND'

  return (
    <>
      <PageHeader title="Broadcast" subtitle="Send a push or email to everyone at once." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Card title="Compose">
          <div className="space-y-3.5">
            <Toolbar className="gap-3">
              <Select label="Channel" value={channel} onChange={(e) => setChannel(e.target.value)} className="w-36">
                <option value="push">Push</option>
                <option value="email">Email</option>
              </Select>
              <Select
                label="Audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
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

            <Input
              label="Confirm"
              placeholder="SEND"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />

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

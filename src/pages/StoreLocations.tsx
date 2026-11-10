import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { MapPin, Search } from 'lucide-react'
import { errorMessage, storeLocationsApi, type PinStatus, type StoreLocationRow } from '../lib/api'
import { dateTime } from '../lib/format'
import { Badge, Button, Card, DataTable, Empty, Input, Modal, PageHeader, Stat, Toolbar, type Column } from '../components/ui'
import PinPicker, { type Pin, type Place } from '../components/PinPicker'

/**
 * Store locations: every store's map pin.
 *
 * Delivery is priced by distance from the store's pin to the customer's. A
 * store with no pin, or a pin in the wrong town, is charged the flat fee on
 * every order — so this list puts those first. Setting a pin here takes
 * effect on the next order; vendors can also set their own in their app.
 */

const STATUS: Record<PinStatus, { label: string; tone: 'bad' | 'warn' | 'good' }> = {
  missing: { label: 'No pin', tone: 'bad' },
  far: { label: 'Check pin', tone: 'warn' },
  ok: { label: 'Pinned', tone: 'good' },
}

export default function StoreLocations() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['store-locations'], queryFn: storeLocationsApi.list })
  const [filter, setFilter] = useState<'all' | PinStatus>('all')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<StoreLocationRow | null>(null)
  const [pin, setPin] = useState<Pin | null>(null)
  const [place, setPlace] = useState<Place | null>(null)
  const [address, setAddress] = useState('')

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (data?.stores ?? []).filter(
      (s) =>
        (filter === 'all' || s.status === filter) &&
        (!term || `${s.name} ${s.address} ${s.city}`.toLowerCase().includes(term)),
    )
  }, [data, filter, q])

  const open = (row: StoreLocationRow) => {
    setEditing(row)
    setPin(row.pin)
    setPlace(null)
    setAddress(row.address)
  }

  const save = useMutation({
    mutationFn: () => {
      if (!editing || !pin) throw new Error('Move the map to put the pin on the store first.')
      const typed = address.trim()
      return storeLocationsApi.save(editing.id, {
        lat: pin.lat,
        lng: pin.lng,
        ...(typed && typed !== editing.address ? { address: typed } : {}),
      })
    },
    onSuccess: (result) => {
      toast.success(
        result.status === 'far'
          ? 'Saved, but this pin is far from campus. Check it is the store.'
          : `${editing?.name ?? 'Store'} pinned. Its next order is priced by distance.`,
      )
      setEditing(null)
      void qc.invalidateQueries({ queryKey: ['store-locations'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const columns: Column<StoreLocationRow>[] = [
    {
      key: 'name',
      header: 'Store',
      render: (s) => (
        <div className="flex items-center gap-2.5">
          {s.logoUrl ? (
            <img src={s.logoUrl} alt="" className="h-8 w-8 rounded-md object-cover" />
          ) : (
            <div className="h-8 w-8 rounded-md bg-raised" />
          )}
          <div className="min-w-0">
            <div className="font-semibold text-ink">{s.name}</div>
            <div className="max-w-[320px] truncate text-[12px] text-ink-faint">{s.address || 'No address'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Pin',
      render: (s) => (
        <Badge tone={STATUS[s.status].tone} dot>
          {STATUS[s.status].label}
        </Badge>
      ),
    },
    {
      key: 'km',
      header: 'From campus',
      align: 'right',
      render: (s) => (s.kmFromCentre == null ? '—' : `${s.kmFromCentre} km`),
    },
    {
      key: 'set',
      header: 'Last set',
      render: (s) => (
        <span className="text-[12px]">
          {s.locationUpdatedAt ? dateTime(s.locationUpdatedAt) : '—'}
          {s.locationSetBy ? <span className="text-ink-faint"> · {s.locationSetBy.startsWith('admin') ? 'admin' : s.locationSetBy}</span> : null}
        </span>
      ),
    },
    {
      key: 'act',
      header: '',
      align: 'right',
      render: (s) => (
        <Button size="sm" variant={s.status === 'ok' ? 'outline' : 'primary'} icon={MapPin} onClick={() => open(s)}>
          {s.status === 'ok' ? 'Move pin' : 'Set pin'}
        </Button>
      ),
    },
  ]

  const counts = data?.counts ?? { ok: 0, missing: 0, far: 0 }

  return (
    <div>
      <PageHeader
        title="Store locations"
        subtitle="Delivery is priced from the store's pin to the customer's. A store without a pin pays the flat fee on every order."
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="No pin" value={counts.missing} />
        <Stat label="Pin far from campus" value={counts.far} />
        <Stat label="Pinned" value={counts.ok} />
      </div>

      <Card>
        <Toolbar className="mb-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stores" className="pl-9" />
          </div>
          {(['all', 'missing', 'far', 'ok'] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? 'primary' : 'outline'} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : STATUS[f].label}
            </Button>
          ))}
        </Toolbar>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(s) => s.id}
          loading={isLoading}
          error={error ? errorMessage(error) : null}
          onRetry={() => void refetch()}
          empty={<Empty icon={MapPin} title="No stores here" message="Nothing matches this filter." />}
        />
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Pin ${editing.name}` : 'Pin'}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={save.isPending} disabled={!pin} onClick={() => save.mutate()}>
              Save pin
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <p className="text-[13px] text-ink-soft">
              Search for the store or a landmark near it, then move the map until the pin sits on the store&rsquo;s
              building. Satellite view shows the rooftops.
              {editing.address ? (
                <>
                  {' '}The vendor wrote: <b className="text-ink">{editing.address}</b>
                </>
              ) : null}
            </p>
            <PinPicker
              key={editing.id}
              value={editing.pin}
              locateOnOpen={false}
              height={400}
              onChange={(p, words) => {
                setPin(p)
                setPlace(words)
              }}
            />
            <Input
              label="Address shown to customers and riders"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={place?.label ?? 'e.g. Back of Pink Mosque, Station Road, Shasha'}
            />
            <p className="text-[12px] text-ink-faint">
              Leave it as it is to keep the vendor&rsquo;s wording. If it is empty or a code like &ldquo;QH9W+RH2&rdquo;, it is
              replaced with the address found for the pin.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}

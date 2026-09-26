import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Carrot,
  Clock,
  Crosshair,
  ImagePlus,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Store,
  Trash2,
} from 'lucide-react'
import {
  errorMessage,
  marketApi,
  type Market,
  type MarketProduct,
  type MarketProductInput,
  type MarketSettingsInput,
} from '../lib/api'
import { ago, money } from '../lib/format'
import { toCompressedDataUrl } from '../lib/image'
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
  Stat,
  Textarea,
  Toolbar,
  cn,
} from './ui'

/**
 * Shop from your local market — the console side.
 *
 * One component for both consoles. A head of operations passes no campus and
 * the server uses theirs; an admin passes the campus they opened. Nothing else
 * differs, so the two screens cannot drift into disagreeing about what a
 * market listing is.
 *
 * The listed price is what the rider is reimbursed when they buy the item at
 * the market, not just what the buyer pays. That is why a price nobody has
 * touched in a week is flagged on its card: market prices move, and a stale
 * one leaves a rider out of pocket.
 */

const STALE_PRICE_DAYS = 7

const UNIT_SUGGESTIONS = ['1 kg', '½ kg', 'per piece', 'per bunch', 'per tuber', '1 derica', '1 paint bucket', '1 litre']

const hourLabel = (h: number) => {
  const hour = h % 24
  const suffix = hour < 12 ? 'am' : 'pm'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return h === 24 ? 'midnight' : `${twelve}${suffix}`
}

function daysSince(ms: number | null) {
  if (!ms) return null
  return Math.floor((Date.now() - ms) / 86_400_000)
}

export default function MarketManager({ campusId }: { campusId?: string }) {
  const queryClient = useQueryClient()
  const api = useMemo(() => marketApi(campusId), [campusId])
  const key = ['market', campusId ?? 'mine']

  const [search, setSearch] = useState('')
  const [section, setSection] = useState('all')
  const [editing, setEditing] = useState<MarketProduct | 'new' | null>(null)
  const [removing, setRemoving] = useState<MarketProduct | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const market = useQuery({ queryKey: key, queryFn: api.get, staleTime: 30_000 })

  const refresh = (next?: Market) => {
    if (next) queryClient.setQueryData(key, next)
    else queryClient.invalidateQueries({ queryKey: key })
  }

  const toggle = useMutation({
    mutationFn: (p: MarketProduct) => api.updateProduct(p.id, { isAvailable: !p.isAvailable }),
    onSuccess: (p) => {
      toast.success(p.isAvailable ? `${p.name} is back on sale` : `${p.name} marked sold out`)
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the item.')),
  })

  const data = market.data
  const products = data?.products ?? []
  const sectionsInUse = [...new Set(products.map((p) => p.section).filter(Boolean))].sort()

  const visible = products.filter((p) => {
    if (section !== 'all' && p.section !== section) return false
    const q = search.trim().toLowerCase()
    return !q || `${p.name} ${p.unit} ${p.section}`.toLowerCase().includes(q)
  })

  const grouped = visible.reduce<Record<string, MarketProduct[]>>((acc, p) => {
    ;(acc[p.section || 'Other'] ??= []).push(p)
    return acc
  }, {})

  const onSale = products.filter((p) => p.isAvailable).length
  const stale = products.filter((p) => (daysSince(p.priceUpdatedAt ?? p.createdAt) ?? 0) >= STALE_PRICE_DAYS).length
  const store = data?.store
  const hasLocation = store?.latitude != null && store?.longitude != null

  return (
    <>
      <PageHeader
        title={store?.name ?? 'Local market'}
        subtitle={
          campusId && data
            ? `The ${data.campus.name} market. Riders buy these items at the market and deliver them.`
            : 'What buyers can order from the local market. A rider buys each order at the market and delivers it.'
        }
        actions={
          <Toolbar>
            <Button size="sm" icon={Settings2} onClick={() => setSettingsOpen(true)} disabled={!data}>
              Market settings
            </Button>
            <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing('new')} disabled={!data}>
              Add item
            </Button>
          </Toolbar>
        }
      />

      {market.isError ? (
        <Card>
          <ErrorState message={errorMessage(market.error)} onRetry={() => market.refetch()} />
        </Card>
      ) : (
        <div className="space-y-5">
          {data && !store?.isActive && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3">
              <p className="text-[13px] font-semibold text-warn">
                {hasLocation
                  ? 'Buyers cannot see this market yet. Open it in Market settings when the list is ready.'
                  : 'Buyers cannot see this market yet. Set its location in Market settings, then open it.'}
              </p>
              <Button size="sm" onClick={() => setSettingsOpen(true)}>
                Open settings
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Status"
              icon={Store}
              loading={market.isLoading}
              tone={store?.isActive ? (store.isOpen ? 'good' : 'warn') : 'neutral'}
              value={store?.isActive ? (store.isOpen ? 'Live' : 'Closed') : 'Hidden'}
              hint={store ? `${hourLabel(store.openingHour)} – ${hourLabel(store.closingHour)}` : undefined}
            />
            <Stat label="Items" icon={Carrot} loading={market.isLoading} value={products.length} />
            <Stat
              label="On sale"
              loading={market.isLoading}
              value={onSale}
              hint={products.length - onSale ? `${products.length - onSale} sold out` : 'Everything is available'}
            />
            <Stat
              label="Old prices"
              icon={Clock}
              loading={market.isLoading}
              tone={stale ? 'warn' : 'neutral'}
              value={stale}
              hint={`Not changed in ${STALE_PRICE_DAYS}+ days`}
            />
          </div>

          <Card
            bodyClassName="p-0"
            title="Items"
            subtitle="Riders are paid back exactly the price listed here, so keep it at today's market price."
            actions={
              <Button size="sm" variant="ghost" icon={RefreshCw} loading={market.isFetching} onClick={() => market.refetch()}>
                Refresh
              </Button>
            }
          >
            <div className="flex flex-wrap items-end gap-2 border-b border-line-soft px-4 py-3">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
                <Input
                  aria-label="Search items"
                  placeholder="Search pepper, fish, yam…"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select aria-label="Section" value={section} onChange={(e) => setSection(e.target.value)} className="w-48">
                <option value="all">All sections</option>
                {sectionsInUse.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>

            {market.isLoading ? (
              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : !products.length ? (
              <Empty
                icon={Carrot}
                title="No items yet"
                message="Add what buyers can order from the market, like pepper, chicken by the kilo, fish or yam, with today's price."
                action={
                  <Button variant="primary" size="sm" icon={Plus} onClick={() => setEditing('new')}>
                    Add the first item
                  </Button>
                }
              />
            ) : !visible.length ? (
              <Empty icon={Search} title="Nothing matches" message="Try another word or section." />
            ) : (
              <div className="space-y-5 p-4">
                {Object.entries(grouped).map(([name, items]) => (
                  <section key={name}>
                    <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                      {name} <span className="font-semibold">· {items.length}</span>
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {items.map((p) => (
                        <ProductCard
                          key={p.id}
                          product={p}
                          busy={toggle.isPending && toggle.variables?.id === p.id}
                          onToggle={() => toggle.mutate(p)}
                          onEdit={() => setEditing(p)}
                          onRemove={() => setRemoving(p)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {editing && data && (
        <ProductDialog
          product={editing === 'new' ? null : editing}
          sections={data.sections}
          save={(body) =>
            editing === 'new' ? api.addProduct(body) : api.updateProduct(editing.id, body)
          }
          onClose={() => setEditing(null)}
          onSaved={() => refresh()}
        />
      )}

      {removing && (
        <RemoveDialog
          product={removing}
          remove={() => api.removeProduct(removing.id)}
          onClose={() => setRemoving(null)}
          onDone={() => refresh()}
        />
      )}

      {settingsOpen && data && (
        <SettingsDialog
          market={data}
          save={api.save}
          onClose={() => setSettingsOpen(false)}
          onSaved={(next) => refresh(next)}
        />
      )}
    </>
  )
}

/* ─────────────────────────────── Product card ──────────────────────────── */

function ProductCard({
  product: p,
  busy,
  onToggle,
  onEdit,
  onRemove,
}: {
  product: MarketProduct
  busy: boolean
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  const age = daysSince(p.priceUpdatedAt ?? p.createdAt)
  const stale = age != null && age >= STALE_PRICE_DAYS

  return (
    <div className={cn('flex gap-3 rounded-xl border border-line bg-raised/40 p-3', !p.isAvailable && 'opacity-70')}>
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-line-soft bg-surface-sunk">
        {p.image ? (
          <img src={p.image} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full w-full place-items-center text-ink-faint">
            <Carrot className="h-6 w-6" aria-hidden />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-bold text-ink">{p.name}</p>
            <p className="text-[12px] text-ink-faint">{p.unit}</p>
          </div>
          <p className="shrink-0 text-[14px] font-bold tabular text-ink">{money(p.price)}</p>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {!p.isAvailable && <Badge tone="bad">Sold out</Badge>}
          {stale && (
            <Badge tone="warn" dot>
              Price {age}d old
            </Badge>
          )}
          {!stale && p.priceUpdatedAt && (
            <span className="text-[11px] text-ink-faint">Price set {ago(p.priceUpdatedAt)}</span>
          )}
        </div>

        <div className="mt-auto flex items-center justify-end gap-1 pt-2">
          <Button size="sm" variant="ghost" loading={busy} onClick={onToggle}>
            {p.isAvailable ? 'Mark sold out' : 'Back on sale'}
          </Button>
          <Button size="sm" variant="ghost" icon={Pencil} onClick={onEdit} aria-label={`Edit ${p.name}`} />
          <Button size="sm" variant="ghost" icon={Trash2} onClick={onRemove} aria-label={`Remove ${p.name}`} />
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────── Photo picker ──────────────────────────── */

function PhotoPicker({
  current,
  pending,
  onPick,
  onClear,
  square = true,
}: {
  current: string
  pending: string | null
  onPick: (dataUrl: string) => void
  onClear: () => void
  square?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [preparing, setPreparing] = useState(false)
  const shown = pending ?? current

  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'shrink-0 overflow-hidden rounded-lg border border-line bg-surface-sunk',
          square ? 'h-20 w-20' : 'h-20 w-40',
        )}
      >
        {shown ? (
          <img src={shown} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-ink-faint">
            <ImagePlus className="h-6 w-6" aria-hidden />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            setPreparing(true)
            try {
              onPick(await toCompressedDataUrl(file))
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Could not use that image.')
            } finally {
              setPreparing(false)
            }
          }}
        />
        <Button size="sm" icon={ImagePlus} loading={preparing} onClick={() => input.current?.click()}>
          {shown ? 'Change photo' : 'Add photo'}
        </Button>
        {shown && (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────── Product dialog ────────────────────────── */

function ProductDialog({
  product,
  sections,
  save,
  onClose,
  onSaved,
}: {
  product: MarketProduct | null
  sections: string[]
  save: (body: MarketProductInput) => Promise<MarketProduct>
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(product?.name ?? '')
  const [price, setPrice] = useState(product ? String(product.price) : '')
  const [unit, setUnit] = useState(product?.unit ?? '')
  const [section, setSection] = useState(product?.section || sections[0] || '')
  const [description, setDescription] = useState(
    product && product.description !== `Price per ${product.unit}` ? product.description : '',
  )
  const [available, setAvailable] = useState(product?.isAvailable ?? true)
  const [photo, setPhoto] = useState<string | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)

  const allSections = sections.includes(section) || !section ? sections : [...sections, section]

  const mutation = useMutation({
    mutationFn: () => {
      const body: MarketProductInput = {
        name: name.trim(),
        price: Number(price),
        unit: unit.trim(),
        section,
        description: description.trim(),
        isAvailable: available,
      }
      if (photo) body.imageBase64 = photo
      else if (removePhoto) body.removeImage = true
      return save(body)
    },
    onSuccess: (p) => {
      toast.success(product ? `${p.name} saved` : `${p.name} added to the market`)
      onSaved()
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the item.')),
  })

  const priceNumber = Number(price)
  const valid = name.trim().length >= 2 && priceNumber > 0 && unit.trim().length > 0

  return (
    <Modal
      open
      onClose={onClose}
      title={product ? `Edit ${product.name}` : 'Add a market item'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={mutation.isPending} disabled={!valid} onClick={() => mutation.mutate()}>
            {product ? 'Save' : 'Add item'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) mutation.mutate()
        }}
      >
        <PhotoPicker
          current={removePhoto ? '' : product?.image ?? ''}
          pending={photo}
          onPick={(dataUrl) => {
            setPhoto(dataUrl)
            setRemovePhoto(false)
          }}
          onClear={() => {
            setPhoto(null)
            setRemovePhoto(true)
          }}
        />

        <Input
          label="Item"
          placeholder="Pepper chicken"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Price (₦)"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="6500"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <div>
            <Input
              label="Price is for"
              placeholder="1 kg"
              list="market-units"
              value={unit}
              maxLength={30}
              onChange={(e) => setUnit(e.target.value)}
            />
            <datalist id="market-units">
              {UNIT_SUGGESTIONS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
        </div>

        <Select label="Section" value={section} onChange={(e) => setSection(e.target.value)}>
          {allSections.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>

        <Textarea
          label="Note for buyers (optional)"
          rows={2}
          maxLength={300}
          placeholder="Cleaned and cut. Size varies with the market."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label className="flex items-center gap-2.5 text-[13px] font-semibold text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--color-brand)]"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
          />
          On sale now
        </label>

        {priceNumber > 0 && unit.trim() && (
          <p className="rounded-lg border border-line bg-surface-sunk px-3 py-2 text-[12.5px] text-ink-soft">
            Buyers see <span className="font-bold text-ink">{money(priceNumber)}</span> for{' '}
            <span className="font-bold text-ink">{unit.trim()}</span>. A rider who buys it is paid back{' '}
            {money(priceNumber)}.
          </p>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}

/* ─────────────────────────────── Remove dialog ─────────────────────────── */

function RemoveDialog({
  product,
  remove,
  onClose,
  onDone,
}: {
  product: MarketProduct
  remove: () => Promise<unknown>
  onClose: () => void
  onDone: () => void
}) {
  const mutation = useMutation({
    mutationFn: remove,
    onSuccess: () => {
      toast.success(`${product.name} removed`)
      onDone()
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not remove the item.')),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="Remove this item"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Remove
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-ink-soft">
        <span className="font-bold text-ink">{product.name}</span> ({product.unit}, {money(product.price)}) will be
        taken off the market for good. Orders already placed keep their copy. If it is only out for today, use{' '}
        <span className="font-semibold text-ink">Mark sold out</span> instead.
      </p>
    </Modal>
  )
}

/* ─────────────────────────────── Settings dialog ───────────────────────── */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</p>
      {children}
    </div>
  )
}

function SettingsDialog({
  market,
  save,
  onClose,
  onSaved,
}: {
  market: Market
  save: (body: MarketSettingsInput) => Promise<Market>
  onClose: () => void
  onSaved: (next: Market) => void
}) {
  const s = market.store
  const [name, setName] = useState(s.name ?? '')
  const [tagline, setTagline] = useState(s.tagline)
  const [address, setAddress] = useState(s.address)
  const [lat, setLat] = useState(s.latitude != null ? String(s.latitude) : '')
  const [lng, setLng] = useState(s.longitude != null ? String(s.longitude) : '')
  const [opening, setOpening] = useState(s.openingHour)
  const [closing, setClosing] = useState(s.closingHour)
  const [prep, setPrep] = useState(String(s.prepTimeMins))
  const [isOpen, setIsOpen] = useState(s.isOpen)
  const [isActive, setIsActive] = useState(s.isActive)
  const [banner, setBanner] = useState<string | null>(null)
  const [removeBanner, setRemoveBanner] = useState(false)
  const [locating, setLocating] = useState(false)

  const hasLocation = lat.trim() !== '' && lng.trim() !== ''

  const mutation = useMutation({
    mutationFn: () => {
      const body: MarketSettingsInput = {
        name: name.trim(),
        tagline: tagline.trim(),
        address: address.trim(),
        latitude: hasLocation ? Number(lat) : null,
        longitude: hasLocation ? Number(lng) : null,
        openingHour: opening,
        closingHour: closing,
        prepTimeMins: Number(prep),
        isOpen,
        isActive,
      }
      if (banner) body.bannerBase64 = banner
      else if (removeBanner) body.removeBanner = true
      return save(body)
    },
    onSuccess: (next) => {
      toast.success('Market saved')
      onSaved(next)
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the market.')),
  })

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error('This browser cannot share a location.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
        setLocating(false)
        toast.success('Location set to where you are now')
      },
      () => {
        setLocating(false)
        toast.error('Could not read your location. Allow it in the browser, or paste the coordinates.')
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }

  const hours = Array.from({ length: 25 }, (_, h) => h)

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Market settings"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3.5">
          <Input label="Market name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Tagline"
            value={tagline}
            maxLength={120}
            onChange={(e) => setTagline(e.target.value)}
          />
          <Field label="Banner">
            <PhotoPicker
              square={false}
              current={removeBanner ? '' : s.bannerUrl}
              pending={banner}
              onPick={(d) => {
                setBanner(d)
                setRemoveBanner(false)
              }}
              onClear={() => {
                setBanner(null)
                setRemoveBanner(true)
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Opens" value={opening} onChange={(e) => setOpening(Number(e.target.value))}>
              {hours.slice(0, 24).map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </Select>
            <Select label="Closes" value={closing} onChange={(e) => setClosing(Number(e.target.value))}>
              {hours.slice(1).map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </Select>
          </div>
          <Input
            label="Shopping time (minutes)"
            type="number"
            min={10}
            max={240}
            value={prep}
            onChange={(e) => setPrep(e.target.value)}
          />
        </div>

        <div className="space-y-3.5">
          <Input
            label="Where riders go"
            placeholder="Oja Igbo main gate"
            value={address}
            maxLength={200}
            onChange={(e) => setAddress(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Latitude" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
            <Input label="Longitude" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" icon={Crosshair} loading={locating} onClick={useMyLocation}>
              Use where I am
            </Button>
            {hasLocation && (
              <a
                className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline"
                href={`https://www.google.com/maps?q=${lat},${lng}`}
                target="_blank"
                rel="noreferrer"
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                Check on the map
              </a>
            )}
          </div>
          <p className="text-[12px] leading-relaxed text-ink-faint">
            Delivery fees are priced from this point and riders are sent here. Standing at the market and tapping
            <span className="font-semibold"> Use where I am</span> is the most accurate way to set it.
          </p>

          <div className="space-y-2.5 rounded-lg border border-line bg-surface-sunk p-3">
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>
                <span className="block text-[13px] font-semibold text-ink">Visible to buyers</span>
                <span className="block text-[12px] text-ink-faint">
                  {hasLocation ? 'Shows the market in the app for this campus.' : 'Needs a location first.'}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
                checked={isOpen}
                onChange={(e) => setIsOpen(e.target.checked)}
              />
              <span>
                <span className="block text-[13px] font-semibold text-ink">Taking orders</span>
                <span className="block text-[12px] text-ink-faint">
                  Untick to close for the day (a market day off, a strike) without hiding it.
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>
    </Modal>
  )
}

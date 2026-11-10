/**
 * PinPicker — drop a pin on a satellite map and get back words for it.
 *
 * The same file lives in the admin console, the vendor web and the buyer
 * web; only the import of the API base differs. Keep them in step.
 *
 * How it works. The pin is fixed in the middle of the map and the person
 * moves the map under it, which is far easier on a phone than dragging a
 * marker. When the map stops, the backend (/api/geo/reverse, OpenStreetMap)
 * turns the centre into a line a rider can read. Tiles and attribution come
 * from /api/geo/config so they can be changed for every app in one place;
 * the defaults below are only used if that call fails.
 *
 * Satellite (Esri World Imagery, with road and place names over it) is the
 * default, because a student recognises their hostel roof long before they
 * recognise a street name. "Map" switches to a street map.
 */
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { BASE_URL as API_BASE } from '../lib/api'

export interface Pin {
  lat: number
  lng: number
}

export interface Place {
  line: string
  area: string
  city: string
  state: string
  label: string
}

interface SearchHit extends Place, Pin {
  distanceKm: number
}

interface LayerConfig {
  url: string
  overlays: string[]
  maxNativeZoom: number
  attribution: string
}

interface MapConfig {
  center: Pin
  zoom: number
  maxZoom: number
  layers: { satellite: LayerConfig; streets: LayerConfig }
}

const FALLBACK_CONFIG: MapConfig = {
  center: { lat: 7.7712, lng: 4.5569 },
  zoom: 16,
  maxZoom: 20,
  layers: {
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      overlays: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      maxNativeZoom: 18,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
    streets: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      overlays: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      maxNativeZoom: 19,
      attribution: '© OpenStreetMap contributors · Esri, HERE, Garmin',
    },
  },
}

let configPromise: Promise<MapConfig> | null = null
function loadConfig(): Promise<MapConfig> {
  configPromise ??= fetch(`${API_BASE}/api/geo/config`)
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => (body?.data?.layers ? (body.data as MapConfig) : FALLBACK_CONFIG))
    .catch(() => FALLBACK_CONFIG)
  return configPromise
}

const PLUS_CODE = /\b[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i

/**
 * True for an address line that tells a rider nothing: empty, "Dropped pin",
 * a Plus Code like "QH9W+RH2", or bare coordinates. Such a line is replaced
 * with the words found for the pin; anything a person typed is kept.
 */
export function isUnreadable(text: string | null | undefined): boolean {
  const s = String(text ?? '').trim()
  if (!s) return true
  if (/^(dropped pin|current location|pinned location|pinned spot)$/i.test(s)) return true
  if (/^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$/.test(s)) return true
  return PLUS_CODE.test(s) && s.replace(PLUS_CODE, '').replace(/[\s,]+/g, '').length < 3
}

/** Words for a pin, from the backend. Null when nothing could be found. */
export async function reversePin(pin: Pin, signal?: AbortSignal): Promise<Place | null> {
  try {
    const r = await fetch(`${API_BASE}/api/geo/reverse?lat=${pin.lat}&lng=${pin.lng}`, { signal })
    if (!r.ok) return null
    const body = await r.json()
    return (body?.data as Place) ?? null
  } catch {
    return null
  }
}

async function searchPlaces(q: string, near: Pin, signal?: AbortSignal): Promise<SearchHit[]> {
  try {
    const r = await fetch(
      `${API_BASE}/api/geo/search?q=${encodeURIComponent(q)}&lat=${near.lat}&lng=${near.lng}`,
      { signal },
    )
    if (!r.ok) return []
    const body = await r.json()
    return Array.isArray(body?.data) ? (body.data as SearchHit[]) : []
  } catch {
    return []
  }
}

const STYLE_ID = 'bpp-style'
const CSS = `
.bpp{position:relative;border-radius:14px;overflow:hidden;background:#0d1417;isolation:isolate}
.bpp-map{position:absolute;inset:0;z-index:0}
.bpp-pin{position:absolute;left:50%;top:50%;z-index:500;pointer-events:none;transform:translate(-50%,-100%);transition:transform .15s ease}
.bpp.moving .bpp-pin{transform:translate(-50%,calc(-100% - 10px))}
.bpp-shadow{position:absolute;left:50%;top:50%;z-index:499;width:14px;height:5px;margin:-2px 0 0 -7px;border-radius:50%;background:rgba(0,0,0,.45);pointer-events:none}
.bpp-top{position:absolute;left:10px;right:10px;top:10px;z-index:600;display:flex;gap:8px}
.bpp-search{flex:1;position:relative}
.bpp-search input{width:100%;height:40px;border-radius:10px;border:0;padding:0 12px;font:inherit;font-size:14px;color:#0b1114;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25);outline:none}
.bpp-results{position:absolute;left:0;right:0;top:44px;background:#fff;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.3);overflow:hidden;max-height:260px;overflow-y:auto}
.bpp-results button{display:block;width:100%;text-align:left;padding:10px 12px;border:0;background:none;font:inherit;font-size:13px;color:#0b1114;cursor:pointer;border-bottom:1px solid #eef1f0}
.bpp-results button:hover,.bpp-results button:focus{background:#f2f6f4;outline:none}
.bpp-results small{display:block;color:#5d6a66;font-size:11.5px;margin-top:2px}
.bpp-btn{height:40px;min-width:40px;padding:0 12px;border-radius:10px;border:0;background:#fff;color:#0b1114;font:inherit;font-size:13px;font-weight:700;box-shadow:0 2px 10px rgba(0,0,0,.25);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.bpp-btn:disabled{opacity:.6;cursor:default}
.bpp-side{position:absolute;right:10px;bottom:34px;z-index:600;display:flex;flex-direction:column;gap:8px}
.bpp-hint{position:absolute;left:50%;top:58px;transform:translateX(-50%);max-width:calc(100% - 20px);overflow:hidden;text-overflow:ellipsis;z-index:600;background:rgba(10,15,18,.82);color:#fff;font-size:12px;padding:6px 10px;border-radius:999px;white-space:nowrap;pointer-events:none}
.bpp .leaflet-control-attribution{font-size:9.5px;background:rgba(255,255,255,.75)}
.bpp-place{display:flex;gap:10px;align-items:flex-start;margin-top:10px;font-size:14px;line-height:1.35}
.bpp-place b{display:block}
.bpp-place span{color:var(--bpp-muted,#7b8783);font-size:12.5px}
.bpp-err{color:#e5484d;font-size:12.5px;margin-top:6px}
`

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

const PinIcon = ({ color }: { color: string }) => (
  <svg width="38" height="50" viewBox="0 0 38 50" aria-hidden>
    <path d="M19 49s17-17.6 17-30A17 17 0 0 0 2 19c0 12.4 17 30 17 30Z" fill={color} stroke="#0a0f12" strokeWidth="2" />
    <circle cx="19" cy="19" r="6.5" fill="#0a0f12" />
  </svg>
)

export interface PinPickerProps {
  /** Where to start. Without one, the map opens on the person's GPS position (if allowed) or the service centre. */
  value?: Pin | null
  /** Called when the map settles: the pin, and words for it (null while unknown). */
  onChange: (pin: Pin, place: Place | null) => void
  height?: number | string
  /** Pin colour. Lime on the dark apps; the logo colour is never put on lime. */
  accent?: string
  /** Ask for the device's position on open when there is no `value`. */
  locateOnOpen?: boolean
}

export default function PinPicker({ value, onChange, height = 380, accent = '#AFFF00', locateOnOpen = true }: PinPickerProps) {
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<L.TileLayer[]>([])
  const cfgRef = useRef<MapConfig>(FALLBACK_CONFIG)
  const accuracyRef = useRef<L.Circle | null>(null)
  const reverseAbort = useRef<AbortController | null>(null)
  const settleTimer = useRef<number | undefined>(undefined)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  // Nothing is reported until the person has put the pin somewhere: dragged
  // the map, picked a search result, or been located. Otherwise opening the
  // picker would quietly "pin" the default centre of town.
  const touchedRef = useRef(Boolean(value))
  const [touched, setTouched] = useState(Boolean(value))
  const touch = () => {
    touchedRef.current = true
    setTouched(true)
  }

  const [mode, setMode] = useState<'satellite' | 'streets'>('satellite')
  const [moving, setMoving] = useState(false)
  const [place, setPlace] = useState<Place | null>(null)
  const [looking, setLooking] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [ready, setReady] = useState(false)

  // Build the map once.
  useEffect(() => {
    ensureStyle()
    let cancelled = false
    void loadConfig().then((cfg) => {
      if (cancelled || !box.current) return
      cfgRef.current = cfg
      const start = value ?? cfg.center
      const map = L.map(box.current, {
        center: [start.lat, start.lng],
        zoom: value ? 18 : cfg.zoom,
        maxZoom: cfg.maxZoom,
        zoomControl: false,
        attributionControl: true,
      })
      L.control.zoom({ position: 'bottomleft' }).addTo(map)
      mapRef.current = map
      map.on('dragstart', touch)
      map.on('movestart', () => setMoving(true))
      map.on('moveend', () => {
        setMoving(false)
        window.clearTimeout(settleTimer.current)
        settleTimer.current = window.setTimeout(settle, 450)
      })
      setReady(true)
      // Inside a sheet or modal the box is still animating when the map is
      // made, and Leaflet measures it once; re-measure whenever it changes.
      if (typeof ResizeObserver !== 'undefined') {
        resizeObs = new ResizeObserver(() => map.invalidateSize())
        resizeObs.observe(box.current)
      }
      window.setTimeout(() => map.invalidateSize(), 350)
      if (!value && locateOnOpen) locate()
      else settle()
    })
    let resizeObs: ResizeObserver | null = null
    return () => {
      cancelled = true
      resizeObs?.disconnect()
      window.clearTimeout(settleTimer.current)
      reverseAbort.current?.abort()
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Swap tile layers when the mode changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    layersRef.current.forEach((l) => l.remove())
    const cfg = cfgRef.current.layers[mode]
    const common = { maxZoom: cfgRef.current.maxZoom, maxNativeZoom: cfg.maxNativeZoom }
    const base = L.tileLayer(cfg.url, { ...common, attribution: cfg.attribution })
    const overlays = cfg.overlays.map((url, i) => L.tileLayer(url, { ...common, zIndex: 2 + i }))
    layersRef.current = [base, ...overlays]
    layersRef.current.forEach((l) => l.addTo(map))
  }, [mode, ready])

  function settle() {
    const map = mapRef.current
    if (!map || !touchedRef.current) return
    const c = map.getCenter()
    const pin = { lat: Number(c.lat.toFixed(7)), lng: Number(c.lng.toFixed(7)) }
    onChangeRef.current(pin, null)
    reverseAbort.current?.abort()
    const ctl = new AbortController()
    reverseAbort.current = ctl
    setLooking(true)
    void reversePin(pin, ctl.signal).then((p) => {
      if (ctl.signal.aborted) return
      setLooking(false)
      setPlace(p)
      onChangeRef.current(pin, p)
    })
  }

  function locate() {
    if (!('geolocation' in navigator)) {
      setError('This browser cannot share your location. Move the map to the spot instead.')
      return
    }
    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const map = mapRef.current
        if (!map) return
        const { latitude, longitude, accuracy } = pos.coords
        touch()
        accuracyRef.current?.remove()
        accuracyRef.current = L.circle([latitude, longitude], {
          radius: accuracy,
          color: accent,
          weight: 1,
          fillOpacity: 0.12,
          interactive: false,
        }).addTo(map)
        map.setView([latitude, longitude], 18)
        if (accuracy > 60) {
          setError(`Your phone says it is within ${Math.round(accuracy)} m. Move the map so the pin sits on the exact building.`)
        }
      },
      (err) => {
        setLocating(false)
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location is blocked. Search or move the map to the spot instead.'
            : 'Could not find your location. Search or move the map to the spot instead.',
        )
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    )
  }

  // Search as you type, debounced.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) {
      setHits([])
      return
    }
    const ctl = new AbortController()
    const t = window.setTimeout(() => {
      const c = mapRef.current?.getCenter()
      void searchPlaces(q, c ? { lat: c.lat, lng: c.lng } : cfgRef.current.center, ctl.signal).then((r) => {
        if (!ctl.signal.aborted) setHits(r)
      })
    }, 450)
    return () => {
      window.clearTimeout(t)
      ctl.abort()
    }
  }, [query])

  const pick = (hit: SearchHit) => {
    setHits([])
    setQuery(hit.label)
    touch()
    mapRef.current?.setView([hit.lat, hit.lng], 18)
  }

  return (
    <div>
      <div className={`bpp${moving ? ' moving' : ''}`} style={{ height }}>
        <div ref={box} className="bpp-map" />
        <div className="bpp-shadow" />
        <div className="bpp-pin">
          <PinIcon color={accent} />
        </div>

        <div className="bpp-top">
          <div className="bpp-search">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a place, e.g. a hostel or junction"
              aria-label="Search for a place"
            />
            {hits.length > 0 && (
              <div className="bpp-results" role="listbox">
                {hits.map((h) => (
                  <button key={`${h.lat},${h.lng}`} type="button" onClick={() => pick(h)}>
                    {h.line || h.label}
                    <small>
                      {[h.area, h.city].filter(Boolean).join(', ')}
                      {h.distanceKm ? ` · ${h.distanceKm} km` : ''}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="bpp-btn"
            onClick={() => setMode((m) => (m === 'satellite' ? 'streets' : 'satellite'))}
            aria-label={mode === 'satellite' ? 'Show street map' : 'Show satellite'}
          >
            {mode === 'satellite' ? 'Map' : 'Satellite'}
          </button>
        </div>

        <div className="bpp-side">
          <button type="button" className="bpp-btn" onClick={locate} disabled={locating} aria-label="Go to my location">
            {locating ? '…' : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
            )}
          </button>
        </div>
        {!moving && hits.length === 0 && <div className="bpp-hint">Move the map to put the pin on the exact spot</div>}
      </div>

      <div className="bpp-place" aria-live="polite">
        <PinIcon color={accent} />
        <div>
          <b>
            {!touched
              ? 'No pin yet'
              : looking
                ? 'Finding the address…'
                : place
                  ? place.line || place.label
                  : 'Pinned spot'}
          </b>
          <span>
            {!touched
              ? 'Tap the locate button, search, or move the map onto the spot.'
              : looking
                ? ' '
                : place
                  ? [place.area, place.city, place.state].filter(Boolean).join(', ')
                  : 'We could not name this spot, but the pin is exact. Add a landmark below.'}
          </span>
        </div>
      </div>
      {error && <div className="bpp-err">{error}</div>}
    </div>
  )
}

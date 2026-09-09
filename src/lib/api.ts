import axios, { AxiosError } from 'axios'
import { auth } from './firebase'

const FALLBACK_API_URL = 'https://blorbmart-tr1i.onrender.com'

/**
 * The API host.
 *
 * `??` is deliberately not used here. A hosting dashboard holding
 * `VITE_API_URL` with an empty value builds to an empty string, not
 * `undefined` — so `??` keeps it, axios reads '' as "same origin", and every
 * call lands on the static host serving this console instead of the backend.
 * That host answers 404 to /api/*, so the admin gate never resolves and the
 * console looks broken to someone who signed in perfectly well. This shipped
 * twice: first on the rider app, then here.
 */
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()
export const BASE_URL = configuredApiUrl
  ? configuredApiUrl.replace(/[/]+$/, '')
  : FALLBACK_API_URL

/**
 * 45s, not the usual 20.
 *
 * The API sleeps when idle and this console is often the first thing opened
 * in the morning, so the first request of the day pays a cold start. A short
 * timeout there produces a dashboard that looks broken exactly when somebody
 * is checking whether anything is broken.
 */
const api = axios.create({ baseURL: BASE_URL, timeout: 45_000 })

api.interceptors.request.use(async (config) => {
  const user = auth.currentUser
  if (user) config.headers.Authorization = `Bearer ${await user.getIdToken()}`
  return config
})

export function errorMessage(error: unknown, fallback = 'Something went wrong.') {
  const e = error as AxiosError<{ message?: string }>
  if (e?.response?.data?.message) return e.response.data.message
  if (e?.code === 'ECONNABORTED') return 'The API did not respond in time. It may be waking up — retry.'
  if (e?.message === 'Network Error') return 'Cannot reach the API. Check your connection.'
  const status = e?.response?.status
  if (status === 403) return 'Your account does not have admin access.'
  if (status === 401) return 'Your session expired. Sign in again.'
  if (status === 404) return 'That endpoint does not exist on this server. Check the deployed backend version.'
  if (status && status >= 500) return 'The API failed on this request. Check server logs.'
  return fallback
}

export function errorStatus(error: unknown): number | null {
  return (error as AxiosError)?.response?.status ?? null
}

const unwrap = <T,>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data)

/* ────────────────────────────── Shared types ─────────────────────────── */

export interface Paged<T> {
  count: number
  pagination?: { page: number; pageSize: number; hasMore: boolean; nextPage: number | null } | null
  nextCursor?: { cursorId: string; cursorCreatedAt: number | null } | null
  items: T[]
}

export interface AdminIdentity {
  uid: string
  email: string | null
  role: string | null
  admin: boolean
}

export interface Overview {
  counts: { users: number; vendors: number; products: number; orders: number; riders: number }
  activity: { orders24h: number; orders7d: number; bills24h: number; gmv24h: number; paid24h: number }
  queues: { ridersPending: number; vendorsPending: number; ridersOnline: number }
  orderStatus: Record<string, number>
  sampledOrders: number
}

export interface Health {
  checkedAt: number
  firestore: { ok: boolean; latencyMs: number; error: string | null; grade: 'good' | 'slow' | 'degraded' }
  process: {
    uptimeSeconds: number
    memoryMb: number
    nodeVersion: string
    loadAverage: number
    environment: string
  }
  integrations: { name: string; configured: boolean; detail: string }[]
  signals: {
    orders1h: number
    orders24h: number
    failedBills24h: number
    pendingRiderWithdrawals: number
    ridersOnline: number
  }
}

export interface Rider {
  uid: string
  firstName: string
  lastName: string
  displayName: string
  email: string | null
  phone: string | null
  status: 'onboarding' | 'pending' | 'active' | 'suspended' | 'rejected'
  onboardingStep: string | null
  onboardingComplete: boolean
  vehicleType: string | null
  plateNumber: string | null
  universityId: string | null
  universityName: string | null
  isAvailable: boolean
  online: boolean
  rating: number
  deliveriesCompleted: number
  deliveriesCancelled: number
  documents: { idType: string; idNumber: string } | null
  lastSeenAt: number | null
  createdAt: number | null
}

export interface Withdrawal {
  id: string
  system: 'rider' | 'seller'
  userId: string | null
  amount: number
  status: string
  bankName: string | null
  accountMasked: string | null
  accountName: string | null
  reference: string | null
  failureReason: string | null
  initiatedAt: number | null
  completedAt: number | null
}

export interface WalletSummary {
  systems: {
    system: string
    wallets: number
    truncated: boolean
    availableBalance: number
    cashOutstanding: number
    totalEarned: number
  }[]
  totalFloat: number
  cashOutstanding: number
  pendingWithdrawals: { system: string; count: number; amount: number }[]
  cap: number
}

export interface BillPayment {
  id: string
  userId: string | null
  category: string | null
  serviceId: string | null
  serviceName: string | null
  recipient: string | null
  amount: number
  cashback: number
  status: string | null
  reference: string | null
  providerRef: string | null
  simulated: boolean
  createdAt: number | null
}

export interface CampusMaintenance {
  enabled: boolean
  message: string | null
  startedAt?: string | null
  startedBy?: string | null
  endedAt?: string | null
}

export interface CampusHeadOfOps {
  userId: string
  email: string | null
  name: string | null
  phone: string | null
  status: 'active' | 'revoked'
  assignedAt: string | null
  assignedBy: string | null
  revokedAt: string | null
  mustChangePassword: boolean
}

export interface CampusRow {
  id: string
  name: string
  shortName: string
  state: string | null
  city: string | null
  stores: number
  products: number
  riders: number
  activeRiders: number
  buyers: number
  live: boolean
  active: boolean
  maintenance: CampusMaintenance
  headOfOps: CampusHeadOfOps | null
  /** 'seed' ships in the backend's static registry; 'firestore' was added here. */
  source: 'seed' | 'firestore'
}

/** The management view: identity and operational state, without the counts. */
export interface CampusRecord {
  id: string
  name: string
  shortName: string
  state: string | null
  city: string | null
  active: boolean
  source: 'seed' | 'firestore'
  maintenance: CampusMaintenance
  headOfOps: CampusHeadOfOps | null
  createdAt: string | null
  updatedAt: string | null
}

export interface AssignHeadResult {
  campus: CampusRecord
  userId: string
  email: string
  accountCreated: boolean
  emailed: boolean
  emailError: string | null
  /**
   * Present only when the credentials email did not send. The backend
   * withholds it on success rather than putting a live password into a
   * response that lands in browser history and error trackers.
   */
  temporaryPassword?: string
}

export interface BroadcastResult {
  campus: { id: string; name: string }
  audience: string
  channels: string[]
  result: {
    inApp?: { sentCount: number; totalUsers: number; skipped?: boolean }
    push?: { sentCount: number; failedCount: number; totalTokens: number; skipped?: boolean }
    email?: { sentCount: number; failedCount: number; totalEmails: number; skipped?: boolean }
  }
}

export interface Delivery {
  id: string
  orderId: string | null
  riderId: string | null
  riderName: string | null
  status: string | null
  mode: string | null
  settlement: string | null
  storeName: string | null
  dropoffArea: string | null
  earnings: number
  cashToPay: number
  createdAt: number | null
  deliveredAt: number | null
}

export interface TicketTier {
  id: string
  name: string
  description: string
  price: number
  free: boolean
  quantity: number
  sold: number
  remaining: number | null
  soldOut: boolean
  maxPerOrder: number
  salesEndAt: string | null
}

export interface BlorbEvent {
  id: string
  organizerId: string
  organizerName: string
  storeId: string
  title: string
  description: string
  category: string
  coverUrl: string
  venueName: string
  venueAddress: string
  city: string
  startsAt: string | null
  endsAt: string | null
  status: 'draft' | 'published' | 'cancelled'
  currency: string
  ticketTypes: TicketTier[]
  totalCapacity: number
  totalSold: number
}

/** What the organizer console needs to know about one ticket holder. */
export interface EventTicket {
  id: string
  eventTitle: string
  ticketTypeName: string
  holderName: string
  holderPhone: string
  price: number
  status: string
  createdAt: string | null
  usedAt: string | null
}

/** The shape the events API accepts back. Tier ids are preserved on edit so
 *  `sold` counts survive; a new tier simply arrives without one. */
export interface EventDraft {
  title: string
  description: string
  category: string
  coverUrl: string
  venueName: string
  venueAddress: string
  city: string
  startsAt: string
  endsAt: string | null
  organizerName: string
  status: 'draft' | 'published' | 'cancelled'
  ticketTypes: {
    id?: string
    name: string
    description: string
    price: number
    quantity: number
    maxPerOrder: number
  }[]
}

/** Rows from the pre-existing admin router, which returns loosely-typed docs. */
export type Row = Record<string, unknown>

/* ──────────────────────────────── Client ─────────────────────────────── */

type Q = Record<string, string | number | undefined | null>

const clean = (params: Q) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all'),
  )

export const adminApi = {
  me: () => unwrap<AdminIdentity>(api.get('/api/admin/me')),

  /* Oversight (routes/adminOversight.js) */
  overview: () => unwrap<Overview>(api.get('/api/admin/overview')),
  health: () => unwrap<Health>(api.get('/api/admin/health')),

  riders: (params: Q = {}) =>
    unwrap<{ count: number; riders: Rider[] }>(api.get('/api/admin/riders', { params: clean(params) })),
  rider: (uid: string) =>
    unwrap<{ rider: Row; wallet: Row; deliveries: Row[] }>(api.get(`/api/admin/riders/${uid}`)),
  setRiderStatus: (uid: string, status: string, reason?: string) =>
    unwrap<Row>(api.patch(`/api/admin/riders/${uid}/status`, { status, reason })),

  deliveries: (params: Q = {}) =>
    unwrap<{ count: number; deliveries: Delivery[] }>(
      api.get('/api/admin/deliveries', { params: clean(params) }),
    ),

  walletSummary: () => unwrap<WalletSummary>(api.get('/api/admin/wallets/summary')),
  withdrawals: (params: Q = {}) =>
    unwrap<{ count: number; withdrawals: Withdrawal[] }>(
      api.get('/api/admin/withdrawals', { params: clean(params) }),
    ),
  setWithdrawalStatus: (system: string, id: string, status: string, note?: string) =>
    unwrap<Row>(api.patch(`/api/admin/withdrawals/${system}/${id}/status`, { status, note })),

  bills: (params: Q = {}) =>
    unwrap<{ count: number; bills: BillPayment[]; totals: { amount: number; byStatus: Record<string, number> } }>(
      api.get('/api/admin/bills', { params: clean(params) }),
    ),

  campuses: () =>
    unwrap<{
      campuses: CampusRow[]
      billsOnlyBuyers: number
      untagged: { stores: number; products: number }
    }>(api.get('/api/admin/campuses')),

  /* ── Campus management (routes/campusAdmin.js) ─────────────────────── */

  /** Identity and operational state only — no per-campus aggregate counts. */
  manageCampuses: () =>
    unwrap<{ campuses: CampusRecord[]; count: number }>(api.get('/api/admin/campuses/manage')),

  createCampus: (body: {
    name: string
    shortName?: string
    state?: string
    city?: string
    aliases?: string[]
  }) => unwrap<CampusRecord>(api.post('/api/admin/campuses', body)),

  /**
   * Presentation and availability only.
   *
   * There is no id here on purpose: a campus id is written onto every user,
   * store, product and rider on that campus, and changing it detaches all of
   * them silently. The backend has no branch that accepts one either.
   */
  updateCampus: (
    id: string,
    body: { name?: string; shortName?: string; state?: string; city?: string; active?: boolean },
  ) => unwrap<CampusRecord>(api.patch(`/api/admin/campuses/${id}`, body)),

  assignHeadOfOps: (id: string, body: { email: string; name?: string; phone?: string }) =>
    unwrap<AssignHeadResult>(api.post(`/api/admin/campuses/${id}/head-of-ops`, body)),

  revokeHeadOfOps: (id: string, reason?: string) =>
    unwrap<{ campus: CampusRecord; userId: string; accountDisabled: boolean; emailed: boolean }>(
      // A body on DELETE is unusual but supported by both axios and the route,
      // and the reason belongs with the act rather than in a query string
      // where it would end up in server access logs.
      api.delete(`/api/admin/campuses/${id}/head-of-ops`, { data: { reason } }),
    ),

  resetHeadOfOpsPassword: (id: string) =>
    unwrap<{ emailed: boolean; emailError: string | null; email: string; temporaryPassword?: string }>(
      api.post(`/api/admin/campuses/${id}/head-of-ops/reset-password`, {}),
    ),

  setCampusMaintenance: (
    id: string,
    body: { enabled: boolean; message?: string; notify?: boolean; channels?: string[] },
  ) =>
    unwrap<{ campus: CampusRecord; notified: boolean; result: BroadcastResult['result'] }>(
      api.post(`/api/admin/campuses/${id}/maintenance`, body),
    ),

  broadcastToCampus: (
    id: string,
    body: {
      title: string
      subject?: string
      body: string
      audience?: 'all' | 'buyers' | 'vendors' | 'riders'
      channels?: string[]
    },
  ) => unwrap<BroadcastResult>(api.post(`/api/admin/campuses/${id}/broadcast`, body)),

  /* Pre-existing admin router (routes/admin.js) */
  metrics: () => unwrap<Row>(api.get('/api/admin/metrics')),

  orders: (params: Q = {}) =>
    unwrap<{ count: number; orders: Row[]; pagination: Paged<Row>['pagination'] }>(
      api.get('/api/admin/orders', { params: clean(params) }),
    ),
  order: (id: string) => unwrap<Row>(api.get(`/api/admin/orders/${id}`)),
  /**
   * Takes a refunded amount back off the seller.
   *
   * This does NOT move money to the customer — it deducts from the seller's
   * wallet (available first, then pending). Refunding the buyer is a separate
   * act on the payment provider, and an admin who reads this as "the customer
   * has been refunded" will leave them out of pocket. The amount goes over the
   * wire in kobo, which is what the endpoint expects.
   */
  refundOrder: (id: string, body: { amountKobo: number; reason?: string; storeId?: string | null }) =>
    unwrap<Row>(api.post(`/api/admin/orders/${id}/refund`, body)),

  /**
   * Corrects the seller details carried on an order.
   *
   * Ops email and receipts read these fields, so a wrong shop name or phone
   * number follows the order everywhere until someone overrides it here.
   */
  sellerOverride: (
    id: string,
    body: { vendorName?: string; restaurantAddress?: string; contactNumber?: string; email?: string },
  ) => unwrap<Row>(api.patch(`/api/admin/orders/${id}/seller-override`, body)),
  reconcileOrder: (id: string) => unwrap<Row>(api.post(`/api/admin/orders/${id}/reconcile-payment`)),
  resendOpsEmail: (id: string) => unwrap<Row>(api.post(`/api/admin/orders/${id}/resend-ops-email`)),

  users: (params: Q = {}) =>
    unwrap<{ count: number; users: Row[]; pagination: Paged<Row>['pagination'] }>(
      api.get('/api/admin/users', { params: clean(params) }),
    ),
  user: (id: string) => unwrap<Row>(api.get(`/api/admin/users/${id}`)),
  userAction: (id: string, action: string, reason?: string) =>
    unwrap<Row>(api.patch(`/api/admin/users/${id}/action`, { action, reason })),

  vendors: (params: Q = {}) =>
    unwrap<{ count: number; vendors: Row[]; pagination: Paged<Row>['pagination'] }>(
      api.get('/api/admin/vendors', { params: clean(params) }),
    ),
  setVendorStatus: (id: string, status: string, reason?: string) =>
    unwrap<Row>(api.patch(`/api/admin/vendors/${id}/status`, { status, reason })),
  deleteVendor: (id: string) => unwrap<Row>(api.delete(`/api/admin/vendors/${id}`)),

  products: (params: Q = {}) =>
    unwrap<{ count: number; products: Row[]; pagination: Paged<Row>['pagination'] }>(
      api.get('/api/admin/products', { params: clean(params) }),
    ),

  activity: (params: Q = {}) =>
    unwrap<{ count: number; activity: Row[]; pagination: Paged<Row>['pagination'] }>(
      api.get('/api/admin/activity', { params: clean(params) }),
    ),

  settings: () => unwrap<Row>(api.get('/api/admin/settings')),
  updateSettings: (body: Row) => unwrap<Row>(api.patch('/api/admin/settings', body)),

  promos: () => unwrap<Row>(api.get('/api/admin/promo-codes')),
  createPromo: (body: Row) => unwrap<Row>(api.post('/api/admin/promo-codes', body)),
  updatePromo: (id: string, body: Row) => unwrap<Row>(api.patch(`/api/admin/promo-codes/${id}`, body)),
  deletePromo: (id: string) => unwrap<Row>(api.delete(`/api/admin/promo-codes/${id}`)),

  landmarks: () => unwrap<Row>(api.get('/api/admin/delivery-landmarks')),
  createLandmark: (body: Row) => unwrap<Row>(api.post('/api/admin/delivery-landmarks', body)),
  updateLandmark: (id: string, body: Row) =>
    unwrap<Row>(api.patch(`/api/admin/delivery-landmarks/${id}`, body)),
  deleteLandmark: (id: string) => unwrap<Row>(api.delete(`/api/admin/delivery-landmarks/${id}`)),

  /*
   * Per-category commission.
   *
   * Note the path: this router mounts at /api/category-commission, not under
   * /api/admin like everything else here. It is admin-gated all the same — the
   * guard sits on the mount rather than in the path.
   *
   * Reading the list seeds the platform defaults into Firestore the first time
   * it is called, so an unconfigured backend and a configured one look the
   * same from this console: a full table.
   */
  categoryCommissions: () => unwrap<Row[]>(api.get('/api/category-commission')),
  createCategoryCommission: (body: {
    categoryId: string
    categoryName: string
    commissionPercent: number
    active?: boolean
  }) => unwrap<Row>(api.post('/api/category-commission', body)),
  updateCategoryCommission: (
    id: string,
    body: { categoryName?: string; commissionPercent?: number; active?: boolean },
  ) => unwrap<Row>(api.patch(`/api/category-commission/${id}`, body)),
  deleteCategoryCommission: (id: string) =>
    unwrap<Row>(api.delete(`/api/category-commission/${id}`)),

  broadcast: (body: Row) => unwrap<Row>(api.post('/api/admin/broadcast', body)),
  broadcastHistory: () => unwrap<Row>(api.get('/api/admin/broadcast/history')),

  /* Events. Same service the organizer app writes through, with the
     organizer-ownership check lifted for staff. */
  events: (params: Q = {}) =>
    unwrap<{ events: BlorbEvent[] }>(api.get('/api/admin/events', { params: clean(params) })),
  createEvent: (body: EventDraft) => unwrap<BlorbEvent>(api.post('/api/admin/events', body)),
  updateEvent: (id: string, body: EventDraft) =>
    unwrap<BlorbEvent>(api.put(`/api/admin/events/${id}`, body)),
  setEventStatus: (id: string, status: BlorbEvent['status']) =>
    unwrap<BlorbEvent>(api.patch(`/api/admin/events/${id}/status`, { status })),
  eventAttendees: (id: string) =>
    unwrap<{ tickets: EventTicket[]; checkedIn: number; total: number }>(
      api.get(`/api/admin/events/${id}/attendees`),
    ),

  /**
   * CSV exports stream from the server already formatted, so they are fetched
   * as a blob and handed to the browser rather than rebuilt here — the server
   * is the one place that knows which columns an export is supposed to have.
   */
  async exportCsv(resource: 'users' | 'vendors' | 'orders' | 'products' | 'activity', params: Q = {}) {
    const res = await api.get(`/api/admin/${resource}/export`, {
      params: clean(params),
      responseType: 'blob',
      timeout: 120_000,
    })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `blorbmart-${resource}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}

/* ══════════════════ Campus head of operations ═══════════════════════════ */

export interface CampusIdentity {
  uid: string
  email: string | null
  name: string | null
  role: 'head_of_ops'
  /**
   * True from the moment the account is provisioned until they set their own
   * password. The console forces the change-password screen on this alone.
   */
  mustChangePassword: boolean
  campus: {
    id: string
    name: string
    shortName: string
    active: boolean
    maintenance: CampusMaintenance
  } | null
}

export interface CampusOverview {
  campus: {
    id: string
    name: string
    shortName: string
    city: string | null
    state: string | null
    active: boolean
    maintenance: CampusMaintenance
  } | null
  counts: {
    stores: number
    products: number
    riders: number
    activeRiders: number
    buyers: number
    pendingVendors: number
  }
  live: boolean
}

export interface CampusOrder {
  id: string
  orderId: string
  status: string
  paymentStatus: string | null
  subtotal: number
  deliveryFee: number
  discountAmount: number
  totalAmount: number
  itemCount: number
  customerName: string | null
  address: string | null
  riderId: string | null
  createdAt: number | null
}

export interface CampusVendor {
  id: string
  businessName: string | null
  businessEmail: string | null
  businessPhone: string | null
  status: string
  sellerType: string | null
  createdAt: number | null
}

export interface CampusRider {
  uid: string
  name: string | null
  email: string | null
  phone: string | null
  status: string
  vehicleType: string | null
  online: boolean
  deliveriesCompleted: number
  rating: number
  lastSeenAt: number | null
}

/**
 * The head of operations' API.
 *
 * Every call here is scoped to their own campus by the server, from their user
 * document — there is deliberately no campus argument on any of them. A campus
 * id in this file would be a lie about where the boundary is.
 */
export const campusApi = {
  me: () => unwrap<CampusIdentity>(api.get('/api/head-of-ops/me')),

  /**
   * Usable while `mustChangePassword` is still true — the account is holding
   * its emailed temporary password at that point, and this is how it stops.
   */
  setPassword: (newPassword: string) =>
    unwrap<{ changed: boolean }>(api.post('/api/head-of-ops/password', { newPassword })),

  overview: () => unwrap<CampusOverview>(api.get('/api/head-of-ops/overview')),

  orders: (params: Q = {}) =>
    unwrap<{ count: number; orders: CampusOrder[]; scannedWindow: number; windowLimit: number }>(
      api.get('/api/head-of-ops/orders', { params: clean(params) }),
    ),

  vendors: (params: Q = {}) =>
    unwrap<{ count: number; vendors: CampusVendor[] }>(
      api.get('/api/head-of-ops/vendors', { params: clean(params) }),
    ),

  setVendorStatus: (vendorId: string, status: string, reason?: string) =>
    unwrap<{ vendorId: string; status: string }>(
      api.patch(`/api/head-of-ops/vendors/${vendorId}/status`, { status, reason }),
    ),

  riders: () => unwrap<{ count: number; riders: CampusRider[] }>(api.get('/api/head-of-ops/riders')),

  broadcast: (body: {
    title: string
    subject?: string
    body: string
    audience?: 'all' | 'buyers' | 'vendors' | 'riders'
    channels?: string[]
  }) => unwrap<Omit<BroadcastResult, 'campus'>>(api.post('/api/head-of-ops/broadcast', body)),

  setMaintenance: (body: { enabled: boolean; message?: string; notify?: boolean; channels?: string[] }) =>
    unwrap<{ campus: CampusRecord; notified: boolean; result: BroadcastResult['result'] }>(
      api.post('/api/head-of-ops/maintenance', body),
    ),
}

export default api

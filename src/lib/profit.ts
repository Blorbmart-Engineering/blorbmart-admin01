import api from './api'

export type ProfitRange = 'today' | 'week' | 'month' | 'custom'

export interface ProfitRow {
  id: string
  orderId: string
  storeName: string | null
  /** When the order was delivered, which is when its profit counts. */
  recognisedAt: number | null
  subtotal: number
  serviceFee: number
  deliveryFee: number
  deliveryCommission: number
  promoCost: number
  riderBonus: number
  profit: number
  /** `reversed`: refunded or cancelled after delivery. Listed, never summed. */
  status: 'recognised' | 'reversed'
  reversalReason: string | null
}

export interface ProfitTotals {
  orders: number
  serviceFee: number
  deliveryFee: number
  deliveryCommission: number
  promoCost: number
  riderBonus: number
  profit: number
}

export interface ProfitReport {
  range: ProfitRange
  from: number
  to: number
  deliveryCommissionPercent: number
  totals: ProfitTotals
  reversed: number
  truncated: boolean
  rows: ProfitRow[]
}

/**
 * What the platform earned — GET /api/admin/profit (routes/adminOversight.js).
 *
 * Profit per order is the service fee plus the platform's share of the
 * delivery fee, less promotions and rider sourcing bonuses, frozen when the
 * order was delivered. Kept out of lib/api.ts so the dashboard and the Profit
 * page share one definition of the report without growing that file further.
 */
export const profitApi = {
  report: (params: { range: Exclude<ProfitRange, 'custom'> } | { from: string; to: string }) =>
    api.get<{ data: ProfitReport }>('/api/admin/profit', { params }).then((res) => res.data.data),
}

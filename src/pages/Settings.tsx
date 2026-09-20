import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Save } from 'lucide-react'
import { adminApi, errorMessage, type Row } from '../lib/api'
import { Button, Card, ErrorState, Input, PageHeader } from '../components/ui'

/**
 * Platform settings.
 *
 * Every field here is priced into a live checkout the moment it is saved, so
 * the form is explicit about that rather than pretending to be preferences.
 * Only fields that actually changed are sent, which keeps a stale form from
 * quietly reverting a value somebody else edited in the meantime.
 */
const FIELDS: { key: string; label: string; hint: string; prefix?: string }[] = [
  { key: 'deliveryFee', label: 'Default delivery fee', hint: 'Used when no zone-specific price applies', prefix: '₦' },
  { key: 'campusDeliveryFee', label: 'Campus delivery fee', hint: 'Hostel-to-hostel and on-campus runs', prefix: '₦' },
  { key: 'serviceFee', label: 'Service fee', hint: 'Added to every order', prefix: '₦' },
  { key: 'minOrderAmount', label: 'Minimum order', hint: 'Below this, checkout is blocked', prefix: '₦' },
  { key: 'commissionPercent', label: 'Commission', hint: 'Platform share of each order, in percent' },
  { key: 'riderSharePercent', label: 'Rider share', hint: 'Rider share of the delivery fee, in percent' },
]

/**
 * Bill transaction fees, per category.
 *
 * Charged on top of what the customer buys — ₦10 on a ₦500 airtime top-up
 * takes ₦510 and still delivers ₦500 of airtime — and refunded with the rest
 * when a purchase fails. Set to 0 to make a category free.
 */
const BILL_FEES: { key: string; label: string; hint: string }[] = [
  { key: 'airtime', label: 'Airtime', hint: 'MTN, Glo, Airtel, 9mobile top-ups' },
  { key: 'data', label: 'Data', hint: 'Every data bundle' },
  { key: 'electricity', label: 'Electricity', hint: 'Meter top-ups' },
  { key: 'tv', label: 'Cable TV', hint: 'DStv, GOtv, StarTimes' },
  { key: 'education', label: 'Education', hint: 'WAEC and JAMB PINs' },
]

export default function Settings() {
  const queryClient = useQueryClient()
  const settings = useQuery({ queryKey: ['settings'], queryFn: adminApi.settings, staleTime: 60_000 })

  const [draft, setDraft] = useState<Record<string, string>>({})
  const [fees, setFees] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')

  /** The stored fee table, with every category present. */
  const storedFees = ((settings.data as Row | undefined)?.billFees ?? {}) as Record<string, unknown>
  const storedFee = (key: string) => String(storedFees[key] ?? '')

  // Seeded once the server value arrives, then left alone so typing is never
  // overwritten by a background refetch mid-edit.
  useEffect(() => {
    if (!settings.data) return
    const data = settings.data as Row
    const next: Record<string, string> = {}
    for (const field of FIELDS) next[field.key] = String(data[field.key] ?? '')
    setDraft(next)

    const table = (data.billFees ?? {}) as Record<string, unknown>
    const nextFees: Record<string, string> = {}
    for (const field of BILL_FEES) nextFees[field.key] = String(table[field.key] ?? '')
    setFees(nextFees)

    setNotes(String(data.addressNotes ?? ''))
  }, [settings.data])

  const save = useMutation({
    mutationFn: () => {
      const original = (settings.data ?? {}) as Row
      const patch: Row = {}
      for (const field of FIELDS) {
        const value = draft[field.key]
        if (value !== undefined && value !== String(original[field.key] ?? '')) {
          patch[field.key] = Number(value)
        }
      }
      // The fee table is sent whole when any of it changed: it is one map on
      // the settings document, and sending a single key would be read as the
      // whole table on a backend that merges maps by key.
      const feePatch: Row = {}
      let feesChanged = false
      for (const field of BILL_FEES) {
        const value = fees[field.key]
        if (value === undefined || value === '') continue
        feePatch[field.key] = Number(value)
        if (value !== storedFee(field.key)) feesChanged = true
      }
      if (feesChanged) patch.billFees = feePatch

      if (notes !== String(original.addressNotes ?? '')) patch.addressNotes = notes
      return adminApi.updateSettings(patch)
    },
    onSuccess: () => {
      toast.success('Settings saved')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save settings.')),
  })

  const original = (settings.data ?? {}) as Row
  const dirty =
    FIELDS.some((f) => draft[f.key] !== undefined && draft[f.key] !== String(original[f.key] ?? '')) ||
    BILL_FEES.some((f) => fees[f.key] !== undefined && fees[f.key] !== storedFee(f.key)) ||
    notes !== String(original.addressNotes ?? '')

  if (settings.isError) {
    return (
      <>
        <PageHeader title="Platform settings" />
        <Card>
          <ErrorState message={errorMessage(settings.error)} onRetry={() => settings.refetch()} />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Platform settings"
        subtitle="Fees and limits applied to every order on the platform."
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={Save}
            loading={save.isPending}
            disabled={!dirty}
            onClick={() => save.mutate()}
          >
            {dirty ? 'Save changes' : 'Saved'}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Pricing" subtitle="Changes take effect on the next checkout">
          <div className="space-y-3.5">
            {FIELDS.map((field) => (
              <div key={field.key}>
                <Input
                  label={field.label}
                  type="number"
                  inputMode="decimal"
                  disabled={settings.isLoading}
                  value={draft[field.key] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                />
                <p className="mt-1 text-[11.5px] text-ink-faint">
                  {field.hint}
                  {draft[field.key] !== undefined && draft[field.key] !== String(original[field.key] ?? '') && (
                    <span className="ml-1.5 font-semibold text-warn">
                      was {String(original[field.key] ?? '—')}
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title="Bill transaction fees"
          subtitle="Charged on top of airtime, data and other bill purchases"
        >
          <div className="grid gap-3.5 sm:grid-cols-2">
            {BILL_FEES.map((field) => (
              <div key={field.key}>
                <Input
                  label={field.label}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  disabled={settings.isLoading}
                  value={fees[field.key] ?? ''}
                  onChange={(e) => setFees({ ...fees, [field.key]: e.target.value })}
                />
                <p className="mt-1 text-[11.5px] text-ink-faint">
                  {field.hint}
                  {fees[field.key] !== undefined && fees[field.key] !== storedFee(field.key) && (
                    <span className="ml-1.5 font-semibold text-warn">
                      was {storedFee(field.key) || '—'}
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-line bg-raised px-3 py-2.5">
            <p className="text-[12px] leading-relaxed text-ink-soft">
              The fee is added to the price, never taken out of it: with ₦10 on airtime, a ₦500
              top-up charges ₦510 and still delivers ₦500. It is refunded along with the purchase
              whenever delivery fails. Set a category to 0 to charge nothing.
            </p>
          </div>
        </Card>

        <Card title="Checkout copy" subtitle="Shown to buyers when they enter an address">
          <div className="space-y-1.5">
            <label htmlFor="address-notes" className="block text-[11px] font-bold uppercase tracking-wide text-ink-faint">
              Address notes
            </label>
            <textarea
              id="address-notes"
              rows={5}
              value={notes}
              disabled={settings.isLoading}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Add your hostel name and room number so the rider can find you."
              className="w-full resize-y rounded-lg border border-line bg-raised px-3 py-2.5 text-[13.5px] text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-brand"
            />
          </div>

          <div className="mt-4 rounded-lg border border-line bg-raised px-3 py-2.5">
            <p className="text-[12px] leading-relaxed text-ink-soft">
              These values are read live by the buyer apps and the pricing service. A wrong figure here changes
              what every customer is charged, immediately — there is no staged rollout.
            </p>
          </div>
        </Card>
      </div>
    </>
  )
}

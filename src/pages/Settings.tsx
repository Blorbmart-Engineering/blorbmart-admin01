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

export default function Settings() {
  const queryClient = useQueryClient()
  const settings = useQuery({ queryKey: ['settings'], queryFn: adminApi.settings, staleTime: 60_000 })

  const [draft, setDraft] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')

  // Seeded once the server value arrives, then left alone so typing is never
  // overwritten by a background refetch mid-edit.
  useEffect(() => {
    if (!settings.data) return
    const data = settings.data as Row
    const next: Record<string, string> = {}
    for (const field of FIELDS) next[field.key] = String(data[field.key] ?? '')
    setDraft(next)
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

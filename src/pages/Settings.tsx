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
  // Never sent to the apps: the public settings endpoint strips both.
  { key: 'fundingAlertThreshold', label: 'Funding alert: one top-up', hint: 'A single top-up above this goes to Funding alerts', prefix: '₦' },
  { key: 'fundingAlertDailyTotal', label: 'Funding alert: one day', hint: 'A customer topping up more than this in 24 hours goes to Funding alerts', prefix: '₦' },
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
  const [referralBonus, setReferralBonus] = useState('')
  const [referralLive, setReferralLive] = useState(false)
  const [billPaymentsEnabled, setBillPaymentsEnabled] = useState(true)
  const [walletFundingEnabled, setWalletFundingEnabled] = useState(true)

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
    setReferralBonus(String(data.buyerReferralRewardNaira ?? ''))
    setReferralLive(data.buyerReferralRewardsLive === true)
    setBillPaymentsEnabled(data.billPaymentsEnabled !== false)
    setWalletFundingEnabled(data.walletFundingEnabled !== false)
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
      if (referralBonus !== String(original.buyerReferralRewardNaira ?? '')) {
        patch.buyerReferralRewardNaira = Number(referralBonus)
      }
      if (referralLive !== (original.buyerReferralRewardsLive === true)) {
        patch.buyerReferralRewardsLive = referralLive
      }
      if (billPaymentsEnabled !== (original.billPaymentsEnabled !== false)) {
        patch.billPaymentsEnabled = billPaymentsEnabled
      }
      if (walletFundingEnabled !== (original.walletFundingEnabled !== false)) {
        patch.walletFundingEnabled = walletFundingEnabled
      }
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
    notes !== String(original.addressNotes ?? '') ||
    referralBonus !== String(original.buyerReferralRewardNaira ?? '') ||
    referralLive !== (original.buyerReferralRewardsLive === true)
    || billPaymentsEnabled !== (original.billPaymentsEnabled !== false)
    || walletFundingEnabled !== (original.walletFundingEnabled !== false)

  const maxBonus = Number(original.maxBuyerReferralReward ?? 5000)
  const bonusValue = Number(referralBonus)
  const bonusInvalid =
    referralBonus.trim() === '' || !Number.isFinite(bonusValue) || bonusValue < 0 || bonusValue > maxBonus

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
            disabled={!dirty || (referralBonus !== String(original.buyerReferralRewardNaira ?? '') && bonusInvalid)}
            onClick={() => save.mutate()}
          >
            {dirty ? 'Save changes' : 'Saved'}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Bill payments" subtitle="Emergency control for airtime, data, power and TV purchases">
          <div className="flex items-start gap-3 rounded-lg border border-line bg-surface-sunk p-3">
            <button
              type="button"
              role="switch"
              aria-checked={billPaymentsEnabled}
              aria-label="Toggle bill payments"
              disabled={settings.isLoading}
              onClick={() => setBillPaymentsEnabled((enabled) => !enabled)}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-not-allowed disabled:opacity-60 ${
                billPaymentsEnabled ? 'bg-good' : 'bg-ink-faint'
              }`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  billPaymentsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span>
              <span className="block text-[13px] font-semibold text-ink">
                {billPaymentsEnabled ? 'Bill payments enabled' : 'Bill payments paused'}
              </span>
              <span className="block text-[12px] text-ink-faint">
                {billPaymentsEnabled
                  ? 'Customers can buy bills. Uncheck this before the provider wallet needs funding.'
                  : 'New bill purchases are blocked before any wallet or card is charged.'}
              </span>
            </span>
          </div>
        </Card>

        <Card title="Wallet funding" subtitle="Emergency control for new customer deposits">
          <div className="flex items-start gap-3 rounded-lg border border-line bg-surface-sunk p-3">
            <button
              type="button"
              role="switch"
              aria-checked={walletFundingEnabled}
              aria-label="Toggle wallet funding"
              disabled={settings.isLoading}
              onClick={() => setWalletFundingEnabled((enabled) => !enabled)}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-not-allowed disabled:opacity-60 ${
                walletFundingEnabled ? 'bg-good' : 'bg-ink-faint'
              }`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  walletFundingEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span>
              <span className="block text-[13px] font-semibold text-ink">
                {walletFundingEnabled ? 'Wallet funding enabled' : 'Wallet funding paused'}
              </span>
              <span className="block text-[12px] text-ink-faint">
                {walletFundingEnabled
                  ? 'Customers can fund by card or open a new transfer account.'
                  : 'New card funding and new transfer accounts are blocked before money is accepted.'}
              </span>
            </span>
          </div>
        </Card>

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

        <Card
          title="Referral bonus"
          subtitle="Paid into a customer's wallet for each friend who joins with their invite link"
        >
          <div className="space-y-3.5">
            <div>
              <Input
                label="Bonus per friend"
                type="number"
                inputMode="decimal"
                min={0}
                max={maxBonus}
                disabled={settings.isLoading}
                value={referralBonus}
                onChange={(e) => setReferralBonus(e.target.value)}
              />
              <p className="mt-1 text-[11.5px] text-ink-faint">
                In naira, up to ₦{maxBonus.toLocaleString()}
                {referralBonus !== String(original.buyerReferralRewardNaira ?? '') && (
                  <span className={bonusInvalid ? 'ml-1.5 font-semibold text-bad' : 'ml-1.5 font-semibold text-warn'}>
                    {bonusInvalid
                      ? `enter 0 to ₦${maxBonus.toLocaleString()}`
                      : `was ${String(original.buyerReferralRewardNaira ?? '—')}`}
                  </span>
                )}
              </p>
            </div>

            <label className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-sunk p-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
                checked={referralLive}
                disabled={settings.isLoading}
                onChange={(e) => setReferralLive(e.target.checked)}
              />
              <span>
                <span className="block text-[13px] font-semibold text-ink">Pay the referral bonus</span>
                <span className="block text-[12px] text-ink-faint">
                  {referralLive
                    ? 'On — each new referral pays the bonus above, straight into the wallet.'
                    : 'Off — invites are still recorded, but nobody is paid.'}
                </span>
              </span>
            </label>
          </div>

          <div className="mt-4 rounded-lg border border-line bg-raised px-3 py-2.5">
            <p className="text-[12px] leading-relaxed text-ink-soft">
              A new amount applies to referrals from the moment it is saved; people already
              referred keep what they were promised. Friends who joined while the bonus was off are
              never paid for later.
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

        <AppUpdateCard settings={(settings.data ?? null) as Row | null} />
        <EngagementCard settings={(settings.data ?? null) as Row | null} />
      </div>
    </>
  )
}

/**
 * The customer Android app's release policy, read by the app from
 * /api/settings. Build numbers are the versionCode (the number after "+" in
 * the app's pubspec, e.g. 16 for 1.0.13+16).
 */
function AppUpdateCard({ settings }: { settings: Row | null }) {
  const queryClient = useQueryClient()
  const current = ((settings?.appUpdate as Row | undefined)?.android ?? {}) as Row
  const [latest, setLatest] = useState('')
  const [min, setMin] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setLatest(current.latestBuild == null ? '' : String(current.latestBuild))
    setMin(current.minSupportedBuild == null ? '' : String(current.minSupportedBuild))
    setMessage(String(current.message ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  const save = useMutation({
    mutationFn: () =>
      adminApi.updateSettings({
        appUpdate: { android: { latestBuild: Number(latest), minSupportedBuild: Number(min || 0), message } },
      }),
    onSuccess: () => {
      toast.success('Release policy saved')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the release policy.')),
  })

  return (
    <Card title="App updates" subtitle="Ask customers on old Android builds to update from the Play Store">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Latest build" inputMode="numeric" placeholder="e.g. 16" value={latest} onChange={(e) => setLatest(e.target.value)} />
        <Input label="Oldest build allowed" inputMode="numeric" placeholder="0 = none" value={min} onChange={(e) => setMin(e.target.value)} />
      </div>
      <div className="mt-3">
        <Input label="Message (optional)" placeholder="What is new, in one line" value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
        Builds below <b>Latest</b> are told once that an update is ready. Builds below <b>Oldest allowed</b> cannot be
        used until updated. Only raise it after the new build is live on the Play Store, or customers will be sent to
        an update they cannot get yet.
      </p>
      <div className="mt-3">
        <Button variant="primary" size="sm" loading={save.isPending} disabled={!latest} onClick={() => save.mutate()}>
          Save release policy
        </Button>
      </div>
    </Card>
  )
}

const NUDGE_LABEL: Record<string, string> = {
  checkout_abandoned: 'Left checkout',
  cart_abandoned: 'Left a basket',
  browsed: 'Browsed a store',
  inactive: 'Inactive a week',
}

/**
 * Reminder nudges to customers (backend engagementService). Off until an
 * admin turns them on here, because these are messages to real customers.
 */
function EngagementCard({ settings }: { settings: Row | null }) {
  const queryClient = useQueryClient()
  const stats = useQuery({ queryKey: ['engagement-stats'], queryFn: () => adminApi.engagementStats(30), staleTime: 60_000 })
  const enabled = settings?.engagementNudgesEnabled === true

  const save = useMutation({
    mutationFn: (next: boolean) => adminApi.updateSettings({ engagementNudgesEnabled: next }),
    onSuccess: (_d, next) => {
      toast.success(next ? 'Reminders are on' : 'Reminders are off')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['engagement-stats'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save.')),
  })

  return (
    <Card title="Reminder nudges" subtitle="Pushes to customers who left a basket, a checkout, or the app">
      <p className="text-[12.5px] leading-relaxed text-ink-soft">
        At most one every 48 hours and three a week per customer, only between 9am and 9pm, never after they have
        ordered, and never to anyone who switched reminders off in their account.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button
          variant={enabled ? 'danger' : 'primary'}
          size="sm"
          loading={save.isPending}
          onClick={() => save.mutate(!enabled)}
        >
          {enabled ? 'Turn reminders off' : 'Turn reminders on'}
        </Button>
        <span className="text-[12.5px] font-semibold">{enabled ? 'On' : 'Off'}</span>
      </div>
      {stats.data && (
        <div className="mt-4">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Last 30 days</p>
          {stats.data.byKind.length === 0 && <p className="text-[12.5px] text-ink-soft">Nothing sent yet.</p>}
          {stats.data.byKind.map((k) => (
            <p key={k.kind} className="text-[12.5px]">
              {`${NUDGE_LABEL[k.kind] ?? k.kind}: ${k.sent} sent, ${k.delivered} reached a phone, ${k.opened} opened`}
            </p>
          ))}
          <p className="mt-1 text-[12px] text-ink-faint">{`${stats.data.optedOut} customer(s) have reminders off.`}</p>
        </div>
      )}
    </Card>
  )
}

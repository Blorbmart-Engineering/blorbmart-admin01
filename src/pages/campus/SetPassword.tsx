import { useState, type FormEvent } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { auth } from '../../lib/firebase'
import { campusApi, errorMessage } from '../../lib/api'
import { useSession } from '../../contexts/SessionContext'
import { Button, Input } from '../../components/ui'

/**
 * The first screen a new head of operations sees.
 *
 * They arrive from the credentials email holding a password somebody else
 * generated, which has been sitting in an inbox since it was sent. Nothing
 * else in the campus console is reachable until it is replaced — this is
 * rendered in place of the whole router rather than as a route, so there is no
 * URL that skips it.
 *
 * There is no "current password" field. They just proved possession of the
 * account by signing in, and the server has no way to verify a password
 * through the Admin SDK anyway — asking for it would be theatre.
 */
export default function SetPassword() {
  const { campus, refresh, logout } = useSession()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooShort = password.length > 0 && password.length < 8
  const mismatch = confirm.length > 0 && password !== confirm
  const ready = password.length >= 8 && password === confirm

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await campusApi.setPassword(password)

      /*
       * Sign in again with the password they just chose.
       *
       * Setting it through the Admin SDK moves the account's
       * `tokensValidAfterTime` forward, which invalidates the refresh token
       * this browser is holding. The current ID token keeps working for up to
       * an hour, so without this they would use the console normally and then
       * be dumped back at the sign-in screen mid-task with no explanation.
       *
       * A failure here is not worth blocking on: the session in hand is still
       * good, and falling through to `refresh()` gets them into the console.
       */
      const address = campus?.email
      if (address) {
        await signInWithEmailAndPassword(auth, address, password).catch(() => {})
      }

      // Re-reads the session so `mustChangePassword` flips and the console
      // moves on. Without this the screen would re-render itself for ever.
      await refresh()
    } catch (err) {
      setError(errorMessage(err, 'Could not set your password. Try again.'))
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-void px-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-brand-soft">
            <KeyRound className="h-6 w-6 text-brand" aria-hidden />
          </div>
          <h1 className="text-[21px] font-bold tracking-tight text-ink">Choose your password</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-faint">
            You are the head of operations for{' '}
            <span className="font-semibold text-ink-soft">{campus?.campus?.name ?? 'your campus'}</span>. Set a
            password of your own before you start — the one we emailed you stops working now.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3.5 rounded-xl border border-line bg-panel p-5">
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {tooShort && (
            <p className="text-[12px] font-semibold text-warn">Use at least 8 characters.</p>
          )}

          <Input
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {mismatch && <p className="text-[12px] font-semibold text-warn">These do not match.</p>}

          {error && (
            <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[12.5px] font-semibold text-bad">
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" loading={busy} disabled={!ready} className="w-full">
            Set password and continue
          </Button>

          <p className="flex items-center justify-center gap-1.5 pt-1 text-[11.5px] text-ink-faint">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Your session ends when you close the browser
          </p>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={logout}
            className="text-[12.5px] font-semibold text-ink-faint transition-colors hover:text-ink"
          >
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  )
}

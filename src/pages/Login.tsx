import { useState, type FormEvent } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { auth } from '../lib/firebase'
import { useSession } from '../contexts/SessionContext'
import { Button, Input } from '../components/ui'

/**
 * Sign-in, and the "you are not an admin" wall.
 *
 * Both live here because they are the same moment from the operator's side:
 * "can I get in?". Splitting them across two routes means a non-admin who
 * signs in correctly gets bounced somewhere with no explanation of why.
 */
export default function Login() {
  const { forbidden, user, logout } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
    } catch (err) {
      const code = (err as { code?: string })?.code
      setError(
        code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found'
          ? 'That email and password do not match an account.'
          : code === 'auth/too-many-requests'
            ? 'Too many attempts. Wait a few minutes and try again.'
            : code === 'auth/network-request-failed'
              ? 'Cannot reach Firebase. Check your connection.'
              : 'Could not sign you in. Try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  /* Signed in, but the server refused. Say so plainly and offer the exit. */
  if (user && forbidden) {
    return (
      <div className="grid min-h-screen place-items-center bg-void px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-xl bg-bad-soft">
            <ShieldAlert className="h-6 w-6 text-bad" aria-hidden />
          </div>
          <h1 className="text-[20px] font-bold text-ink">This account has no access here</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
            You are signed in as <span className="font-semibold text-ink">{user.email}</span>, but it is
            neither an administrator nor the head of operations for a campus.
          </p>
          {/* Both doors are named because this screen is now reached two ways:
              by someone who was never an admin, and by a head of operations
              whose campus access has been revoked. Naming only the first sends
              the second to ask the wrong person for the wrong thing. */}
          <p className="mt-2 text-[13px] leading-relaxed text-ink-faint">
            An admin can grant console access by setting{' '}
            <code className="rounded bg-raised px-1 py-0.5 text-[12px] text-ink">role: "admin"</code> on your
            user document, or assign you to a campus from the Campuses screen.
          </p>
          <div className="mt-6">
            <Button onClick={logout}>Sign in as someone else</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid min-h-screen place-items-center bg-void px-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-brand text-[17px] font-bold text-white">
            B
          </div>
          <h1 className="text-[21px] font-bold tracking-tight text-ink">Blorbmart Control</h1>
          <p className="mt-1.5 text-[13px] text-ink-faint">Operations console for the whole ecosystem.</p>
        </div>

        <form onSubmit={submit} className="space-y-3.5 rounded-xl border border-line bg-panel p-5">
          <Input
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[12.5px] font-semibold text-bad">
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" loading={busy} className="w-full">
            Sign in
          </Button>

          <p className="flex items-center justify-center gap-1.5 pt-1 text-[11.5px] text-ink-faint">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Your session ends when you close the browser
          </p>
        </form>
      </div>
    </div>
  )
}

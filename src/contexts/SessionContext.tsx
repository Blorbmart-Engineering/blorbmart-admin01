import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { adminApi, campusApi, errorStatus, type AdminIdentity, type CampusIdentity } from '../lib/api'

export type SessionRole = 'admin' | 'head_of_ops' | 'none'

interface SessionValue {
  user: User | null
  role: SessionRole
  /** Set only for an admin. */
  identity: AdminIdentity | null
  /** Set only for a campus head of operations. */
  campus: CampusIdentity | null
  loading: boolean
  /** Signed into Firebase, but the server recognises neither role. */
  forbidden: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const SessionContext = createContext<SessionValue>({
  user: null,
  role: 'none',
  identity: null,
  campus: null,
  loading: true,
  forbidden: false,
  refresh: async () => {},
  logout: async () => {},
})

/**
 * ────────────────────────────────────────────────────────────────────────────
 * Who is signed in, and which of the two consoles they get.
 *
 * Authorisation is asked of the server, never inferred from the client. A
 * Firebase sign-in only proves who someone is; whether they may suspend a
 * vendor is `requireAdmin`'s decision and whether they run a campus is
 * `requireHeadOfOps`'. Anything else would put the boundary in code an
 * attacker controls.
 *
 * Admin is asked first because that is who opens this app most, and a head of
 * operations pays one wasted 403 for it. Asking in the other order would put
 * that cost on every administrator instead.
 *
 * Neither role is a real state with its own screen, not an error — it is what
 * an ordinary buyer sees if they find this URL, and telling them plainly beats
 * a spinner that never resolves.
 * ────────────────────────────────────────────────────────────────────────────
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [identity, setIdentity] = useState<AdminIdentity | null>(null)
  const [campus, setCampus] = useState<CampusIdentity | null>(null)
  const [role, setRole] = useState<SessionRole>('none')
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(async () => {
    try {
      const me = await adminApi.me()
      setIdentity(me)
      setCampus(null)
      setRole('admin')
      setForbidden(false)
      return
    } catch (error) {
      // Only a 403 means "not an admin". A network failure or a 500 must not
      // be read as a role answer, or an API blip silently demotes an admin
      // into the campus console.
      if (errorStatus(error) !== 403) {
        setIdentity(null)
        setCampus(null)
        setRole('none')
        setForbidden(false)
        return
      }
    }

    try {
      const me = await campusApi.me()
      setCampus(me)
      setIdentity(null)
      setRole('head_of_ops')
      setForbidden(false)
    } catch (error) {
      setIdentity(null)
      setCampus(null)
      setRole('none')
      setForbidden(errorStatus(error) === 403)
    }
  }, [])

  useEffect(() => {
    // Firebase can simply never call back if it is unreachable. Without this
    // the console shows a splash for ever, with no way to even reach the
    // sign-in form to find out why.
    const timeout = window.setTimeout(() => setLoading(false), 8000)

    const unsubscribe = onAuthStateChanged(auth, async (next) => {
      window.clearTimeout(timeout)
      setUser(next)
      if (next) {
        await load()
      } else {
        setIdentity(null)
        setCampus(null)
        setRole('none')
        setForbidden(false)
      }
      setLoading(false)
    })

    return () => {
      window.clearTimeout(timeout)
      unsubscribe()
    }
  }, [load])

  const value = useMemo<SessionValue>(
    () => ({
      user,
      role,
      identity,
      campus,
      loading,
      forbidden,
      refresh: load,
      logout: async () => {
        await signOut(auth)
        setIdentity(null)
        setCampus(null)
        setRole('none')
        setForbidden(false)
      },
    }),
    [user, role, identity, campus, loading, forbidden, load],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSession = () => useContext(SessionContext)

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
import { adminApi, errorStatus, type AdminIdentity } from '../lib/api'

interface AdminContextValue {
  user: User | null
  identity: AdminIdentity | null
  loading: boolean
  /** Signed into Firebase, but the server says this account is not an admin. */
  forbidden: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AdminContext = createContext<AdminContextValue>({
  user: null,
  identity: null,
  loading: true,
  forbidden: false,
  refresh: async () => {},
  logout: async () => {},
})

/**
 * Admin identity.
 *
 * Authorisation is asked of the server, never inferred from the client. A
 * Firebase sign-in only proves who someone is; whether they may suspend a
 * vendor is `requireAdmin`'s decision, and `/api/admin/me` is where we ask.
 * Anything else would put the boundary in code an attacker controls.
 *
 * A 403 is therefore a real state with its own screen, not an error — it is
 * what an ordinary buyer sees if they find this URL, and telling them plainly
 * beats a spinner that never resolves.
 */
export function AdminProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [identity, setIdentity] = useState<AdminIdentity | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(async () => {
    try {
      const me = await adminApi.me()
      setIdentity(me)
      setForbidden(false)
    } catch (error) {
      const status = errorStatus(error)
      setIdentity(null)
      setForbidden(status === 403)
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
        setForbidden(false)
      }
      setLoading(false)
    })

    return () => {
      window.clearTimeout(timeout)
      unsubscribe()
    }
  }, [load])

  const value = useMemo<AdminContextValue>(
    () => ({
      user,
      identity,
      loading,
      forbidden,
      refresh: load,
      logout: async () => {
        await signOut(auth)
        setIdentity(null)
        setForbidden(false)
      },
    }),
    [user, identity, loading, forbidden, load],
  )

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAdmin = () => useContext(AdminContext)

import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { SessionProvider, useSession } from './contexts/SessionContext'
import Shell from './components/Shell'
import CampusShell from './components/CampusShell'
import { Skeleton } from './components/ui'
import Login from './pages/Login'

/*
 * Routes are split so the sign-in screen does not download the console.
 *
 * That matters more than it looks: this app is mostly opened by people who are
 * already signed in, but the one path that must never be slow is the one taken
 * by somebody trying to get in during an incident.
 */
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Health = lazy(() => import('./pages/Health'))
const ActivityLog = lazy(() => import('./pages/ActivityLog'))
const Orders = lazy(() => import('./pages/Orders'))
const Products = lazy(() => import('./pages/Products'))
const Vendors = lazy(() => import('./pages/Vendors'))
const Campuses = lazy(() => import('./pages/Campuses'))
const Users = lazy(() => import('./pages/Users'))
const Riders = lazy(() => import('./pages/Riders'))
const Deliveries = lazy(() => import('./pages/Deliveries'))
const Wallets = lazy(() => import('./pages/Wallets'))
const Bills = lazy(() => import('./pages/Bills'))
const Promos = lazy(() => import('./pages/Promos'))
const Landmarks = lazy(() => import('./pages/Landmarks'))
const Carousel = lazy(() => import('./pages/Carousel'))
const Events = lazy(() => import('./pages/Events'))
const Broadcast = lazy(() => import('./pages/Broadcast'))
const Commissions = lazy(() => import('./pages/Commissions'))
const Settings = lazy(() => import('./pages/Settings'))

/* The campus console. A head of operations never loads any of the above. */
const SetPassword = lazy(() => import('./pages/campus/SetPassword'))
const CampusDashboard = lazy(() => import('./pages/campus/CampusDashboard'))
const CampusOrders = lazy(() => import('./pages/campus/CampusOrders'))
const CampusVendors = lazy(() => import('./pages/campus/CampusVendors'))
const CampusRiders = lazy(() => import('./pages/campus/CampusRiders'))
const CampusBroadcast = lazy(() => import('./pages/campus/CampusBroadcast'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // An operations console should reflect reality when you look back at it,
      // rather than showing whatever was true when the tab was last focused.
      refetchOnWindowFocus: true,
    },
  },
})

function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-48" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  )
}

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-void">
      <div className="grid h-11 w-11 animate-pulse place-items-center rounded-xl bg-brand text-[15px] font-bold text-white">
        B
      </div>
    </div>
  )
}

/**
 * Everything behind the admin console requires an admin the *server*
 * recognises.
 *
 * A head of operations who lands on an admin URL is redirected to their own
 * console rather than shown the "not an admin" wall — they are signed in
 * correctly and there is somewhere for them to be, which is not the case for
 * the buyer that wall was written for.
 */
function Guarded({ children }: { children: ReactNode }) {
  const { user, identity, role, loading } = useSession()

  if (loading) return <Splash />
  if (role === 'head_of_ops') return <Navigate to="/campus" replace />
  if (!user || role !== 'admin' || !identity?.admin) return <Login />

  return (
    <Shell>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </Shell>
  )
}

/**
 * The campus console.
 *
 * `mustChangePassword` is checked here rather than inside a route, so there is
 * no campus URL that reaches past it. Somebody arriving from the credentials
 * email is holding a password that was generated for them and has been sitting
 * in an inbox; replacing it is the first thing that happens, not a task they
 * can navigate around.
 */
function CampusGuarded({ children }: { children: ReactNode }) {
  const { user, campus, role, loading } = useSession()

  if (loading) return <Splash />
  if (role === 'admin') return <Navigate to="/" replace />
  if (!user || role !== 'head_of_ops') return <Login />

  if (campus?.mustChangePassword) {
    return (
      <Suspense fallback={<Splash />}>
        <SetPassword />
      </Suspense>
    )
  }

  return (
    <CampusShell>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </CampusShell>
  )
}

/**
 * Sends each role to the console it belongs in.
 *
 * The credentials email links to `/campus`, so a head of operations lands
 * there directly. This exists for the person who bookmarks `/` or types the
 * bare domain, and for an admin who follows a campus link out of habit.
 */
function RoleHome() {
  const { role, loading } = useSession()
  if (loading) return <Splash />
  if (role === 'head_of_ops') return <Navigate to="/campus" replace />
  return <Navigate to="/" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <BrowserRouter>
          <Routes>
            {(
              [
                ['/', <Dashboard key="d" />],
                ['/health', <Health key="h" />],
                ['/activity', <ActivityLog key="a" />],
                ['/orders', <Orders key="o" />],
                ['/products', <Products key="p" />],
                ['/vendors', <Vendors key="v" />],
                ['/campuses', <Campuses key="c" />],
                ['/events', <Events key="ev" />],
                ['/users', <Users key="u" />],
                ['/riders', <Riders key="r" />],
                ['/deliveries', <Deliveries key="dl" />],
                ['/wallets', <Wallets key="w" />],
                ['/bills', <Bills key="b" />],
                ['/promos', <Promos key="pr" />],
                ['/landmarks', <Landmarks key="l" />],
                ['/carousel', <Carousel key="ca" />],
                ['/broadcast', <Broadcast key="br" />],
                ['/commissions', <Commissions key="cm" />],
                ['/settings', <Settings key="s" />],
              ] as const
            ).map(([path, element]) => (
              <Route key={path} path={path} element={<Guarded>{element}</Guarded>} />
            ))}

            {(
              [
                ['/campus', <CampusDashboard key="cd" />],
                ['/campus/orders', <CampusOrders key="co" />],
                ['/campus/vendors', <CampusVendors key="cv" />],
                ['/campus/riders', <CampusRiders key="cr" />],
                ['/campus/broadcast', <CampusBroadcast key="cb" />],
              ] as const
            ).map(([path, element]) => (
              <Route key={path} path={path} element={<CampusGuarded>{element}</CampusGuarded>} />
            ))}

            <Route path="*" element={<RoleHome />} />
          </Routes>
        </BrowserRouter>

        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3600,
            style: {
              background: '#1a2130',
              color: '#eef2f8',
              border: '1px solid #232c3d',
              borderRadius: '10px',
              fontSize: '13.5px',
              fontWeight: 600,
            },
            success: { iconTheme: { primary: '#22c55e', secondary: '#0a0d12' } },
            error: { iconTheme: { primary: '#f43f5e', secondary: '#0a0d12' } },
          }}
        />
      </SessionProvider>
    </QueryClientProvider>
  )
}

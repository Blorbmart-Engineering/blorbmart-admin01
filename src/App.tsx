import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AdminProvider, useAdmin } from './contexts/AdminContext'
import Shell from './components/Shell'
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
const Settings = lazy(() => import('./pages/Settings'))

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
 * Everything behind the console requires an admin the *server* recognises.
 *
 * `forbidden` is handled by rendering the login screen rather than redirecting,
 * so the "not an admin" explanation appears at whatever URL was opened instead
 * of bouncing somebody to a path that tells them nothing.
 */
function Guarded({ children }: { children: ReactNode }) {
  const { user, identity, loading, forbidden } = useAdmin()

  if (loading) return <Splash />
  if (!user || forbidden || !identity?.admin) return <Login />

  return (
    <Shell>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </Shell>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminProvider>
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
                ['/settings', <Settings key="s" />],
              ] as const
            ).map(([path, element]) => (
              <Route key={path} path={path} element={<Guarded>{element}</Guarded>} />
            ))}

            <Route path="*" element={<Navigate to="/" replace />} />
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
      </AdminProvider>
    </QueryClientProvider>
  )
}

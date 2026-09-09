import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Bike,
  Building2,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  ShoppingBag,
  X,
} from 'lucide-react'
import { useSession } from '../contexts/SessionContext'
import { Badge, cn } from './ui'

/**
 * The campus console.
 *
 * Deliberately much smaller than the admin shell: a head of operations runs
 * one campus, so there is no campus switcher, no platform-wide anything, and
 * no grouping — five destinations do not need section headers, and adding them
 * would make the job look bigger than it is.
 *
 * The campus name sits in the rail where the admin console puts "Control",
 * because "which campus am I looking at" is the one piece of context every
 * screen here depends on and none of them repeat.
 */
const ITEMS: { to: string; label: string; icon: typeof Bike }[] = [
  { to: '/campus', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/campus/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/campus/vendors', label: 'Vendors', icon: Building2 },
  { to: '/campus/riders', label: 'Riders', icon: Bike },
  { to: '/campus/broadcast', label: 'Message campus', icon: Megaphone },
]

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/campus'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors',
              isActive ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-raised hover:text-ink',
            )
          }
        >
          <item.icon className="w-4 h-4 shrink-0" aria-hidden />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

function AccountMenu() {
  const { campus, logout } = useSession()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative border-t border-line-soft p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-raised"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
          {(campus?.email ?? '?').slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-ink">
            {campus?.name ?? campus?.email ?? 'Signed in'}
          </span>
          <span className="block text-[11px] text-ink-faint">Head of operations</span>
        </span>
        <ChevronDown className={cn('w-4 h-4 text-ink-faint transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div className="absolute inset-x-3 bottom-full mb-1 overflow-hidden rounded-lg border border-line bg-raised shadow-xl">
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-[13px] font-semibold text-bad transition-colors hover:bg-bad-soft"
          >
            <LogOut className="w-4 h-4" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function Brand() {
  const { campus } = useSession()
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-[13px] font-bold text-white">
        B
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13.5px] font-bold leading-tight text-ink">
          {campus?.campus?.shortName ?? 'Blorbmart'}
        </p>
        <p className="text-[11px] leading-tight text-ink-faint">Campus operations</p>
      </div>
    </div>
  )
}

export default function CampusShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const { campus } = useSession()

  const paused = campus?.campus?.maintenance?.enabled

  return (
    <div className="flex min-h-screen bg-void">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-panel lg:flex">
        <div className="border-b border-line-soft px-4 py-4">
          <Brand />
        </div>
        <NavItems />
        <AccountMenu />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative flex h-full w-64 flex-col border-r border-line bg-panel">
            <div className="flex items-center justify-between border-b border-line-soft px-4 py-4">
              <Brand />
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="text-ink-faint">
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>
            <NavItems onNavigate={() => setMobileOpen(false)} />
            <AccountMenu />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-void/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="text-ink-soft">
            <Menu className="w-5 h-5" aria-hidden />
          </button>
          <p className="text-[14px] font-bold text-ink">{campus?.campus?.shortName ?? 'Campus'}</p>
        </header>

        {/* A paused campus is stated on every screen, not just the dashboard.
            Someone approving a vendor or reading orders needs to know nothing
            is being delivered while they do it. */}
        {paused && (
          <div className="border-b border-warn/30 bg-warn-soft px-4 py-2.5 sm:px-6">
            <p className="flex items-center gap-2 text-[12.5px] font-semibold text-warn">
              <Badge tone="warn" dot>
                Paused
              </Badge>
              This campus is under maintenance — buyers cannot order right now.
            </p>
          </div>
        )}

        <main key={location.pathname} className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  )
}

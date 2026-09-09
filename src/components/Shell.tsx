import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Activity,
  BadgePercent,
  Bike,
  Building2,
  CalendarDays,
  ChevronDown,
  GraduationCap,
  Images,
  LayoutDashboard,
  LogOut,
  MapPin,
  Megaphone,
  Menu,
  Package,
  Receipt,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
  HeartPulse,
  X,
} from 'lucide-react'
import { useAdmin } from '../contexts/AdminContext'
import { cn } from './ui'

/**
 * Navigation grouped by what an operator is doing, not by which service owns
 * the data.
 *
 * "Money" holds wallets, payouts and bills because chasing a payment crosses
 * all three; splitting them by backend collection would be a map of our
 * architecture rather than of their job.
 */
const GROUPS: { label: string; items: { to: string; label: string; icon: typeof Users }[] }[] = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/health', label: 'System health', icon: HeartPulse },
      { to: '/activity', label: 'Activity log', icon: Activity },
    ],
  },
  {
    label: 'Marketplace',
    items: [
      { to: '/orders', label: 'Orders', icon: ShoppingBag },
      { to: '/products', label: 'Products', icon: Package },
      { to: '/vendors', label: 'Vendors', icon: Building2 },
      { to: '/campuses', label: 'Campuses', icon: GraduationCap },
      { to: '/events', label: 'Events', icon: CalendarDays },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/users', label: 'Users', icon: Users },
      { to: '/riders', label: 'Riders', icon: Bike },
      { to: '/deliveries', label: 'Deliveries', icon: Truck },
    ],
  },
  {
    label: 'Money',
    items: [
      { to: '/wallets', label: 'Wallets & payouts', icon: Wallet },
      { to: '/bills', label: 'Bill payments', icon: Receipt },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { to: '/promos', label: 'Promo codes', icon: BadgePercent },
      { to: '/landmarks', label: 'Delivery zones', icon: MapPin },
      { to: '/carousel', label: 'Carousel', icon: Images },
      { to: '/broadcast', label: 'Broadcast', icon: Megaphone },
      { to: '/settings', label: 'Platform settings', icon: Settings },
    ],
  },
]

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <p className="px-2 pb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-faint">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors',
                      isActive
                        ? 'bg-brand-soft text-brand'
                        : 'text-ink-soft hover:bg-raised hover:text-ink',
                    )
                  }
                >
                  <item.icon className="w-4 h-4 shrink-0" aria-hidden />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function AccountMenu() {
  const { identity, logout } = useAdmin()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative border-t border-line-soft p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-raised"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
          {(identity?.email ?? '?').slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-ink">
            {identity?.email ?? 'Signed in'}
          </span>
          <span className="block text-[11px] text-ink-faint">{identity?.role ?? 'admin'}</span>
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

export default function Shell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="flex min-h-screen bg-void">
      {/* Desktop rail. This console is a desk tool, so the sidebar is always
          present rather than collapsible — an operator moving between orders
          and payouts twenty times an hour should not pay a click each time. */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-panel lg:flex">
        <div className="flex items-center gap-2.5 border-b border-line-soft px-4 py-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-[13px] font-bold text-white">
            B
          </span>
          <div>
            <p className="text-[13.5px] font-bold leading-tight text-ink">Blorbmart</p>
            <p className="text-[11px] leading-tight text-ink-faint">Control</p>
          </div>
        </div>
        <NavItems />
        <AccountMenu />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative flex h-full w-64 flex-col border-r border-line bg-panel">
            <div className="flex items-center justify-between border-b border-line-soft px-4 py-4">
              <p className="text-[13.5px] font-bold text-ink">Blorbmart Control</p>
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
          <p className="text-[14px] font-bold text-ink">Blorbmart Control</p>
        </header>

        {/* Keyed on pathname so a page's scroll position never carries over
            into the next one — landing halfway down a fresh table reads as a
            rendering bug. */}
        <main key={location.pathname} className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  )
}

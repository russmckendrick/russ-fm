import { Activity, Disc3, LayoutDashboard, Library, Monitor, Moon, PlugZap, Search, Sun, Users } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { cn } from '@/lib/format'
import { useJobs } from '@/lib/jobs'
import { useTheme, type Theme } from '@/lib/theme'
import { CommandPalette } from './CommandPalette'
import { PromptDock } from './PromptDock'
import { Toasts } from './Toasts'
import { Kbd } from './ui'

const SCROLL_ID = 'main-scroll'
/** The element pages scroll in (virtual lists measure against it). */
export const scrollElement = () => document.getElementById(SCROLL_ID)

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/artists', label: 'Artists', icon: Users },
  { to: '/jobs', label: 'Jobs', icon: Activity },
  { to: '/services', label: 'Services', icon: PlugZap },
]

export function Layout() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // New page, top of the page (detail views would otherwise open mid-scroll).
  useEffect(() => {
    scrollElement()?.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="flex h-full">
      <Sidebar onSearch={() => setPaletteOpen(true)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar onSearch={() => setPaletteOpen(true)} />
        <main id={SCROLL_ID} className="relative min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <PromptDock />
      <Toasts />
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-6 items-center justify-center rounded-md bg-fg text-bg">
        <Disc3 className="size-4" strokeWidth={2} />
      </div>
      <span className="text-[15px] font-semibold tracking-tight">scrapper</span>
    </div>
  )
}

function NavItem({ to, label, icon: Icon, end, badge }: (typeof NAV)[number] & { badge?: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors',
          isActive ? 'bg-hover font-medium text-fg' : 'text-muted hover:bg-hover/60 hover:text-fg',
        )
      }
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
      <span className="flex-1">{label}</span>
      {badge}
    </NavLink>
  )
}

function RunningBadge() {
  const { jobs } = useJobs()
  const running = jobs.filter((j) => j.status === 'running')
  if (running.length === 0) return null
  const waiting = running.some((j) => j.prompt)
  return (
    <span
      className={cn(
        'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
        waiting ? 'bg-warn text-white' : 'bg-accent-soft text-accent',
      )}
      title={waiting ? 'A job is waiting for you' : `${running.length} running`}
    >
      {running.length}
    </span>
  )
}

function Sidebar({ onSearch }: { onSearch: () => void }) {
  const { connected } = useJobs()
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-panel md:flex">
      <div className="px-4 pt-4 pb-3">
        <Brand />
      </div>
      <div className="px-3 pb-2">
        <button
          onClick={onSearch}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-line bg-bg px-2.5 text-[13px] text-faint transition-colors hover:border-line-strong"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Search…</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>
      <nav className="flex flex-col gap-0.5 px-3 py-1">
        {NAV.map((n) => (
          <NavItem key={n.to} {...n} badge={n.to === '/jobs' ? <RunningBadge /> : undefined} />
        ))}
      </nav>
      <div className="mt-auto flex items-center justify-between border-t border-line px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-xs text-faint" title={connected ? 'Live updates connected' : 'Reconnecting…'}>
          <span className={cn('size-1.5 rounded-full', connected ? 'bg-ok' : 'animate-pulse bg-warn')} />
          {connected ? 'Live' : 'Offline'}
        </span>
        <ThemeSwitch />
      </div>
    </aside>
  )
}

function MobileBar({ onSearch }: { onSearch: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2 md:hidden">
      <Brand />
      <nav className="flex flex-1 justify-end gap-1">
        {NAV.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            className={({ isActive }) => cn('rounded-md p-1.5', isActive ? 'bg-hover text-fg' : 'text-muted')}
          >
            <Icon className="size-4" />
          </NavLink>
        ))}
        <button onClick={onSearch} aria-label="Search" className="rounded-md p-1.5 text-muted">
          <Search className="size-4" />
        </button>
      </nav>
    </div>
  )
}

function ThemeSwitch() {
  const [theme, setTheme] = useTheme()
  const opts: { value: Theme; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'system', icon: Monitor, label: 'System' },
    { value: 'dark', icon: Moon, label: 'Dark' },
  ]
  return (
    <div className="flex rounded-md border border-line p-0.5">
      {opts.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={`${label} theme`}
          aria-pressed={theme === value}
          className={cn('rounded p-1 transition-colors', theme === value ? 'bg-hover text-fg' : 'text-faint hover:text-fg')}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  )
}

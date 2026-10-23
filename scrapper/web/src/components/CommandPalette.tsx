import { Command } from 'cmdk'
import { Activity, Boxes, Database, FileJson, HeartPulse, LayoutDashboard, Library, PlugZap, Plus, Search, Terminal, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useJobs } from '@/lib/jobs'
import { albumImageUrl, artistImageUrl } from '@/lib/media'
import { useArtists, useLibrary } from '@/lib/queries'
import { Kbd } from './ui'

const PAGES = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/artists', label: 'Artists', icon: Users },
  { to: '/boxsets', label: 'Boxsets', icon: Boxes },
  { to: '/add', label: 'Add & enrich', icon: Plus },
  { to: '/health', label: 'Data health', icon: HeartPulse },
  { to: '/jobs', label: 'Jobs', icon: Activity },
  { to: '/tools', label: 'Tools', icon: Terminal },
  { to: '/database', label: 'Database', icon: Database },
  { to: '/services', label: 'Services', icon: PlugZap },
]

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** ⌘K: jump to a page, a release or an artist, or start an action. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const { store } = useJobs()
  const { data: items = [] } = useLibrary()
  const { data: artists = [] } = useArtists()

  const q = fold(query.trim())
  const releases = useMemo(() => {
    if (q.length < 2) return []
    return items
      .filter((i) => fold(`${i.title} ${i.artist} ${i.discogs_id ?? ''}`).includes(q))
      .slice(0, 12)
  }, [items, q])
  const artistHits = useMemo(() => {
    if (q.length < 2) return []
    return artists.filter((a) => fold(a.name).includes(q)).slice(0, 6)
  }, [artists, q])
  const pages = PAGES.filter((p) => !q || fold(p.label).includes(q))

  const actions = [
    {
      label: 'Test services',
      hint: 'scrapper test',
      icon: PlugZap,
      run: async () => {
        const id = await store.start('probe-services')
        if (id) navigate('/services')
      },
    },
    {
      label: 'Generate collection.json',
      hint: 'scrapper generate-collection',
      icon: FileJson,
      run: async () => {
        const id = await store.start('generate-collection')
        if (id) navigate(`/jobs/${id}`)
      },
    },
  ].filter((a) => !q || fold(`${a.label} ${a.hint}`).includes(q))

  const go = (fn: () => void) => {
    onOpenChange(false)
    setQuery('')
    fn()
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setQuery('')
      }}
      shouldFilter={false}
      label="Command palette"
      overlayClassName="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] animate-fade-in"
      contentClassName="fixed top-[12vh] left-1/2 z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-line-strong bg-panel shadow-[0_24px_64px_rgb(0_0_0/0.25)] animate-rise-in"
    >
      <div className="flex items-center gap-2 border-b border-line px-3.5">
        <Search className="size-4 text-faint" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search releases, artists, pages and actions…"
          className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
        />
        <Kbd>esc</Kbd>
      </div>
      <Command.List className="max-h-[min(60vh,480px)] overflow-y-auto p-1.5">
        <Command.Empty className="px-3 py-8 text-center text-[13px] text-faint">Nothing matches “{query}”.</Command.Empty>

        {releases.length > 0 && (
          <Group heading="Releases">
            {releases.map((r) => (
              <Item key={r.slug} value={`release-${r.slug}`} onSelect={() => go(() => navigate(`/release/${r.slug}`))}>
                <img src={albumImageUrl(r.slug)} alt="" className="size-8 rounded object-cover" style={{ background: r.color ?? undefined }} />
                <span className="min-w-0 flex-1 truncate">
                  {r.title} <span className="text-faint">· {r.artist}</span>
                </span>
                {r.year && <span className="text-xs text-faint tabular-nums">{r.year}</span>}
              </Item>
            ))}
          </Group>
        )}

        {artistHits.length > 0 && (
          <Group heading="Artists">
            {artistHits.map((a) => (
              <Item key={a.slug} value={`artist-${a.slug}`} onSelect={() => go(() => navigate(`/artist/${a.slug}`))}>
                <img src={artistImageUrl(a.slug, 'avatar')} alt="" className="size-8 rounded-full bg-panel-2 object-cover" />
                <span className="flex-1 truncate">{a.name}</span>
                <span className="text-xs text-faint">{a.release_count}</span>
              </Item>
            ))}
          </Group>
        )}

        {actions.length > 0 && (
          <Group heading="Actions">
            {actions.map((a) => (
              <Item key={a.label} value={`action-${a.label}`} onSelect={() => go(() => void a.run())}>
                <a.icon className="size-4 text-faint" />
                <span className="flex-1">{a.label}</span>
                <code className="font-mono text-[11px] text-faint">{a.hint}</code>
              </Item>
            ))}
          </Group>
        )}

        {pages.length > 0 && (
          <Group heading="Go to">
            {pages.map((p) => (
              <Item key={p.to} value={`page-${p.to}`} onSelect={() => go(() => navigate(p.to))}>
                <p.icon className="size-4 text-faint" />
                <span>{p.label}</span>
              </Item>
            ))}
          </Group>
        )}
      </Command.List>
    </Command.Dialog>
  )
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint"
    >
      {children}
    </Command.Group>
  )
}

function Item({ value, onSelect, children }: { value: string; onSelect: () => void; children: ReactNode }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-10 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] data-[selected=true]:bg-hover"
    >
      {children}
    </Command.Item>
  )
}

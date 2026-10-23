import { Search, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/format'
import { albumImageUrl, artistImageUrl } from '@/lib/media'
import { useArtists, useLibrary } from '@/lib/queries'

export interface Picked {
  slug: string
  label: string
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Search-as-you-type picker for one release or artist from the library. */
export function EntityPicker({
  kind,
  value,
  onChange,
  placeholder,
}: {
  kind: 'release' | 'artist'
  value: Picked | null
  onChange: (p: Picked | null) => void
  placeholder?: string
}) {
  const { data: items = [] } = useLibrary()
  const { data: artists = [] } = useArtists()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLInputElement>(null)

  const options = useMemo(() => {
    const needle = fold(q.trim())
    if (!needle) return []
    if (kind === 'release')
      return items
        .filter((i) => fold(`${i.title} ${i.artist} ${i.slug}`).includes(needle))
        .slice(0, 8)
        .map((i) => ({ slug: i.slug, label: `${i.title} — ${i.artist}`, img: albumImageUrl(i.slug), color: i.color }))
    return artists
      .filter((a) => fold(`${a.name} ${a.slug}`).includes(needle))
      .slice(0, 8)
      .map((a) => ({ slug: a.slug, label: a.name, img: artistImageUrl(a.slug, 'avatar'), color: null }))
  }, [q, kind, items, artists])

  if (value)
    return (
      <div className="flex h-8 items-center gap-2 rounded-md border border-accent bg-accent-soft/50 px-2.5 text-[13px]">
        <span className="min-w-0 flex-1 truncate">{value.label}</span>
        <button type="button" onClick={() => onChange(null)} className="text-faint hover:text-fg" aria-label="Clear">
          <X className="size-3.5" />
        </button>
      </div>
    )

  const choose = (o: (typeof options)[number]) => {
    onChange({ slug: o.slug, label: o.label })
    setQ('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-faint" />
      <input
        ref={ref}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(options.length - 1, a + 1))
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1))
          else if (e.key === 'Enter' && options[active]) choose(options[active])
          else if (e.key === 'Escape') setOpen(false)
          else return
          e.preventDefault()
        }}
        placeholder={placeholder ?? (kind === 'release' ? 'Find a release…' : 'Find an artist…')}
        role="combobox"
        aria-expanded={open && options.length > 0}
        className="h-8 w-full rounded-md border border-line bg-panel pr-2.5 pl-8 text-[13px] placeholder:text-faint focus:border-accent focus:outline-none"
      />
      {open && options.length > 0 && (
        <ul role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-line-strong bg-panel py-1 shadow-panel">
          {options.map((o, i) => (
            <li
              key={o.slug}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(o)
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-center gap-2 px-2 py-1.5 text-[13px]', i === active && 'bg-hover')}
            >
              <img src={o.img} alt="" className={cn('size-6 object-cover', kind === 'artist' ? 'rounded-full' : 'rounded')} style={{ background: o.color ?? undefined }} />
              <span className="truncate">{o.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

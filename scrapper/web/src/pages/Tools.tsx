import { useQuery } from '@tanstack/react-query'
import { Play, Terminal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CommandForm, splitWords } from '@/components/CommandForm'
import { JobInline, useRunner } from '@/components/JobInline'
import { SiteScripts } from '@/components/SiteScripts'
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, Spinner } from '@/components/ui'
import { api, keys } from '@/lib/api'
import { cn } from '@/lib/format'
import type { CommandSpec } from '@/lib/types'

/** How the Tools list groups the CLI's commands (anything new lands in "Other"). */
const GROUPS: { title: string; names: string[] }[] = [
  { title: 'Collection', names: ['collection', 'release', 'artist', 'artist-batch'] },
  {
    title: 'Backfill & enrich',
    names: ['enrich-description', 'backfill-videos', 'backfill-original-years', 'backfill-formats', 'backfill-tracklists', 'backfill-identities'],
  },
  { title: 'Output', names: ['generate-collection', 'report'] },
  { title: 'Database', names: ['status', 'backup', 'db'] },
  { title: 'Maintenance', names: ['maintenance'] },
  { title: 'Services', names: ['test'] },
]

/** Runnable commands: groups (`db`) expand into their subcommands (`db search`). */
function leaves(cmds: CommandSpec[]): CommandSpec[] {
  return cmds.flatMap((c) => (c.subcommands.length > 0 ? leaves(c.subcommands) : [c]))
}

export const useCommands = () =>
  useQuery({ queryKey: keys.commands, queryFn: api.commands, staleTime: Infinity, select: (d) => d.commands })

export function ToolsPage() {
  const { '*': splat = '' } = useParams()
  const { data, error, isLoading } = useCommands()
  const navigate = useNavigate()

  const grouped = useMemo(() => {
    if (!data) return []
    const used = new Set<string>()
    const out = GROUPS.map((g) => {
      const cmds = leaves(data.filter((c) => g.names.includes(c.name)))
      g.names.forEach((n) => used.add(n))
      return { title: g.title, cmds }
    })
    const other = leaves(data.filter((c) => !used.has(c.name)))
    if (other.length) out.push({ title: 'Other', cmds: other })
    return out.filter((g) => g.cmds.length)
  }, [data])

  const all = grouped.flatMap((g) => g.cmds)
  const selected = all.find((c) => c.path.join('/') === splat)

  if (error) return <ErrorState error={error} />

  return (
    <div className="mx-auto max-w-6xl pb-12">
      <PageHeader title="Tools" sub="Every scrapper command, as a form. Each run is a job you can follow here or on the Jobs page." />
      <div className="px-6">
        <CommandLine />
      </div>
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 px-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <nav className="space-y-5 lg:sticky lg:top-4 lg:self-start" aria-label="Commands">
            {grouped.map((g) => (
              <div key={g.title}>
                <h3 className="mb-1 px-2 text-[11px] font-medium tracking-wide text-faint uppercase">{g.title}</h3>
                <ul>
                  {g.cmds.map((c) => {
                    const id = c.path.join('/')
                    return (
                      <li key={id}>
                        <Link
                          to={`/tools/${id}`}
                          className={cn(
                            'block truncate rounded-md px-2 py-1 font-mono text-[12.5px] transition-colors',
                            id === splat ? 'bg-hover font-medium text-fg' : 'text-muted hover:bg-hover/60 hover:text-fg',
                          )}
                        >
                          {c.path.join(' ')}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
            <div>
              <h3 className="mb-1 px-2 text-[11px] font-medium tracking-wide text-faint uppercase">Site (pnpm)</h3>
              <Link
                to="/tools/site-assets"
                className={cn(
                  'block rounded-md px-2 py-1 font-mono text-[12.5px] transition-colors',
                  splat === 'site-assets' ? 'bg-hover font-medium text-fg' : 'text-muted hover:bg-hover/60 hover:text-fg',
                )}
              >
                generate-colors · artist-images
              </Link>
            </div>
          </nav>

          {splat === 'site-assets' ? (
            <SiteScripts />
          ) : selected ? (
            <Card className="min-w-0 p-5">
              <h2 className="font-mono text-[15px] font-semibold">scrapper {selected.path.join(' ')}</h2>
              {selected.about && <p className="mt-1 text-[13px] text-muted">{selected.about}</p>}
              {selected.long_about && selected.long_about !== selected.about && (
                <p className="mt-2 text-xs whitespace-pre-line text-faint">{selected.long_about}</p>
              )}
              <div className="mt-5">
                <CommandForm key={splat} cmd={selected} />
              </div>
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={<Terminal className="size-6" />}
                title="Pick a command"
                body="Forms are generated from the CLI itself, so every flag here matches `scrapper <command> --help`."
                action={
                  <Button onClick={() => navigate('/tools/backfill-videos')} variant="secondary">
                    Try backfill-videos
                  </Button>
                }
              />
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

/** Type any command, exactly as in a terminal. */
function CommandLine() {
  const [line, setLine] = useState('')
  const { jobId, run } = useRunner()
  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const args = splitWords(line)
          if (args.length) void run(args)
        }}
      >
        <Input
          icon={<span className="font-mono text-xs">$</span>}
          value={line}
          onChange={(e) => setLine(e.target.value)}
          placeholder='scrapper release 123456 --save --interactive   ·   artist "Talk Talk" --save'
          className="flex-1 font-mono"
          aria-label="Command line"
          spellCheck={false}
        />
        <Button type="submit" variant="primary" disabled={!line.trim()}>
          <Play className="size-3" /> Run
        </Button>
      </form>
      <JobInline jobId={jobId} />
    </div>
  )
}

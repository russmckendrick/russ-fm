import { Activity, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { JobStatusIcon, jobStatusLabel } from '@/components/JobStatus'
import { PromptCard } from '@/components/PromptCard'
import { Button, Card, EmptyState, PageHeader, Progress } from '@/components/ui'
import { ago, cn, duration } from '@/lib/format'
import { useJobs } from '@/lib/jobs'
import type { JobSnapshot } from '@/lib/types'

export function JobsPage() {
  const { id } = useParams()
  const { jobs } = useJobs()
  const selected = id ? jobs.find((j) => String(j.id) === id) : jobs[0]

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Jobs" sub="Everything the scrapper is doing, live. Jobs keep running if you leave this page." />
      {jobs.length === 0 ? (
        <EmptyState
          icon={<Activity className="size-6" />}
          title="No jobs yet"
          body="Start one from the dashboard or ⌘K — testing services or generating collection.json, for now."
        />
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 px-6 pb-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="h-fit overflow-hidden lg:max-h-full lg:overflow-y-auto">
            <ul className="divide-y divide-line">
              {jobs.map((j) => (
                <li key={j.id}>
                  <Link
                    to={`/jobs/${j.id}`}
                    className={cn('flex items-center gap-2.5 px-3 py-2.5 hover:bg-hover', selected?.id === j.id && 'bg-hover')}
                  >
                    <JobStatusIcon job={j} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{j.title}</span>
                      <span className="block text-xs text-faint">
                        {ago(j.started_at)} · {duration(j.started_at, j.finished_at)}
                      </span>
                    </span>
                    {j.progress && j.status === 'running' && (
                      <span className="text-xs text-faint tabular-nums">
                        {j.progress[0]}/{j.progress[1]}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          {selected ? <JobDetail key={selected.id} job={selected} /> : <EmptyState title="No such job" body="It may have been cleared." />}
        </div>
      )}
    </div>
  )
}

function JobDetail({ job }: { job: JobSnapshot }) {
  const { logs, store } = useJobs()
  const log = logs[job.id]
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (log === undefined) void store.loadLog(job.id)
  }, [job.id, log, store])

  // Tick the elapsed time while running.
  useEffect(() => {
    if (job.status !== 'running') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [job.status])

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <JobStatusIcon job={job} className="size-5" />
            <div className="min-w-0">
              <h2 className="truncate font-semibold">{job.title}</h2>
              <p className="text-xs text-muted" data-now={now}>
                {jobStatusLabel(job)} · started {ago(job.started_at)} · {duration(job.started_at, job.finished_at)}
              </p>
            </div>
          </div>
          {job.status === 'running' && (
            <Button variant="danger" size="sm" onClick={() => void store.cancel(job.id)}>
              <Square className="size-3" /> Stop
            </Button>
          )}
        </div>
        {job.progress && (
          <div className="mt-4 flex items-center gap-3">
            <Progress value={job.progress[0]} total={job.progress[1]} />
            <span className="text-xs text-muted tabular-nums">
              {job.progress[0]}/{job.progress[1]}
            </span>
          </div>
        )}
        {job.error && <p className="mt-3 rounded-md bg-bad/10 p-2.5 font-mono text-xs text-bad">{job.error}</p>}
      </Card>

      {job.status === 'running' && job.prompt && (
        <Card className="border-warn/40 p-4">
          <PromptCard key={job.prompt.id} job={job} prompt={job.prompt} autoFocus />
        </Card>
      )}

      <LogView lines={log ?? []} running={job.status === 'running'} />
    </div>
  )
}

function LogView({ lines, running }: { lines: string[]; running: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  // Follow the tail unless you've scrolled up to read.
  useEffect(() => {
    const el = ref.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [lines.length])

  return (
    <Card className="flex min-h-64 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs text-muted">
        <span>Log</span>
        <span className="tabular-nums">{lines.length} lines</span>
      </div>
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
        className="max-h-[60vh] min-h-0 flex-1 overflow-y-auto bg-panel-2/50 p-3 font-mono text-xs leading-5"
      >
        {lines.length === 0 ? (
          <span className="text-faint">{running ? 'Waiting for output…' : 'No output.'}</span>
        ) : (
          lines.map((l, i) => (
            <div key={i} className={cn('break-words whitespace-pre-wrap', /✗|error|failed/i.test(l) && 'text-bad', /^✓/.test(l) && 'text-ok')}>
              {l}
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

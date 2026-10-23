import { ArrowUpRight, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { cn, duration } from '@/lib/format'
import { useJobs } from '@/lib/jobs'
import type { ActionName } from '@/lib/api'
import { JobStatusIcon, jobStatusLabel } from './JobStatus'
import { LogView } from './LogView'
import { Button, Progress } from './ui'

/**
 * Start jobs from a page and keep hold of the latest one, so the page can show its progress
 * inline. `run` takes CLI words (`['release', '123', '--save']`).
 */
export function useRunner() {
  const { store } = useJobs()
  const [jobId, setJobId] = useState<number | null>(null)
  const track = (id: number | null) => {
    if (id !== null) setJobId(id)
    return id
  }
  return {
    jobId,
    run: async (args: string[]) => track(await store.run(args)),
    start: async (name: ActionName, body?: unknown) => track(await store.start(name, body)),
    clear: () => setJobId(null),
  }
}

/** A running (or just-finished) job, in place: status, progress, Stop, and optionally its log. */
export function JobInline({ jobId, withLog, className }: { jobId: number | null; withLog?: boolean; className?: string }) {
  const { jobs, logs, store } = useJobs()
  const job = jobId === null ? undefined : jobs.find((j) => j.id === jobId)
  const log = jobId === null ? undefined : logs[jobId]
  const [, tick] = useState(0)

  useEffect(() => {
    if (jobId !== null && withLog && log === undefined && job) void store.loadLog(jobId)
  }, [jobId, withLog, log, job, store])

  useEffect(() => {
    if (job?.status !== 'running') return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [job?.status])

  if (!job) return null
  const last = log?.[log.length - 1]

  return (
    <div className={cn('animate-fade-in space-y-3', className)}>
      <div className="flex items-center gap-3 rounded-lg border border-line bg-panel-2/60 px-3 py-2.5">
        <JobStatusIcon job={job} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">
            {jobStatusLabel(job)} <span className="font-normal text-muted">· {duration(job.started_at, job.finished_at)}</span>
          </p>
          {job.error ? (
            <p className="truncate text-xs text-bad">{job.error}</p>
          ) : (
            !withLog && last && <p className="truncate font-mono text-xs text-faint">{last}</p>
          )}
          {job.progress && job.status === 'running' && <Progress value={job.progress[0]} total={job.progress[1]} className="mt-1.5" />}
        </div>
        {job.status === 'running' && (
          <Button size="sm" variant="ghost" onClick={() => void store.cancel(job.id)} title="Stop">
            <Square className="size-3" />
          </Button>
        )}
        <Link to={`/jobs/${job.id}`} className="flex items-center gap-0.5 text-xs text-muted hover:text-fg">
          Log <ArrowUpRight className="size-3" />
        </Link>
      </div>
      {withLog && <LogView lines={log ?? []} running={job.status === 'running'} compact />}
    </div>
  )
}

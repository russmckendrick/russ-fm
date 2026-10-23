import { CircleHelp } from 'lucide-react'
import { Link, useMatch } from 'react-router'
import { useJobs } from '@/lib/jobs'
import { PromptCard } from './PromptCard'

/**
 * A floating panel for whichever job is waiting on you, on every page — except that job's own
 * page, which shows the prompt inline.
 */
export function PromptDock() {
  const { jobs } = useJobs()
  const match = useMatch('/jobs/:id')
  const waiting = jobs.filter((j) => j.status === 'running' && j.prompt)
  const job = waiting.find((j) => String(j.id) !== match?.params.id)
  if (!job?.prompt) return null
  const others = waiting.length - 1

  return (
    <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <section
        aria-label="Job needs input"
        className="w-full max-w-2xl animate-rise-in rounded-xl border border-line-strong bg-panel p-4 shadow-[0_12px_48px_rgb(0_0_0/0.18)]"
      >
        <header className="mb-3 flex items-center justify-between gap-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <CircleHelp className="size-3.5 text-warn" />
            <Link to={`/jobs/${job.id}`} className="font-medium text-fg hover:underline">
              {job.title}
            </Link>
            needs your input
          </span>
          {others > 0 && <span>{others} more waiting</span>}
        </header>
        <PromptCard key={job.prompt.id} job={job} prompt={job.prompt} autoFocus />
      </section>
    </div>
  )
}

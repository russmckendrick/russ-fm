import { CheckCircle2, CircleHelp, CircleSlash, Loader2, XCircle } from 'lucide-react'
import { cn } from '@/lib/format'
import type { JobSnapshot } from '@/lib/types'

export function JobStatusIcon({ job, className }: { job: JobSnapshot; className?: string }) {
  const cls = cn('size-4 shrink-0', className)
  if (job.status === 'running')
    return job.prompt ? <CircleHelp className={cn(cls, 'text-warn')} /> : <Loader2 className={cn(cls, 'animate-spin text-accent')} />
  if (job.status === 'done') return <CheckCircle2 className={cn(cls, 'text-ok')} />
  if (job.status === 'failed') return <XCircle className={cn(cls, 'text-bad')} />
  return <CircleSlash className={cn(cls, 'text-faint')} />
}

export function jobStatusLabel(job: JobSnapshot): string {
  if (job.status === 'running') return job.prompt ? 'Waiting for you' : 'Running'
  return { done: 'Done', failed: 'Failed', cancelled: 'Cancelled' }[job.status]
}

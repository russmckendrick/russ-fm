// Live job state: one EventSource on /api/events feeds a small external store that every page
// reads with useSyncExternalStore. Events carry a global `seq`, so anything at or below the seq
// of the snapshot we loaded is already reflected and is dropped.

import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { api, type ActionName } from './api'
import type { Envelope, JobSnapshot, PromptAnswer } from './types'

const MAX_LOG = 5000

export interface Toast {
  id: number
  tone: 'ok' | 'bad' | 'info'
  title: string
  body?: string
  jobId?: number
}

interface State {
  connected: boolean
  jobs: JobSnapshot[]
  /** Logs for jobs we've loaded or watched start; others load on demand. */
  logs: Record<number, string[]>
  toasts: Toast[]
}

/** Job kinds that only read, so finishing them leaves cached data alone. */
const READ_ONLY = new Set(['probe', 'test', 'status', 'report'])

class JobStore {
  private state: State = { connected: false, jobs: [], logs: {}, toasts: [] }
  private listeners = new Set<() => void>()
  private seq = 0
  private logSeq: Record<number, number> = {}
  private source: EventSource | null = null
  private retry: ReturnType<typeof setTimeout> | null = null
  private toastId = 0
  private queryClient: QueryClient

  constructor(queryClient: QueryClient) {
    this.queryClient = queryClient
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getState = () => this.state

  private set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((fn) => fn())
  }

  private updateJob(id: number, fn: (j: JobSnapshot) => JobSnapshot) {
    this.set({ jobs: this.state.jobs.map((j) => (j.id === id ? fn(j) : j)) })
  }

  connect() {
    if (this.source) return
    const source = new EventSource('/api/events')
    this.source = source
    source.onopen = () => {
      this.set({ connected: true })
      void this.resync()
    }
    source.onmessage = (e) => this.apply(JSON.parse(e.data) as Envelope)
    source.addEventListener('resync', () => void this.resync())
    source.onerror = () => {
      // The server went away (restart, Ctrl-C): reconnect with a fresh snapshot.
      this.set({ connected: false })
      source.close()
      this.source = null
      if (this.retry) clearTimeout(this.retry)
      this.retry = setTimeout(() => this.connect(), 2000)
    }
  }

  disconnect() {
    this.source?.close()
    this.source = null
    if (this.retry) clearTimeout(this.retry)
  }

  async resync() {
    const { seq, jobs } = await api.jobs()
    this.seq = seq
    this.set({ jobs })
  }

  /** Load a job's full log (and keep following it). */
  async loadLog(id: number) {
    const { seq, job } = await api.job(id)
    this.logSeq[id] = seq
    this.set({
      logs: { ...this.state.logs, [id]: job.log ?? [] },
      jobs: this.state.jobs.some((j) => j.id === id)
        ? this.state.jobs.map((j) => (j.id === id ? { ...job, log: undefined } : j))
        : [{ ...job, log: undefined }, ...this.state.jobs],
    })
  }

  private apply(env: Envelope) {
    if (env.seq <= this.seq && env.type !== 'log') return
    switch (env.type) {
      case 'job_started':
        this.logSeq[env.job.id] = env.seq
        this.set({
          jobs: [env.job, ...this.state.jobs.filter((j) => j.id !== env.job.id)],
          logs: { ...this.state.logs, [env.job.id]: [] },
        })
        break
      case 'log': {
        const after = this.logSeq[env.job_id]
        if (after === undefined || env.seq <= after) return
        const prev = this.state.logs[env.job_id] ?? []
        const next = prev.length >= MAX_LOG ? [...prev.slice(prev.length - MAX_LOG + 1), env.line] : [...prev, env.line]
        this.set({ logs: { ...this.state.logs, [env.job_id]: next } })
        break
      }
      case 'progress':
        this.updateJob(env.job_id, (j) => ({ ...j, progress: [env.done, env.total] }))
        break
      case 'prompt':
        this.updateJob(env.job_id, (j) => ({ ...j, prompt: env.prompt }))
        break
      case 'prompt_cleared':
        this.updateJob(env.job_id, (j) => (j.prompt?.id === env.prompt_id ? { ...j, prompt: null } : j))
        break
      case 'job_finished': {
        this.updateJob(env.job.id, () => env.job)
        // Anything that writes may have changed any view: refetch what's on screen.
        if (!READ_ONLY.has(env.job.kind)) void this.queryClient.invalidateQueries()
        const tone = env.job.status === 'done' ? 'ok' : env.job.status === 'failed' ? 'bad' : 'info'
        const verb = { done: 'finished', failed: 'failed', cancelled: 'cancelled', running: 'running' }[env.job.status]
        this.toast({ tone, title: `${env.job.title} ${verb}`, body: env.job.error ?? undefined, jobId: env.job.id })
        break
      }
    }
    this.seq = Math.max(this.seq, env.seq)
  }

  toast(t: Omit<Toast, 'id'>) {
    const id = ++this.toastId
    this.set({ toasts: [...this.state.toasts, { ...t, id }].slice(-4) })
    setTimeout(() => this.dismiss(id), t.tone === 'bad' ? 9000 : 5000)
  }

  dismiss(id: number) {
    this.set({ toasts: this.state.toasts.filter((t) => t.id !== id) })
  }

  async start(name: ActionName, body?: unknown): Promise<number | null> {
    return this.launch(() => api.action(name, body))
  }

  /** Run `scrapper <args>` as a job. */
  async run(args: string[]): Promise<number | null> {
    return this.launch(() => api.run(args))
  }

  private async launch(call: () => Promise<{ job_id: number }>): Promise<number | null> {
    try {
      const { job_id } = await call()
      // Follow its log from the start, even before the job page opens.
      this.logSeq[job_id] ??= 0
      return job_id
    } catch (e) {
      this.toast({ tone: 'bad', title: "Couldn't start", body: e instanceof Error ? e.message : String(e) })
      return null
    }
  }

  async cancel(id: number) {
    await api.cancel(id).catch(() => undefined)
  }

  async answer(id: number, promptId: number, answer: PromptAnswer) {
    try {
      await api.answer(id, promptId, answer)
      // Clear optimistically; the prompt_cleared event confirms it.
      this.updateJob(id, (j) => (j.prompt?.id === promptId ? { ...j, prompt: null } : j))
    } catch (e) {
      this.toast({ tone: 'bad', title: "Couldn't answer", body: e instanceof Error ? e.message : String(e) })
    }
  }
}

const Ctx = createContext<JobStore | null>(null)

export function JobsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const store = useMemo(() => new JobStore(queryClient), [queryClient])
  useEffect(() => {
    store.connect()
    return () => store.disconnect()
  }, [store])
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

function useStore() {
  const store = useContext(Ctx)
  if (!store) throw new Error('JobsProvider missing')
  return store
}

/** Live job state plus the actions that change it. */
export function useJobs() {
  const store = useStore()
  const state = useSyncExternalStore(store.subscribe, store.getState)
  return { ...state, store }
}

/** The newest job of `kind` (running or finished). */
export function useLatestJob(kind: string) {
  const { jobs } = useJobs()
  return jobs.find((j) => j.kind === kind) ?? null
}

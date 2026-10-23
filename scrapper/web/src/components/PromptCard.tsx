import { Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/format'
import { useJobs } from '@/lib/jobs'
import type { JobSnapshot, PromptView } from '@/lib/types'
import { Button, Kbd } from './ui'

/** Answers a job's open prompt: a candidate picker or a Perplexity description review. */
export function PromptCard({ job, prompt, autoFocus }: { job: JobSnapshot; prompt: PromptView; autoFocus?: boolean }) {
  return prompt.type === 'pick' ? (
    <PickPrompt job={job} prompt={prompt} autoFocus={autoFocus} />
  ) : (
    <DescribePrompt job={job} prompt={prompt} />
  )
}

function PickPrompt({
  job,
  prompt,
  autoFocus,
}: {
  job: JobSnapshot
  prompt: Extract<PromptView, { type: 'pick' }>
  autoFocus?: boolean
}) {
  const { store } = useJobs()
  const [sel, setSel] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setSel(0)
    if (autoFocus) ref.current?.focus()
  }, [prompt.id, autoFocus])
  const choose = (index: number | null) => void store.answer(job.id, prompt.id, { type: 'pick', index })

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="outline-none"
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') setSel((s) => Math.min(prompt.rows.length - 1, s + 1))
        else if (e.key === 'ArrowUp') setSel((s) => Math.max(0, s - 1))
        else if (e.key === 'Enter') choose(sel)
        else if (e.key === 'Escape') choose(null)
        else return
        e.preventDefault()
      }}
    >
      <p className="mb-2 text-[13px] font-medium">{prompt.prompt}</p>
      <div className="max-h-[45vh] overflow-auto rounded-md border border-line">
        <table className="w-full text-left text-[13px]">
          <thead className="sticky top-0 bg-panel-2 text-xs text-faint">
            <tr>
              <th className="w-8 px-2 py-1.5 font-medium">#</th>
              {prompt.header.map((h) => (
                <th key={h} className="px-2 py-1.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prompt.rows.map((row, i) => (
              <tr
                key={i}
                onClick={() => setSel(i)}
                onDoubleClick={() => choose(i)}
                className={cn('cursor-pointer border-t border-line', i === sel ? 'bg-accent-soft' : 'hover:bg-hover')}
              >
                <td className="px-2 py-1.5 text-faint tabular-nums">{i + 1}</td>
                {row.map((cell, j) => (
                  <td key={j} className="max-w-64 truncate px-2 py-1.5" title={cell}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="hidden items-center gap-1 text-xs text-faint sm:flex">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move · <Kbd>↵</Kbd> choose · <Kbd>esc</Kbd> skip
        </span>
        <div className="flex gap-2">
          <Button onClick={() => choose(null)}>Skip</Button>
          <Button variant="primary" onClick={() => choose(sel)} disabled={prompt.rows.length === 0}>
            Use #{sel + 1}
          </Button>
        </div>
      </div>
    </div>
  )
}

function DescribePrompt({ job, prompt }: { job: JobSnapshot; prompt: Extract<PromptView, { type: 'describe' }> }) {
  const { store } = useJobs()
  const [context, setContext] = useState(prompt.context)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setContext(prompt.context)
    setBusy(false)
  }, [prompt.id, prompt.context])

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium">
        <Sparkles className="size-3.5 text-accent" />
        Description · {prompt.artist} — {prompt.album}
      </p>
      <div className="max-h-[32vh] overflow-auto rounded-md border border-line bg-panel-2 p-3 text-[13px] leading-relaxed whitespace-pre-wrap">
        {prompt.preview || <span className="text-faint">No description yet — add context and generate one.</span>}
      </div>
      <label className="mt-3 block text-xs font-medium text-muted" htmlFor={`ctx-${prompt.id}`}>
        Context for Perplexity
      </label>
      <textarea
        id={`ctx-${prompt.id}`}
        value={context}
        onChange={(e) => setContext(e.target.value)}
        rows={3}
        placeholder="e.g. the 2016 remaster, not the original pressing"
        className="mt-1 w-full resize-y rounded-md border border-line bg-panel p-2 text-[13px] focus:border-accent focus:outline-none"
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button onClick={() => void store.answer(job.id, prompt.id, { type: 'skip' })}>Skip</Button>
        <Button
          busy={busy}
          onClick={() => {
            setBusy(true)
            void store.answer(job.id, prompt.id, { type: 'generate', context })
          }}
        >
          {prompt.preview ? 'Regenerate' : 'Generate'}
        </Button>
        <Button
          variant="primary"
          disabled={!prompt.preview}
          onClick={() => void store.answer(job.id, prompt.id, { type: 'accept' })}
        >
          Accept
        </Button>
      </div>
    </div>
  )
}

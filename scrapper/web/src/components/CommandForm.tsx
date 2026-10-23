import { Check, Copy, Play } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/format'
import type { ArgSpec, CommandSpec } from '@/lib/types'
import { JobInline, useRunner } from './JobInline'
import { Button, Input, Select } from './ui'

type Values = Record<string, string | boolean>

/** `--long` (or `-s`) for an option. */
const flagName = (a: ArgSpec) => (a.long ? `--${a.long}` : `-${a.short}`)

/** The words after `scrapper` for a command and its form values (defaults are left out). */
export function buildArgs(cmd: CommandSpec, values: Values): string[] {
  const out = [...cmd.path]
  for (const a of cmd.args.filter((a) => a.kind === 'positional')) {
    const v = String(values[a.id] ?? '').trim()
    if (v) out.push(v)
  }
  for (const a of cmd.args.filter((a) => a.kind !== 'positional')) {
    const v = values[a.id]
    if (a.kind === 'flag') {
      if (v === true) out.push(flagName(a))
    } else if (typeof v === 'string' && v.trim() !== '' && v.trim() !== (a.default ?? '')) {
      out.push(flagName(a), v.trim())
    }
  }
  return out
}

/** Shell-style words: whitespace splits, quotes group. `artist "Talk Talk" --save`. */
export function splitWords(line: string): string[] {
  const words: string[] = []
  let cur = ''
  let quote: string | null = null
  let any = false
  for (const ch of line.trim()) {
    if (quote) {
      if (ch === quote) quote = null
      else cur += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      any = true
    } else if (/\s/.test(ch)) {
      if (cur || any) words.push(cur)
      cur = ''
      any = false
    } else cur += ch
  }
  if (cur || any) words.push(cur)
  return words[0] === 'scrapper' ? words.slice(1) : words
}

const quoteWord = (w: string) => (w === '' || /[\s"']/.test(w) ? `"${w.replace(/"/g, '\\"')}"` : w)
export const commandLine = (args: string[]) => ['scrapper', ...args].map(quoteWord).join(' ')

/** A form for one CLI command, generated from its clap definition, that runs it as a job. */
export function CommandForm({ cmd, initial }: { cmd: CommandSpec; initial?: Values }) {
  const [values, setValues] = useState<Values>(initial ?? {})
  const { jobId, run } = useRunner()
  const [copied, setCopied] = useState(false)
  useEffect(() => setValues(initial ?? {}), [cmd.path.join(' '), initial]) // eslint-disable-line react-hooks/exhaustive-deps

  const args = useMemo(() => buildArgs(cmd, values), [cmd, values])
  const missing = cmd.args.filter((a) => a.required && !String(values[a.id] ?? '').trim())
  const set = (id: string, v: string | boolean) => setValues((s) => ({ ...s, [id]: v }))

  const positionals = cmd.args.filter((a) => a.kind === 'positional')
  const options = cmd.args.filter((a) => a.kind === 'value')
  const flags = cmd.args.filter((a) => a.kind === 'flag')

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (missing.length === 0) void run(args)
      }}
    >
      {(positionals.length > 0 || options.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[...positionals, ...options].map((a) => (
            <Field key={a.id} arg={a}>
              {a.choices.length > 0 ? (
                <Select className="w-full max-w-none" value={String(values[a.id] ?? '')} onChange={(e) => set(a.id, e.target.value)}>
                  <option value="">{a.default ? `${a.default} (default)` : a.required ? 'Choose…' : '—'}</option>
                  {a.choices.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={String(values[a.id] ?? '')}
                  onChange={(e) => set(a.id, e.target.value)}
                  placeholder={a.default ?? a.value_name?.toLowerCase() ?? ''}
                />
              )}
            </Field>
          ))}
        </div>
      )}

      {flags.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {flags.map((a) => (
            <label
              key={a.id}
              className={cn(
                'flex cursor-pointer gap-2.5 rounded-md border p-2.5 transition-colors',
                values[a.id] === true ? 'border-accent bg-accent-soft/50' : 'border-line hover:bg-hover',
              )}
            >
              <input
                type="checkbox"
                checked={values[a.id] === true}
                onChange={(e) => set(a.id, e.target.checked)}
                className="mt-0.5 size-3.5 accent-[var(--accent)]"
              />
              <span className="min-w-0">
                <code className="font-mono text-xs font-medium">{flagName(a)}</code>
                {a.help && <span className="mt-0.5 block text-xs text-muted">{a.help}</span>}
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel-2/60 p-2 pl-3">
        <code className="min-w-0 flex-1 font-mono text-xs break-all text-muted">{commandLine(args)}</code>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(commandLine(args))
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          title="Copy the command"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </Button>
        <Button type="submit" variant="primary" disabled={missing.length > 0} title={missing.length ? `Needs ${missing.map((a) => a.id).join(', ')}` : undefined}>
          <Play className="size-3" /> Run
        </Button>
      </div>

      <JobInline jobId={jobId} withLog />
    </form>
  )
}

function Field({ arg, children }: { arg: ArgSpec; children: ReactNode }) {
  const label = arg.kind === 'positional' ? (arg.value_name ?? arg.id).toUpperCase() : flagName(arg)
  return (
    <div>
      <label className="mb-1 flex items-baseline gap-1.5 text-xs">
        <code className="font-mono font-medium text-fg">{label}</code>
        {arg.required && <span className="text-bad">required</span>}
      </label>
      {children}
      {arg.help && <p className="mt-1 text-xs text-muted">{arg.help}</p>}
    </div>
  )
}

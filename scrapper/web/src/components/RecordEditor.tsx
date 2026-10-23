import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Check, Info, Minus, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, keys, type RecordKind } from '@/lib/api'
import { cn } from '@/lib/format'
import { useJobs } from '@/lib/jobs'
import type { EditPreview, FieldEdit, FieldSpec } from '@/lib/types'
import { Dialog } from './Dialog'
import { JobInline, useRunner } from './JobInline'
import { FileDiff } from './JsonDiff'
import { Badge, Button, EmptyState, ErrorState, Spinner } from './ui'

type Draft = Record<string, { text?: string; rows?: string[][] }>

const HINTS: Partial<Record<FieldSpec['kind'], string>> = {
  date: 'YYYY, YYYY-MM or YYYY-MM-DD',
  csv: 'Comma-separated',
  service: 'Paste a URL or ID — it’s looked up when you preview. Blank clears it.',
  int: 'Whole number',
}

const sameRows = (a?: string[][] | null, b?: string[][] | null) => JSON.stringify(a ?? []) === JSON.stringify(b ?? [])

/**
 * Every field of a release or artist record, editable in place (the TUI detail editor), with
 * Preview showing exactly what the published files will look like before Save writes them.
 */
export function RecordEditor({ kind, slug }: { kind: RecordKind; slug: string }) {
  const { data, error, isLoading } = useQuery({ queryKey: keys.fields(kind, slug), queryFn: () => api.fields(kind, slug) })
  const [draft, setDraft] = useState<Draft>({})
  const [preview, setPreview] = useState<EditPreview | null>(null)
  const refresh = useRunner()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { store } = useJobs()

  useEffect(() => setDraft({}), [slug])

  const fields = data?.fields ?? []
  const edits: FieldEdit[] = useMemo(
    () =>
      fields.flatMap((f): FieldEdit[] => {
        const d = draft[f.key]
        if (!d) return []
        if (f.kind === 'structured') return sameRows(d.rows, f.rows) ? [] : [{ field: f.key, rows: d.rows }]
        return d.text === undefined || d.text === f.value ? [] : [{ field: f.key, text: d.text }]
      }),
    [fields, draft],
  )
  const changed = new Set(edits.map((e) => e.field))

  const previewMut = useMutation({ mutationFn: () => api.previewEdit(kind, slug, edits), onSuccess: setPreview })
  const saveMut = useMutation({
    mutationFn: () => api.saveEdit(kind, slug, edits),
    onSuccess: (r) => {
      setPreview(null)
      setDraft({})
      store.toast({
        tone: 'ok',
        title: 'Saved',
        body: [r.releases_rewritten ? `${r.releases_rewritten} release page(s) rewritten` : null, `collection.json: ${r.collection_entries} entries`]
          .filter(Boolean)
          .join(' · '),
      })
      void qc.invalidateQueries()
      if (r.slug !== slug) navigate(`/${kind}/${r.slug}`, { replace: true })
    },
  })

  if (isLoading) return <div className="flex h-40 items-center justify-center"><Spinner /></div>
  if (error) return (error as { status?: number }).status === 404 ? <EmptyState title="Not in the database" body="Process it first to edit it here." /> : <ErrorState error={error} />

  const set = (key: string, v: { text?: string; rows?: string[][] }) => setDraft((d) => ({ ...d, [key]: { ...d[key], ...v } }))
  const reset = (key: string) =>
    setDraft((d) => {
      const n = { ...d }
      delete n[key]
      return n
    })

  return (
    <div className="pb-24">
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-line bg-panel-2/50 p-3 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Edit any field, then <strong className="text-fg">Preview</strong> to see exactly how the published JSON changes before saving.{' '}
          <RefreshCw className="inline size-3" /> re-fetches a field from its source (matches you choose pop up).
        </span>
      </div>
      <JobInline jobId={refresh.jobId} className="mb-4" />

      <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
        {fields.map((f) => (
          <FieldRow
            key={f.key}
            f={f}
            draft={draft[f.key]}
            changed={changed.has(f.key)}
            onChange={(v) => set(f.key, v)}
            onReset={() => reset(f.key)}
            onRefresh={() => void refresh.start('refresh-field', { kind, slug, field: f.key })}
          />
        ))}
      </ul>

      {edits.length > 0 && (
        <div className="sticky bottom-4 z-10 mt-4 flex animate-rise-in items-center gap-3 rounded-xl border border-line-strong bg-panel/95 px-4 py-3 shadow-[0_8px_32px_rgb(0_0_0/0.15)] backdrop-blur">
          <span className="text-[13px]">
            <strong>{edits.length}</strong> unsaved change{edits.length === 1 ? '' : 's'}
          </span>
          {previewMut.error && <span className="min-w-0 flex-1 truncate text-xs text-bad">{previewMut.error.message}</span>}
          <span className="flex-1" />
          <Button variant="ghost" onClick={() => setDraft({})}>
            Discard
          </Button>
          <Button variant="primary" busy={previewMut.isPending} onClick={() => previewMut.mutate()}>
            Preview changes
          </Button>
        </div>
      )}

      <Dialog
        open={preview !== null}
        onClose={() => setPreview(null)}
        title="Review changes"
        sub="Nothing is written until you save."
        footer={
          <>
            {saveMut.error && <span className="mr-auto self-center text-xs text-bad">{saveMut.error.message}</span>}
            <Button onClick={() => setPreview(null)}>Keep editing</Button>
            <Button variant="primary" busy={saveMut.isPending} onClick={() => saveMut.mutate()}>
              <Check className="size-3.5" /> Save
            </Button>
          </>
        }
      >
        {preview?.notes.length ? (
          <ul className="space-y-1 rounded-lg bg-accent-soft/50 p-3 text-xs">
            {preview.notes.map((n) => (
              <li key={n} className="flex gap-2">
                <Info className="mt-0.5 size-3 shrink-0 text-accent" /> {n}
              </li>
            ))}
          </ul>
        ) : null}
        {preview?.files.map((f) => <FileDiff key={f.path} {...f} />)}
      </Dialog>
    </div>
  )
}

function FieldRow({
  f,
  draft,
  changed,
  onChange,
  onReset,
  onRefresh,
}: {
  f: FieldSpec
  draft?: { text?: string; rows?: string[][] }
  changed: boolean
  onChange: (v: { text?: string; rows?: string[][] }) => void
  onReset: () => void
  onRefresh: () => void
}) {
  const text = draft?.text ?? f.value
  const inputCls = cn(
    'w-full rounded-md border bg-panel px-2.5 text-[13px] focus:border-accent focus:outline-none',
    changed ? 'border-accent' : 'border-line',
  )
  return (
    <li className={cn('grid gap-2 px-4 py-3 sm:grid-cols-[150px_minmax(0,1fr)_auto]', changed && 'bg-accent-soft/30')}>
      <div className="flex items-start gap-1.5 pt-1.5">
        {f.present ? <Check className="mt-0.5 size-3 shrink-0 text-ok" /> : <Minus className="mt-0.5 size-3 shrink-0 text-faint" />}
        <span className="text-[13px] font-medium">{f.label}</span>
      </div>
      <div className="min-w-0">
        {f.kind === 'refresh' || !f.editable ? (
          <p className="pt-1.5 font-mono text-xs text-muted">{f.value || '—'}</p>
        ) : f.kind === 'structured' ? (
          <RowsEditor columns={f.columns ?? []} rows={draft?.rows ?? f.rows ?? []} onChange={(rows) => onChange({ rows })} />
        ) : f.multiline ? (
          <textarea value={text} onChange={(e) => onChange({ text: e.target.value })} rows={Math.min(10, Math.max(3, Math.ceil(text.length / 90)))} className={cn(inputCls, 'resize-y py-2 leading-relaxed')} />
        ) : (
          <input
            value={text}
            onChange={(e) => onChange({ text: e.target.value })}
            inputMode={f.kind === 'int' ? 'numeric' : undefined}
            className={cn(inputCls, 'h-8', f.kind === 'service' && 'font-mono text-xs')}
            spellCheck={f.kind === 'text'}
          />
        )}
        {HINTS[f.kind] && f.editable && f.kind !== 'structured' && <p className="mt-1 text-[11px] text-faint">{HINTS[f.kind]}</p>}
      </div>
      <div className="flex items-start gap-1 pt-0.5">
        {changed && (
          <Button size="sm" variant="ghost" onClick={onReset} title="Undo this change">
            <RotateCcw className="size-3" />
          </Button>
        )}
        {f.refreshable && (
          <Button size="sm" variant="ghost" onClick={onRefresh} title={`Re-fetch ${f.label} from its source and save`}>
            <RefreshCw className="size-3" />
          </Button>
        )}
      </div>
    </li>
  )
}

/** A small spreadsheet for structured fields: edit cells, add, remove and reorder rows. */
function RowsEditor({ columns, rows, onChange }: { columns: string[]; rows: string[][]; onChange: (rows: string[][]) => void }) {
  const setCell = (r: number, c: number, v: string) => onChange(rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)))
  const move = (r: number, d: number) => {
    const n = [...rows]
    const [x] = n.splice(r, 1)
    n.splice(r + d, 0, x)
    onChange(n)
  }
  const wide = (c: string) => /title|url|name/i.test(c)
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-panel-2 text-faint">
            <tr>
              {columns.map((c) => (
                <th key={c} className={cn('px-2 py-1.5 text-left font-medium', wide(c) ? 'w-auto' : 'w-24')}>
                  {c}
                </th>
              ))}
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="group border-t border-line">
                {columns.map((c, ci) => (
                  <td key={c} className="p-0.5">
                    <input
                      value={row[ci] ?? ''}
                      onChange={(e) => setCell(r, ci, e.target.value)}
                      className="h-7 w-full rounded bg-transparent px-1.5 focus:bg-panel focus:outline focus:outline-accent"
                      aria-label={`${c} ${r + 1}`}
                    />
                  </td>
                ))}
                <td className="px-1 whitespace-nowrap opacity-40 group-hover:opacity-100 group-focus-within:opacity-100">
                  <button className="p-1 text-faint hover:text-fg disabled:opacity-30" disabled={r === 0} onClick={() => move(r, -1)} aria-label="Move up">
                    <ArrowUp className="size-3" />
                  </button>
                  <button className="p-1 text-faint hover:text-fg disabled:opacity-30" disabled={r === rows.length - 1} onClick={() => move(r, 1)} aria-label="Move down">
                    <ArrowDown className="size-3" />
                  </button>
                  <button className="p-1 text-faint hover:text-bad" onClick={() => onChange(rows.filter((_, i) => i !== r))} aria-label="Remove row">
                    <Trash2 className="size-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-line bg-panel-2/50 px-2 py-1">
        <Badge>{rows.length} rows</Badge>
        <Button size="sm" variant="ghost" onClick={() => onChange([...rows, columns.map(() => '')])}>
          <Plus className="size-3" /> Add row
        </Button>
      </div>
    </div>
  )
}

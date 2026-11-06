import type {
  ArtistDetail,
  BackupFile,
  BoxsetRow,
  ClassifiedCandidate,
  CommandSpec,
  DbRow,
  EditPreview,
  EditSaved,
  FieldEdit,
  FieldList,
  HealthCheck,
  ImageList,
  JobSnapshot,
  LibraryArtist,
  LibraryItem,
  Overview,
  PromptAnswer,
  ReleaseDetail,
} from './types'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(body?.error ?? res.statusText, res.status)
  return body as T
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

/** Job-starting actions with their own endpoint (everything else runs through `run`). */
export type ActionName = 'probe-services' | 'generate-collection' | 'process-releases' | 'enrich-artists' | 'site-script' | 'refresh-field' | 'replace-release'

export const api = {
  overview: () => request<Overview>('/overview'),
  library: () => request<{ items: LibraryItem[] }>('/library'),
  artists: () => request<{ artists: LibraryArtist[] }>('/artists'),
  release: (slug: string) => request<ReleaseDetail>(`/releases/${encodeURIComponent(slug)}`),
  artist: (slug: string) => request<ArtistDetail>(`/artists/${encodeURIComponent(slug)}`),
  jobs: () => request<{ seq: number; jobs: JobSnapshot[] }>('/jobs'),
  job: (id: number) => request<{ seq: number; job: JobSnapshot }>(`/jobs/${id}`),
  cancel: (id: number) => post<{ ok: true }>(`/jobs/${id}/cancel`),
  answer: (id: number, promptId: number, answer: PromptAnswer) =>
    post<{ ok: true }>(`/jobs/${id}/answer`, { prompt_id: promptId, answer }),
  action: (name: ActionName, body?: unknown) => post<{ job_id: number }>(`/actions/${name}`, body),
  /** Run `scrapper <args>` as a job. */
  run: (args: string[]) => post<{ job_id: number }>('/run', { args }),
  commands: () => request<{ commands: CommandSpec[] }>('/commands'),
  /** An artist's photo and fanart, or an album's cover, with sizes and upscale targets. */
  images: (kind: 'artist' | 'album', slug: string) => request<ImageList>(`/images/${kind}/${encodeURIComponent(slug)}`),
  /** AI-upscale one image now (the original is kept); `force` doubles one already at its target. */
  upscaleImage: (path: string, force = false) =>
    post<{ path: string; from: [number, number]; to: [number, number] }>('/images/upscale', { path, force }),
  /** Put an upscaled image back to its kept original. */
  restoreImage: (path: string) => post<{ path: string; restored: true }>('/images/restore', { path }),
  newInCollection: () => request<{ items: ClassifiedCandidate[] }>('/collection/new'),
  boxsets: () => request<{ boxsets: BoxsetRow[] }>('/boxsets'),
  setBoxsetSingle: (id: string, single: boolean) => post<{ ok: true }>(`/boxsets/${id}/single`, { single }),
  dbRows: (p: { kind: 'release' | 'artist'; q?: string; sort?: string; limit?: number }) =>
    request<{ rows: DbRow[] }>(`/db/rows?${new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]))}`),
  backups: () => request<{ dir: string; backups: BackupFile[] }>('/backups'),
  fields: (kind: RecordKind, slug: string) => request<FieldList>(`/${kind}s/${encodeURIComponent(slug)}/fields`),
  previewEdit: (kind: RecordKind, slug: string, edits: FieldEdit[]) =>
    post<EditPreview>(`/${kind}s/${encodeURIComponent(slug)}/edit`, { edits, save: false }),
  saveEdit: (kind: RecordKind, slug: string, edits: FieldEdit[]) =>
    post<EditSaved>(`/${kind}s/${encodeURIComponent(slug)}/edit`, { edits, save: true }),
  health: () => request<{ checks: HealthCheck[] }>('/health/checks'),
  removeOrphanFolder: (slug: string) => post<{ ok: true }>(`/orphans/${encodeURIComponent(slug)}/remove`),
}

export type RecordKind = 'release' | 'artist'

/** Query keys, shared so job completions can invalidate the right data. */
export const keys = {
  overview: ['overview'] as const,
  library: ['library'] as const,
  artists: ['artists'] as const,
  release: (slug: string) => ['release', slug] as const,
  artist: (slug: string) => ['artist', slug] as const,
  commands: ['commands'] as const,
  newInCollection: ['collection-new'] as const,
  boxsets: ['boxsets'] as const,
  db: ['db'] as const,
  backups: ['backups'] as const,
  fields: (kind: string, slug: string) => ['fields', kind, slug] as const,
  health: ['health'] as const,
  images: (kind: string, slug: string) => ['images', kind, slug] as const,
}

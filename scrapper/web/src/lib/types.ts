// Shapes returned by the scrapper web API (src/web/api.rs). Published JSON (`public`) and
// database records (`record`) are passed through as-is, so only the fields the UI reads are typed.

export interface ArtistRef {
  name: string
  slug: string | null
}

export interface LibraryItem {
  slug: string
  discogs_id: string | null
  title: string
  artist: string
  artists: ArtistRef[]
  year: number | null
  released: string | null
  date_added: string | null
  genres: string[]
  styles: string[]
  format: string | null
  vinyl_colours: string[]
  labels: string[]
  country: string | null
  listeners: number | null
  color: string | null
}

export interface LibraryArtist {
  slug: string
  name: string
  release_count: number
  genres: string[]
  latest_added: string | null
}

export type Count = [string, number]

export interface Overview {
  stats: {
    total_releases: number
    total_artists: number
    total_collection_items: number
    processed_items: number
    enriched_items: number
  }
  artists: { enriched: number; total: number }
  boxsets: { total: number; processed: number }
  library: {
    releases: number
    artists: number
    coloured_vinyl: number
    genres: Count[]
    formats: Count[]
    decades: Count[]
  }
  recent: LibraryItem[]
  paths: { data_dir: string; db: string; config_dir: string }
}

export interface Track {
  position?: string
  title?: string
  duration?: string
  type_?: string
  artists?: { name?: string }[]
  sub_tracks?: Track[]
}

export interface FormatDetail {
  name?: string
  qty?: string
  colour?: string | null
  descriptions?: string[]
  text?: string | null
}

export interface AlbumJson {
  id?: string
  discogs_id?: string
  title?: string
  year?: number
  released?: string
  country?: string
  genres?: string[]
  styles?: string[]
  labels?: string[]
  formats?: string[]
  format_details?: FormatDetail[]
  vinyl_colours?: string[]
  tracklist?: Track[]
  videos?: (string | { uri?: string; url?: string; title?: string })[]
  discogs_url?: string | null
  apple_music_url?: string | null
  spotify_url?: string | null
  lastfm_url?: string | null
  date_added?: string
  updated_at?: string
  services?: {
    perplexity?: { description?: string; generated_at?: string }
    lastfm?: { wiki_summary?: string; listeners?: number; playcount?: number }
    apple_music?: { editorial_notes?: unknown; copyright?: string }
  }
  artists?: { name?: string; uri_artist?: string }[]
}

export interface ArtistJson {
  id?: string
  name?: string
  biography?: string | null
  country?: string | null
  genres?: string[]
  followers?: number | null
  popularity?: number | null
  formed_date?: string | null
  discogs_url?: string | null
  apple_music_url?: string | null
  spotify_url?: string | null
  lastfm_url?: string | null
  wikipedia_url?: string | null
  updated_at?: string
}

export type DbRecord = Record<string, unknown>

export interface ReleaseDetail {
  slug: string
  public: AlbumJson | null
  record: DbRecord | null
  item: LibraryItem | null
}

export interface ArtistDetail {
  slug: string
  public: ArtistJson | null
  record: DbRecord | null
  summary: LibraryArtist | null
  releases: LibraryItem[]
  /** The artist photo the site shows (a fanart chosen as it, else the hi-res) and its faces' centre. */
  photo?: { file: string; focus: [number, number] | null }
}

export type JobStatus = 'running' | 'done' | 'failed' | 'cancelled'

export type PromptView =
  | { type: 'pick'; id: number; prompt: string; header: string[]; rows: string[][] }
  | { type: 'describe'; id: number; artist: string; album: string; preview: string; context: string }

export type PromptAnswer =
  | { type: 'pick'; index: number | null }
  | { type: 'generate'; context: string }
  | { type: 'accept' }
  | { type: 'skip' }

export interface JobSnapshot {
  id: number
  kind: string
  title: string
  status: JobStatus
  started_at: string
  finished_at: string | null
  progress: [number, number] | null
  error: string | null
  result: unknown
  prompt: PromptView | null
  log?: string[]
}

export type JobEvent =
  | { type: 'job_started'; job: JobSnapshot }
  | { type: 'log'; job_id: number; line: string }
  | { type: 'progress'; job_id: number; done: number; total: number }
  | { type: 'prompt'; job_id: number; prompt: PromptView }
  | { type: 'prompt_cleared'; job_id: number; prompt_id: number }
  | { type: 'job_finished'; job: JobSnapshot }

export type Envelope = JobEvent & { seq: number }

export interface ArgSpec {
  id: string
  kind: 'positional' | 'flag' | 'value'
  long: string | null
  short: string | null
  help: string | null
  long_help: string | null
  required: boolean
  default: string | null
  choices: string[]
  value_name: string | null
  multiple: boolean
}

export interface CommandSpec {
  name: string
  path: string[]
  about: string | null
  long_about: string | null
  args: ArgSpec[]
  subcommands: CommandSpec[]
}

export interface CollectionCandidate {
  release_id: string
  instance_id: string | null
  date_added: string | null
  artist: string
  title: string
  year: number | null
  format: string
}

export interface BoxsetRow {
  discogs_id: string
  title: string
  artist_names: string[]
  year: number | null
  date_added: string | null
  has_headers: boolean
  member_count: number
  single_release: boolean
  processed: boolean
  slug: string | null
}

export interface DbRow {
  discogs_id: string | null
  slug: string | null
  // releases
  title?: string
  artist_names?: string[]
  year?: number | null
  date_added?: string | null
  // artists
  id?: string
  name?: string
  created_at?: string | null
}

export interface BackupFile {
  name: string
  bytes: number
  modified: string | null
}

export interface FieldSpec {
  key: string
  label: string
  kind: 'text' | 'int' | 'date' | 'csv' | 'service' | 'structured' | 'refresh'
  editable: boolean
  refreshable: boolean
  present: boolean
  multiline: boolean
  value: string
  columns: string[] | null
  rows: string[][] | null
}

export interface FieldList {
  slug: string
  fields: FieldSpec[]
}

export interface FieldEdit {
  field: string
  text?: string
  rows?: string[][]
}

export interface EditPreview {
  files: { path: string; before: unknown; after: unknown }[]
  slug: string
  notes: string[]
}

export interface EditSaved {
  saved: true
  slug: string
  releases_rewritten?: number
  collection_entries: number
}

export interface HealthItem {
  kind: 'release' | 'artist'
  slug: string
  title: string
  subtitle: string
  fix: string[] | null
  action: 'remove-folder' | null
}

export interface HealthCheck {
  id: string
  group: string
  label: string
  help: string
  count: number
  fix_all: string[] | null
  fix_all_label: string | null
  items: HealthItem[]
}

export interface ExistingRelease {
  discogs_id: string
  title: string
  artists: string[]
  year: number | null
  date_added: string | null
  slug: string
}

/** A picker candidate, sorted by how it relates to the database. */
export interface ClassifiedCandidate extends CollectionCandidate {
  state: 'new' | 'unmatched' | 'duplicate'
  /** Unmatched ones: their album folder. */
  slug: string | null
  existing: ExistingRelease[]
}

/** One image in the Images panel: an artist photo, a fanart file or an album cover. */
export interface ImageInfo {
  /** Under the data directory, e.g. `artist/pixies/pixies-fanart02.jpg`. */
  path: string
  file: string
  kind: 'artist photo' | 'album cover' | 'fanart'
  width: number
  height: number
  /** What the upscaler would make it, or null when it is already big enough. */
  target: [number, number] | null
  /** Upscaled already: the original is kept and can be restored. */
  upscaled: boolean
  /** The image the artist's desktop hero shows (from the photo notes). */
  hero: boolean
  /** The file the site uses as the artist photo (avatar, cards, phone hero). */
  photo: boolean
}

/** An artist's hand-set image choices (`raw_data.overrides`); null for automatic. */
export interface ImageChoices {
  hero?: string | null
  photo?: string | null
  fanart?: string | null
}

export interface ImageList {
  images: ImageInfo[]
  choices: ImageChoices
  /** Why the upscaler can't run (Upscayl not found), or null. */
  upscaler: string | null
  model: string
}

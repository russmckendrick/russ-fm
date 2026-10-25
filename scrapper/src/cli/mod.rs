//! Clap command surface — a 1:1 mapping of the Python scrapper's commands and flags, plus the
//! built-in `db` and `maintenance` groups that replace the standalone `tools/` scripts.
//!
//! Handlers for commands that don't touch external APIs (status, db, backup, init) are fully
//! implemented here. Network-dependent commands delegate to [`crate::ops`].

use std::path::PathBuf;

use clap::{Args, Parser, Subcommand, ValueEnum};

use crate::{ops, Config, Db};

/// Preferred image source (mirrors `--prefer`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum ImageSource {
    AppleMusic,
    Spotify,
    Theaudiodb,
    Discogs,
    V1,
}

/// Structured-output format for single-entity commands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum OutputFormat {
    Table,
    Json,
    Yaml,
}

#[derive(Debug, Parser)]
#[command(
    name = "scrapper",
    about = "Music collection enrichment — web UI by default (--tui for the terminal UI), CLI subcommands for automation",
    version
)]
pub struct Cli {
    /// Path to config.json (defaults to ./config.json).
    #[arg(short, long, global = true)]
    pub config: Option<PathBuf>,

    /// Log level: DEBUG, INFO, WARNING, ERROR.
    #[arg(long, global = true, default_value = "INFO")]
    pub log_level: String,

    /// Open the terminal UI instead of the web interface (bare invocation only).
    #[arg(long)]
    pub tui: bool,

    /// Port for the web interface; the next free port is used if it is taken.
    #[arg(long, default_value_t = crate::web::DEFAULT_PORT)]
    pub port: u16,

    /// Start the web interface without opening a browser.
    #[arg(long)]
    pub no_open: bool,

    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Fetch and enrich a single release by Discogs ID.
    Release(ReleaseArgs),
    /// Process the Discogs collection (resume-aware).
    Collection(CollectionArgs),
    /// Fetch and enrich a single artist by name.
    Artist(ArtistArgs),
    /// Batch-process artists by index range.
    ArtistBatch(ArtistBatchArgs),
    /// Test connectivity/auth for all configured services.
    Test,
    /// Write an example config file.
    Init(InitArgs),
    /// Show database and processing status.
    Status,
    /// Back up the database to a timestamped file.
    Backup(BackupArgs),
    /// Generate the album-matching report.
    Report(ReportArgs),
    /// Generate collection.json for the frontend.
    GenerateCollection(GenerateCollectionArgs),
    /// Generate album descriptions via Perplexity.
    EnrichDescription(EnrichDescriptionArgs),
    /// Backfill the videos behind tv.json: Discogs releases (default), Discogs masters
    /// (`--masters`) or TheAudioDB music videos (`--theaudiodb`).
    BackfillVideos(BackfillVideosArgs),
    /// Look up each release's Discogs master for its original release year (collection.json
    /// `year_original`). Resumable; regenerates collection.json when done.
    BackfillOriginalYears(BackfillOriginalYearsArgs),
    /// Store each release's Discogs pressing detail (vinyl colour lives in `formats[].text`) and
    /// write `format_details` / `vinyl_colours` into the album JSON and collection.json.
    /// Resumable; only releases without stored formats call Discogs.
    BackfillFormats(BackfillFormatsArgs),
    /// Re-fetch the Discogs tracklist of releases stored before headings and suites (Discogs
    /// index tracks, e.g. "2112") were told apart, so each suite's movements are kept.
    /// Resumable; only releases with an untyped position-less row call Discogs.
    BackfillTracklists(BackfillTracklistsArgs),
    /// Find each artist's Wikidata item, MusicBrainz ID and Wikipedia article from its Discogs
    /// ID, then fix TheAudioDB matches, Wikipedia links and biographies a name lookup got wrong.
    /// Resumable; artists with a stored identity aren't looked up again (unless `--force`).
    BackfillIdentities(BackfillIdentitiesArgs),
    /// Download each artist's TheAudioDB fanart (wide background photos) next to its hi-res
    /// photo as `{slug}-fanart01.jpg`, `-fanart02.jpg`, … from the URLs already stored; no API
    /// calls. Resumable; artists with every fanart file on disk are skipped (unless `--force`).
    BackfillFanart(BackfillFanartArgs),
    /// AI-upscale small artist photos, album covers and the fanart artist heroes use, through
    /// Upscayl's `upscayl-bin` (Real-ESRGAN, local). Originals are kept under
    /// `backups/upscale-originals/`; only images under their target are touched.
    Upscale(UpscaleArgs),
    /// Built-in database manager (search/list/delete/stats/backup).
    #[command(subcommand)]
    Db(DbCommand),
    /// Collection-vs-filesystem maintenance helpers.
    #[command(subcommand)]
    Maintenance(MaintenanceCommand),
}

#[derive(Debug, Args)]
pub struct ReleaseArgs {
    /// Discogs release ID. Omit it (with `--boxset <BOX_ID>`) to run boxset discovery:
    /// the box is processed, then each album in its tracklist is searched on Discogs
    /// for you to match interactively and link as a member.
    pub discogs_id: Option<String>,
    #[arg(short, long, value_enum, default_value = "table")]
    pub output: OutputFormat,
    #[arg(long)]
    pub save: bool,
    #[arg(long, value_delimiter = ',')]
    pub services: Vec<String>,
    /// Refetch everything from the source APIs (Discogs included) and persist it — implies
    /// --save, since a non-persisting refresh would change nothing.
    #[arg(short = 'f', long)]
    pub force_refresh: bool,
    #[arg(short, long)]
    pub interactive: bool,
    #[arg(long)]
    pub search: Option<String>,
    #[arg(long)]
    pub custom_cover: Option<String>,
    #[arg(long)]
    pub v1: bool,
    #[arg(long, value_enum)]
    pub prefer: Option<ImageSource>,
    #[arg(long)]
    pub perplexity: bool,
    #[arg(long)]
    pub perplexity_context: Option<String>,
    /// Link this release as a member of a boxset (the parent's Discogs ID). Members keep their
    /// own page and search presence but are excluded from stats and recently-added surfaces.
    /// With no positional release ID, runs interactive boxset discovery for this box instead.
    #[arg(long, value_name = "BOX_DISCOGS_ID")]
    pub boxset: Option<String>,
    /// Refresh a single field from its source and persist it, leaving every other field alone.
    /// Unlike --force-refresh this does not rebuild raw_data, so descriptions and service
    /// matches survive. Implies --save.
    #[arg(long, value_enum, value_name = "FIELD")]
    pub field: Option<RefreshField>,
    /// Set the vinyl colour by hand when Discogs doesn't say, written the way Discogs would
    /// ("Red Translucent, 180 Gram"; "Disc 1 White, Disc 2 Black"; `|` between several Vinyl
    /// entries). It survives re-scrapes. Pass "" to clear it. No network access.
    #[arg(long, value_name = "TEXT")]
    pub vinyl: Option<String>,
}

/// The subset of release fields that can be re-fetched from their source on their own.
/// Mirrors `ReleaseField::refreshable()`, exposed here so the TUI's per-field refresh is
/// also reachable headlessly.
#[derive(Debug, Clone, Copy, ValueEnum)]
pub enum RefreshField {
    /// Tracklist (including per-track artists for compilations), from Discogs.
    Tracks,
    /// Video URLs, from Discogs.
    Videos,
    /// Tracklist, videos and artwork sources together, from Discogs.
    Discogs,
    /// Apple Music match.
    Apple,
    /// Spotify match.
    Spotify,
    /// Last.fm match.
    Lastfm,
    /// Cover artwork.
    Images,
}

#[derive(Debug, Args)]
pub struct CollectionArgs {
    #[arg(short, long)]
    pub username: Option<String>,
    #[arg(short, long)]
    pub limit: Option<u32>,
    #[arg(long = "from")]
    pub from: Option<u32>,
    #[arg(long = "to")]
    pub to: Option<u32>,
    #[arg(short, long, default_value_t = 10)]
    pub batch_size: u32,
    #[arg(long)]
    pub resume: bool,
    #[arg(long)]
    pub dry_run: bool,
    #[arg(short = 'f', long)]
    pub force_refresh: bool,
    #[arg(short, long)]
    pub interactive: bool,
    #[arg(long, value_enum)]
    pub prefer: Option<ImageSource>,
}

#[derive(Debug, Args)]
pub struct ArtistArgs {
    pub name: String,
    #[arg(short, long)]
    pub save: bool,
    #[arg(short, long, value_enum, default_value = "table")]
    pub output: OutputFormat,
    #[arg(short = 'f', long)]
    pub force_refresh: bool,
    #[arg(short, long)]
    pub interactive: bool,
    #[arg(long)]
    pub custom_image: Option<String>,
    #[arg(long)]
    pub v1: bool,
    #[arg(long)]
    pub verify: bool,
    #[arg(long, value_enum)]
    pub prefer: Option<ImageSource>,
    #[arg(long)]
    pub theaudiodb: bool,
    #[arg(long)]
    pub perplexity: bool,
    #[arg(long)]
    pub perplexity_context: Option<String>,
    /// Which TheAudioDB fanart the desktop hero may use, without re-scraping the artist:
    /// `off`, the numbers to keep (`1,2`, when TheAudioDB files someone else's photo under
    /// them), or `auto` / blank for all of it. Files ruled out are deleted.
    #[arg(long)]
    pub fanart: Option<String>,
    /// The image the site's desktop hero shows: `auto`, `photo` (the artist photo), or a fanart
    /// (`fanart02`). Nothing on disk changes; re-measure with generate-artist-images.
    #[arg(long)]
    pub hero: Option<String>,
    /// A fanart the site uses as the artist photo (avatar, cards, phone hero) instead of the
    /// downloaded one: `fanart01`, or `auto` for the downloaded photo. Nothing on disk changes.
    #[arg(long)]
    pub photo: Option<String>,
}

#[derive(Debug, Args)]
pub struct ArtistBatchArgs {
    #[arg(long = "from", default_value_t = 0)]
    pub from: u32,
    #[arg(long = "to", default_value_t = 10)]
    pub to: u32,
    #[arg(short, long)]
    pub save: bool,
    #[arg(long)]
    pub verify: bool,
    #[arg(short, long)]
    pub interactive: bool,
    #[arg(long)]
    pub include_various: bool,
    #[arg(long)]
    pub stats: bool,
    #[arg(short = 'f', long)]
    pub force_refresh: bool,
    #[arg(long, value_enum)]
    pub prefer: Option<ImageSource>,
    #[arg(long)]
    pub theaudiodb: bool,
    #[arg(long)]
    pub perplexity: bool,
    #[arg(long)]
    pub perplexity_context: Option<String>,
}

#[derive(Debug, Args)]
pub struct InitArgs {
    #[arg(short, long, default_value = "config.example.json")]
    pub output: PathBuf,
}

#[derive(Debug, Args)]
pub struct BackupArgs {
    #[arg(short, long)]
    pub backup_path: Option<PathBuf>,
}

#[derive(Debug, Args)]
pub struct ReportArgs {
    #[arg(short, long)]
    pub output_file: Option<PathBuf>,
    #[arg(long, default_value = "text")]
    pub format: String,
    #[arg(short, long)]
    pub limit: Option<u32>,
    #[arg(short = 'f', long)]
    pub filter_config: Option<PathBuf>,
    #[arg(long, default_value_t = true)]
    pub include_unprocessed: bool,
}

#[derive(Debug, Args)]
pub struct GenerateCollectionArgs {
    #[arg(short, long)]
    pub output: Option<PathBuf>,
    #[arg(short, long)]
    pub data_path: Option<PathBuf>,
}

#[derive(Debug, Args)]
pub struct EnrichDescriptionArgs {
    pub identifier: Option<String>,
    #[arg(short, long)]
    pub artist: Option<String>,
    #[arg(short, long)]
    pub force: bool,
    #[arg(long)]
    pub dry_run: bool,
    #[arg(long)]
    pub list_missing: bool,
    #[arg(short, long, default_value_t = 10)]
    pub limit: u32,
    #[arg(long = "from")]
    pub from: Option<String>,
    #[arg(long, default_value_t = 50)]
    pub batch_size: u32,
    #[arg(long)]
    pub perplexity_context: Option<String>,
}

#[derive(Debug, Args)]
pub struct BackfillVideosArgs {
    /// Fetch each release's Discogs master videos (every edition's videos, not just this
    /// pressing's) instead of the release's own.
    #[arg(long, conflicts_with_all = ["theaudiodb", "wikidata", "from"])]
    pub masters: bool,
    /// Fetch each artist's official music videos from TheAudioDB instead.
    #[arg(long, conflicts_with_all = ["wikidata", "from"])]
    pub theaudiodb: bool,
    /// Fetch the YouTube videos Wikidata records on each artist's songs instead (artists need
    /// a Wikidata item from `backfill-identities`). `--batch-size` artists per query.
    #[arg(long, conflicts_with = "from")]
    pub wikidata: bool,
    /// Check videos against YouTube's embed page instead, so tv.json leaves out private,
    /// deleted and embed-blocked ones (new ids and those checked over 30 days ago; `--force`
    /// rechecks all).
    #[arg(long, conflicts_with_all = ["masters", "theaudiodb", "wikidata", "from"])]
    pub check: bool,
    #[arg(short, long, default_value_t = 25)]
    pub batch_size: u32,
    #[arg(short, long)]
    pub limit: Option<u32>,
    #[arg(long)]
    pub dry_run: bool,
    #[arg(long = "from")]
    pub from: Option<String>,
    #[arg(short = 'f', long)]
    pub force: bool,
    #[arg(short, long)]
    pub pause: Option<u64>,
}

#[derive(Debug, Args)]
pub struct BackfillOriginalYearsArgs {
    /// Only process this many releases (newest additions first).
    #[arg(short, long)]
    pub limit: Option<u32>,
    /// List what would be looked up without calling Discogs.
    #[arg(long)]
    pub dry_run: bool,
    /// Look up every release again, including ones already done.
    #[arg(short = 'f', long)]
    pub force: bool,
}

#[derive(Debug, Args)]
pub struct BackfillIdentitiesArgs {
    /// Only resolve this many artists (by name); artists already resolved are still checked.
    #[arg(short, long)]
    pub limit: Option<u32>,
    /// Only this artist (exact name, any case).
    #[arg(short, long)]
    pub artist: Option<String>,
    /// Resolve and report what would change, without writing anything.
    #[arg(long)]
    pub dry_run: bool,
    /// Resolve every artist again, including ones with a stored identity.
    #[arg(short = 'f', long)]
    pub force: bool,
}

#[derive(Debug, Args)]
pub struct BackfillFanartArgs {
    /// Only download for this many artists (by name).
    #[arg(short, long)]
    pub limit: Option<u32>,
    /// Only this artist (exact name, any case).
    #[arg(short, long)]
    pub artist: Option<String>,
    /// Report what would be downloaded without downloading anything.
    #[arg(long)]
    pub dry_run: bool,
    /// Download every artist's fanart again, including files already on disk.
    #[arg(short = 'f', long)]
    pub force: bool,
    /// Downloads in flight at once.
    #[arg(long, default_value_t = 6)]
    pub concurrency: usize,
}

#[derive(Debug, Args)]
pub struct UpscaleArgs {
    /// Artist photos under 1000px on the short side (to 2000px). With none of --artists,
    /// --fanart, --albums, all three.
    #[arg(long)]
    pub artists: bool,
    /// The fanart each artist hero uses (to 2560×1440).
    #[arg(long)]
    pub fanart: bool,
    /// Every fanart file, not just the ones heroes use (implies --fanart).
    #[arg(long)]
    pub all_fanart: bool,
    /// Album covers under 1000px on the short side (to 2000px).
    #[arg(long)]
    pub albums: bool,
    /// Only these artist or album folders (comma-separated slugs).
    #[arg(long)]
    pub only: Option<String>,
    /// Only upscale this many images.
    #[arg(short, long)]
    pub limit: Option<u32>,
    /// List what would be upscaled, without upscaling.
    #[arg(long)]
    pub dry_run: bool,
    /// Put these images (paths under public/, comma-separated) back to their kept originals.
    #[arg(long)]
    pub restore: Option<String>,
}

#[derive(Debug, Args)]
pub struct BackfillFormatsArgs {
    /// Only fetch this many releases from Discogs (newest additions first); the album JSON of
    /// every release that already has stored formats is still synced.
    #[arg(short, long)]
    pub limit: Option<u32>,
    /// Report what would be fetched and patched without calling Discogs or writing anything.
    #[arg(long)]
    pub dry_run: bool,
    /// Fetch every release again, including ones that already have stored formats.
    #[arg(short = 'f', long)]
    pub force: bool,
}

#[derive(Debug, Args)]
pub struct BackfillTracklistsArgs {
    /// Only fetch this many releases from Discogs (newest additions first).
    #[arg(short, long)]
    pub limit: Option<u32>,
    /// Report what would be fetched without calling Discogs or writing anything.
    #[arg(long)]
    pub dry_run: bool,
    /// Fetch every release again, including ones whose tracklist is already typed.
    #[arg(short = 'f', long)]
    pub force: bool,
}

#[derive(Debug, Subcommand)]
pub enum DbCommand {
    /// Search releases or artists.
    Search {
        #[arg(value_parser = ["release", "artist"])]
        kind: String,
        query: String,
        #[arg(short, long, default_value_t = 20)]
        limit: u32,
    },
    /// List releases or artists.
    List {
        #[arg(value_parser = ["releases", "artists"])]
        kind: String,
        #[arg(short, long, default_value_t = 20)]
        limit: u32,
        #[arg(short, long, default_value = "date_added")]
        sort: String,
    },
    /// Delete a release or artist (auto-backs up first).
    Delete {
        #[arg(value_parser = ["release", "artist"])]
        kind: String,
        identifier: String,
        #[arg(long)]
        force: bool,
    },
    /// Show database statistics.
    Stats,
    /// Create a manual backup.
    Backup {
        #[arg(long)]
        name: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum MaintenanceCommand {
    /// List database artists with no matching public/artist folder.
    FindMissing {
        #[arg(short, long)]
        limit: Option<u32>,
        #[arg(long)]
        show_orphaned: bool,
    },
    /// Match orphaned folders to database artists by slug similarity.
    Reconcile {
        #[arg(long, default_value_t = 0.8)]
        threshold: f64,
    },
    /// Flag band line-ups ("X Trio" followed by X and the players) as member credits.
    BandMembers {
        /// Report matching releases without saving anything.
        #[arg(long)]
        dry_run: bool,
    },
}

impl Cli {
    /// Load config from the global `--config` flag.
    pub fn load_config(&self) -> anyhow::Result<Config> {
        Config::load(self.config.as_deref())
    }

    /// True when this invocation launches the interactive TUI (so stderr logging must be
    /// suppressed to avoid corrupting the alternate screen).
    pub fn launches_tui(&self) -> bool {
        match &self.command {
            None => self.tui,
            Some(Command::Collection(a)) => a.interactive,
            _ => false,
        }
    }
}

/// Execute a CLI command. Returns once complete.
pub async fn run(cli: Cli, cfg: Config) -> anyhow::Result<()> {
    let command = cli.command.expect("dispatch only called with a subcommand");
    match command {
        Command::Status => cmd_status(&cfg),
        Command::Backup(a) => cmd_backup(&cfg, a),
        Command::Init(a) => cmd_init(a),
        Command::Db(c) => cmd_db(&cfg, c),
        Command::Maintenance(c) => ops::maintenance::run(&cfg, c),
        Command::Test => ops::services::test_all(&cfg).await,
        Command::Release(a) => ops::release::run(&cfg, a).await,
        Command::Collection(a) => {
            // `--interactive` drops into the TUI (modal match-pickers + live feedback),
            // processing the first N of the collection (newest first).
            if a.interactive {
                let count = a
                    .limit
                    .or_else(|| a.to.map(|t| t.saturating_sub(a.from.unwrap_or(0))))
                    .unwrap_or(1) as usize;
                crate::tui::run(cfg, crate::tui::Launch::Collection { count }).await
            } else {
                ops::collection::run(&cfg, a).await
            }
        }
        Command::Artist(a) => ops::artist::run(&cfg, a).await,
        Command::ArtistBatch(a) => ops::artist::run_batch(&cfg, a).await,
        Command::Report(a) => ops::report::run(&cfg, a).await,
        Command::GenerateCollection(a) => ops::generate::run(&cfg, a).await,
        Command::EnrichDescription(a) => ops::descriptions::run(&cfg, a).await,
        Command::BackfillVideos(a) => ops::videos::run(&cfg, a).await,
        Command::BackfillOriginalYears(a) => ops::original_years::run(&cfg, a).await,
        Command::BackfillFormats(a) => ops::formats::run(&cfg, a).await,
        Command::BackfillTracklists(a) => ops::tracklists::run(&cfg, a).await,
        Command::BackfillIdentities(a) => ops::identity::run(&cfg, a).await,
        Command::BackfillFanart(a) => ops::fanart::run(&cfg, a).await,
        Command::Upscale(a) => ops::upscale::run(&cfg, a).await,
    }
}

fn cmd_status(cfg: &Config) -> anyhow::Result<()> {
    let db = Db::open(cfg.db_path())?;
    let s = db.stats()?;
    let pct = if s.total_collection_items > 0 {
        100.0 * s.processed_items as f64 / s.total_collection_items as f64
    } else {
        0.0
    };
    crate::say!("Database: {}", db.path().display());
    crate::say!("  releases:          {}", s.total_releases);
    crate::say!("  artists:           {}", s.total_artists);
    crate::say!("  collection items:  {}", s.total_collection_items);
    crate::say!("  processed:         {} ({pct:.1}%)", s.processed_items);
    crate::say!("  enriched:          {}", s.enriched_items);
    Ok(())
}

fn cmd_backup(cfg: &Config, args: BackupArgs) -> anyhow::Result<()> {
    let db = Db::open(cfg.db_path())?;
    let dest = args.backup_path.unwrap_or_else(|| {
        let backups = cfg.base_dir.join("backups");
        let _ = std::fs::create_dir_all(&backups);
        backups.join(format!("collection_cache_{}.db", crate::util::timestamp()))
    });
    db.backup_database(&dest)?;
    crate::say!("Database backed up to {}", dest.display());
    Ok(())
}

fn cmd_init(args: InitArgs) -> anyhow::Result<()> {
    let example = include_str!("../../config.example.json");
    std::fs::write(&args.output, example)?;
    crate::say!("Wrote example config to {}", args.output.display());
    Ok(())
}

fn cmd_db(cfg: &Config, c: DbCommand) -> anyhow::Result<()> {
    let db = Db::open(cfg.db_path())?;
    match c {
        DbCommand::Stats => cmd_status(cfg),
        DbCommand::Search { kind, query, limit } => {
            if kind == "release" {
                for r in db.search_releases(&query, limit)? {
                    crate::say!(
                        "  [{}] {} — {} ({})",
                        r.discogs_id.as_deref().unwrap_or("?"),
                        r.artist_names.join(", "),
                        r.title,
                        r.year.unwrap_or(0)
                    );
                }
            } else {
                for a in db.search_artists(&query, limit)? {
                    crate::say!("  [{}] {}", a.discogs_id.as_deref().unwrap_or("?"), a.name);
                }
            }
            Ok(())
        }
        DbCommand::List { kind, limit, sort } => {
            if kind == "releases" {
                for r in db.list_releases(limit, &sort)? {
                    crate::say!(
                        "  [{}] {} — {} ({})",
                        r.discogs_id.as_deref().unwrap_or("?"),
                        r.artist_names.join(", "),
                        r.title,
                        r.year.unwrap_or(0)
                    );
                }
            } else {
                for a in db.list_artists(limit, &sort)? {
                    crate::say!("  [{}] {}", a.discogs_id.as_deref().unwrap_or("?"), a.name);
                }
            }
            Ok(())
        }
        DbCommand::Delete { kind, identifier, force } => {
            if !force {
                crate::say!("Refusing to delete {kind} '{identifier}' without --force (would auto-backup first).");
                return Ok(());
            }
            let backups = cfg.base_dir.join("backups");
            std::fs::create_dir_all(&backups)?;
            let backup = backups.join(format!("backup_before_delete_{}.db", crate::util::timestamp()));
            db.backup_database(&backup)?;
            crate::say!("Backed up to {} before delete.", backup.display());
            let removed = if kind == "release" {
                db.delete_release(&identifier)?
            } else {
                db.delete_artist(&identifier)?
            };
            crate::say!("{}", if removed { "Deleted." } else { "No matching row found." });
            Ok(())
        }
        DbCommand::Backup { name } => {
            let backups = cfg.base_dir.join("backups");
            std::fs::create_dir_all(&backups)?;
            let dest = backups.join(
                name.unwrap_or_else(|| format!("collection_cache_{}.db", crate::util::timestamp())),
            );
            db.backup_database(&dest)?;
            crate::say!("Backup written to {}", dest.display());
            Ok(())
        }
    }
}

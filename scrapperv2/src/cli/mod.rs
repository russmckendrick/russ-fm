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
    about = "Music collection enrichment — TUI by default, CLI subcommands for automation",
    version
)]
pub struct Cli {
    /// Path to config.json (defaults to ./config.json).
    #[arg(short, long, global = true)]
    pub config: Option<PathBuf>,

    /// Log level: DEBUG, INFO, WARNING, ERROR.
    #[arg(long, global = true, default_value = "INFO")]
    pub log_level: String,

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
    /// Backfill release videos from Discogs.
    BackfillVideos(BackfillVideosArgs),
    /// Built-in database manager (search/list/delete/stats/backup).
    #[command(subcommand)]
    Db(DbCommand),
    /// Collection-vs-filesystem maintenance helpers.
    #[command(subcommand)]
    Maintenance(MaintenanceCommand),
}

#[derive(Debug, Args)]
pub struct ReleaseArgs {
    pub discogs_id: String,
    #[arg(short, long, value_enum, default_value = "table")]
    pub output: OutputFormat,
    #[arg(long)]
    pub save: bool,
    #[arg(long, value_delimiter = ',')]
    pub services: Vec<String>,
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
}

impl Cli {
    /// Load config from the global `--config` flag.
    pub fn load_config(&self) -> anyhow::Result<Config> {
        Config::load(self.config.as_deref())
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
        Command::Collection(a) => ops::collection::run(&cfg, a).await,
        Command::Artist(a) => ops::artist::run(&cfg, a).await,
        Command::ArtistBatch(a) => ops::artist::run_batch(&cfg, a).await,
        Command::Report(a) => ops::report::run(&cfg, a).await,
        Command::GenerateCollection(a) => ops::generate::run(&cfg, a).await,
        Command::EnrichDescription(a) => ops::descriptions::run(&cfg, a).await,
        Command::BackfillVideos(a) => ops::videos::run(&cfg, a).await,
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
    println!("Database: {}", db.path().display());
    println!("  releases:          {}", s.total_releases);
    println!("  artists:           {}", s.total_artists);
    println!("  collection items:  {}", s.total_collection_items);
    println!("  processed:         {} ({pct:.1}%)", s.processed_items);
    println!("  enriched:          {}", s.enriched_items);
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
    println!("Database backed up to {}", dest.display());
    Ok(())
}

fn cmd_init(args: InitArgs) -> anyhow::Result<()> {
    let example = include_str!("../../config.example.json");
    std::fs::write(&args.output, example)?;
    println!("Wrote example config to {}", args.output.display());
    Ok(())
}

fn cmd_db(cfg: &Config, c: DbCommand) -> anyhow::Result<()> {
    let db = Db::open(cfg.db_path())?;
    match c {
        DbCommand::Stats => cmd_status(cfg),
        DbCommand::Search { kind, query, limit } => {
            if kind == "release" {
                for r in db.search_releases(&query, limit)? {
                    println!(
                        "  [{}] {} — {} ({})",
                        r.discogs_id.as_deref().unwrap_or("?"),
                        r.artist_names.join(", "),
                        r.title,
                        r.year.unwrap_or(0)
                    );
                }
            } else {
                for a in db.search_artists(&query, limit)? {
                    println!("  [{}] {}", a.discogs_id.as_deref().unwrap_or("?"), a.name);
                }
            }
            Ok(())
        }
        DbCommand::List { kind, limit, sort } => {
            if kind == "releases" {
                for r in db.list_releases(limit, &sort)? {
                    println!(
                        "  [{}] {} — {} ({})",
                        r.discogs_id.as_deref().unwrap_or("?"),
                        r.artist_names.join(", "),
                        r.title,
                        r.year.unwrap_or(0)
                    );
                }
            } else {
                for a in db.list_artists(limit, &sort)? {
                    println!("  [{}] {}", a.discogs_id.as_deref().unwrap_or("?"), a.name);
                }
            }
            Ok(())
        }
        DbCommand::Delete { kind, identifier, force } => {
            if !force {
                println!("Refusing to delete {kind} '{identifier}' without --force (would auto-backup first).");
                return Ok(());
            }
            let backups = cfg.base_dir.join("backups");
            std::fs::create_dir_all(&backups)?;
            let backup = backups.join(format!("backup_before_delete_{}.db", crate::util::timestamp()));
            db.backup_database(&backup)?;
            println!("Backed up to {} before delete.", backup.display());
            let removed = if kind == "release" {
                db.delete_release(&identifier)?
            } else {
                db.delete_artist(&identifier)?
            };
            println!("{}", if removed { "Deleted." } else { "No matching row found." });
            Ok(())
        }
        DbCommand::Backup { name } => {
            let backups = cfg.base_dir.join("backups");
            std::fs::create_dir_all(&backups)?;
            let dest = backups.join(
                name.unwrap_or_else(|| format!("collection_cache_{}.db", crate::util::timestamp())),
            );
            db.backup_database(&dest)?;
            println!("Backup written to {}", dest.display());
            Ok(())
        }
    }
}

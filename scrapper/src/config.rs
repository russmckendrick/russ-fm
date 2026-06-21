//! Configuration loading: `config.json` + environment-variable overrides + secrets resolution.
//!
//! Mirrors the schema used by the Python scrapper so the same `config.json` works unchanged.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Top-level configuration, deserialized from `config.json`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    #[serde(default)]
    pub discogs: DiscogsConfig,
    #[serde(default)]
    pub apple_music: AppleMusicConfig,
    #[serde(default)]
    pub spotify: SpotifyConfig,
    #[serde(default)]
    pub lastfm: LastfmConfig,
    #[serde(default)]
    pub wikipedia: WikipediaConfig,
    #[serde(rename = "TheAudioDB", default)]
    pub theaudiodb: TheAudioDbConfig,
    #[serde(default)]
    pub perplexity: PerplexityConfig,
    #[serde(default)]
    pub database: DatabaseConfig,
    #[serde(default)]
    pub data: PathConfig,
    #[serde(default)]
    pub releases: PathConfig,
    #[serde(default)]
    pub artists: PathConfig,
    #[serde(default)]
    pub image_sizes: ImageSizes,
    #[serde(default)]
    pub logging: LoggingConfig,
    #[serde(default)]
    pub processing: ProcessingConfig,

    /// Absolute path to the directory the config was loaded from (used to resolve relative paths).
    #[serde(skip)]
    pub base_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DiscogsConfig {
    #[serde(default)]
    pub access_token: String,
    #[serde(default)]
    pub username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppleMusicConfig {
    #[serde(default)]
    pub key_id: String,
    #[serde(default)]
    pub team_id: String,
    #[serde(default)]
    pub private_key_path: String,
    #[serde(default = "default_storefront")]
    pub storefront: String,
}

fn default_storefront() -> String {
    "us".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SpotifyConfig {
    #[serde(default)]
    pub client_id: String,
    #[serde(default)]
    pub client_secret: String,
    #[serde(default = "default_market")]
    pub market: String,
}

fn default_market() -> String {
    "US".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LastfmConfig {
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub shared_secret: String,
    #[serde(default)]
    pub username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WikipediaConfig {
    #[serde(default = "default_wiki_lang")]
    pub language: String,
    #[serde(default = "default_user_agent")]
    pub user_agent: String,
}

impl Default for WikipediaConfig {
    fn default() -> Self {
        Self {
            language: default_wiki_lang(),
            user_agent: default_user_agent(),
        }
    }
}

fn default_wiki_lang() -> String {
    "en".to_string()
}
fn default_user_agent() -> String {
    "MusicCollectionManager/1.0".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TheAudioDbConfig {
    #[serde(default = "default_audiodb_token")]
    pub api_token: String,
    #[serde(default = "default_audiodb_url")]
    pub base_url: String,
}

impl Default for TheAudioDbConfig {
    fn default() -> Self {
        Self {
            api_token: default_audiodb_token(),
            base_url: default_audiodb_url(),
        }
    }
}

fn default_audiodb_token() -> String {
    "2".to_string()
}
fn default_audiodb_url() -> String {
    "https://theaudiodb.com/api/v1/json/".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerplexityConfig {
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_perplexity_model")]
    pub model: String,
    #[serde(default = "default_perplexity_rate")]
    pub rate_limit: u32,
}

impl Default for PerplexityConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            model: default_perplexity_model(),
            rate_limit: default_perplexity_rate(),
        }
    }
}

fn default_perplexity_model() -> String {
    "sonar".to_string()
}
fn default_perplexity_rate() -> u32 {
    20
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    #[serde(default = "default_db_path")]
    pub path: String,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            path: default_db_path(),
        }
    }
}

fn default_db_path() -> String {
    "collection_cache.db".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PathConfig {
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageSizes {
    #[serde(rename = "hi-res", default = "default_hires")]
    pub hi_res: String,
    #[serde(default)]
    pub medium: Option<String>,
    #[serde(default)]
    pub small: Option<String>,
    #[serde(default)]
    pub avatar: Option<String>,
}

impl Default for ImageSizes {
    fn default() -> Self {
        Self {
            hi_res: default_hires(),
            medium: Some("700x700".to_string()),
            small: Some("300x300".to_string()),
            avatar: Some("128x128".to_string()),
        }
    }
}

fn default_hires() -> String {
    "2000x2000".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    #[serde(default = "default_log_level")]
    pub level: String,
    #[serde(default = "default_log_file")]
    pub file: String,
    #[serde(default)]
    pub format: Option<String>,
}

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            level: default_log_level(),
            file: default_log_file(),
            format: None,
        }
    }
}

fn default_log_level() -> String {
    "INFO".to_string()
}
fn default_log_file() -> String {
    "logs/scrapper.log".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessingConfig {
    #[serde(default = "default_batch_size")]
    pub batch_size: u32,
    #[serde(default = "default_retry_attempts")]
    pub retry_attempts: u32,
    #[serde(default = "default_retry_delay")]
    pub retry_delay: u64,
    #[serde(default = "default_concurrent")]
    pub concurrent_requests: u32,
    /// How many candidate matches to fetch per service when searching (Apple/Spotify).
    #[serde(default = "default_search_limit")]
    pub search_limit: u32,
}

impl Default for ProcessingConfig {
    fn default() -> Self {
        Self {
            batch_size: default_batch_size(),
            retry_attempts: default_retry_attempts(),
            retry_delay: default_retry_delay(),
            concurrent_requests: default_concurrent(),
            search_limit: default_search_limit(),
        }
    }
}

fn default_search_limit() -> u32 {
    50
}

fn default_batch_size() -> u32 {
    10
}
fn default_retry_attempts() -> u32 {
    3
}
fn default_retry_delay() -> u64 {
    5
}
fn default_concurrent() -> u32 {
    1
}

impl Config {
    /// Load config from an explicit path, or auto-discover it (see [`discover_config_path`]).
    pub fn load(explicit: Option<&Path>) -> anyhow::Result<Self> {
        let path = match explicit {
            Some(p) => p.to_path_buf(),
            None => discover_config_path()?,
        };
        let text = std::fs::read_to_string(&path)
            .map_err(|e| anyhow::anyhow!("failed to read config {}: {e}", path.display()))?;
        let mut cfg: Config = serde_json::from_str(&text)
            .map_err(|e| anyhow::anyhow!("failed to parse config {}: {e}", path.display()))?;
        cfg.base_dir = path
            .parent()
            .map(|p| p.to_path_buf())
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or_else(|| PathBuf::from("."));
        cfg.apply_env_overrides();
        Ok(cfg)
    }

    /// Apply environment-variable overrides, matching the Python config_manager behaviour.
    fn apply_env_overrides(&mut self) {
        use std::env::var;
        if let Ok(v) = var("DISCOGS_ACCESS_TOKEN") {
            self.discogs.access_token = v;
        }
        if let Ok(v) = var("DISCOGS_USERNAME") {
            self.discogs.username = v;
        }
        if let Ok(v) = var("APPLE_MUSIC_KEY_ID") {
            self.apple_music.key_id = v;
        }
        if let Ok(v) = var("APPLE_MUSIC_TEAM_ID") {
            self.apple_music.team_id = v;
        }
        if let Ok(v) = var("APPLE_MUSIC_PRIVATE_KEY_PATH") {
            self.apple_music.private_key_path = v;
        }
        if let Ok(v) = var("SPOTIFY_CLIENT_ID") {
            self.spotify.client_id = v;
        }
        if let Ok(v) = var("SPOTIFY_CLIENT_SECRET") {
            self.spotify.client_secret = v;
        }
        if let Ok(v) = var("LASTFM_API_KEY") {
            self.lastfm.api_key = v;
        }
        if let Ok(v) = var("LASTFM_SHARED_SECRET") {
            self.lastfm.shared_secret = v;
        }
        if let Ok(v) = var("PERPLEXITY_API_KEY") {
            self.perplexity.api_key = v;
        }
        if let Ok(v) = var("DATABASE_PATH") {
            self.database.path = v;
        }
        if let Ok(v) = var("LOG_LEVEL") {
            self.logging.level = v;
        }
        if let Ok(v) = var("LOG_FILE") {
            self.logging.file = v;
        }
        if let Ok(v) = var("DATA_PATH") {
            self.data.path = v;
        }
    }

    /// Resolve a config-relative path against the config's base directory.
    pub fn resolve(&self, p: &str) -> PathBuf {
        let pb = PathBuf::from(p);
        if pb.is_absolute() {
            pb
        } else {
            self.base_dir.join(pb)
        }
    }

    /// Absolute path to the SQLite database.
    pub fn db_path(&self) -> PathBuf {
        self.resolve(&self.database.path)
    }

    /// Absolute path to the output data directory (e.g. `../public`).
    pub fn data_dir(&self) -> PathBuf {
        self.resolve(&self.data.path)
    }

    /// Absolute path to the album-releases output directory (e.g. `../public/album`).
    pub fn releases_dir(&self) -> PathBuf {
        self.data_dir().join(&self.releases.path)
    }

    /// Absolute path to the artists output directory (e.g. `../public/artist`).
    pub fn artists_dir(&self) -> PathBuf {
        self.data_dir().join(&self.artists.path)
    }

    /// Absolute path to the Apple Music private key.
    pub fn apple_private_key_path(&self) -> PathBuf {
        self.resolve(&self.apple_music.private_key_path)
    }

    /// Absolute path to the Discogs file cache directory.
    pub fn discogs_cache_dir(&self) -> PathBuf {
        self.base_dir.join("discogs_cache")
    }
}

/// Locate `config.json` when no `--config` is given. Prefers a local `./config.json` (in-folder
/// dev), otherwise reads the central pointer at `~/.config/scrapper/config.json` (a
/// `{ "root": "<folder>" }` object) and resolves `<root>/config.json` — so the installed binary
/// works from any directory.
fn discover_config_path() -> anyhow::Result<PathBuf> {
    let local = PathBuf::from("config.json");
    if local.exists() {
        return Ok(local);
    }

    if let Some(central) = central_config_path() {
        if central.exists() {
            let text = std::fs::read_to_string(&central)
                .map_err(|e| anyhow::anyhow!("reading central config {}: {e}", central.display()))?;
            let pointer: serde_json::Value = serde_json::from_str(&text)
                .map_err(|e| anyhow::anyhow!("parsing central config {}: {e}", central.display()))?;
            let root = pointer
                .get("root")
                .and_then(|r| r.as_str())
                .ok_or_else(|| anyhow::anyhow!("{} must contain a \"root\" string", central.display()))?;
            let cfg_path = PathBuf::from(root).join("config.json");
            if !cfg_path.exists() {
                anyhow::bail!("central config root \"{root}\" has no config.json ({})", cfg_path.display());
            }
            return Ok(cfg_path);
        }
    }

    let hint = central_config_path().map(|p| p.display().to_string()).unwrap_or_else(|| "~/.config/scrapper/config.json".into());
    anyhow::bail!(
        "no config.json in the current directory and no central config at {hint}. \
         Run ./install.sh in the scrapper folder, or pass --config <path>."
    )
}

/// Path to the central config pointer, honouring `XDG_CONFIG_HOME` then `$HOME/.config`.
fn central_config_path() -> Option<PathBuf> {
    if let Some(xdg) = std::env::var_os("XDG_CONFIG_HOME").filter(|v| !v.is_empty()) {
        return Some(PathBuf::from(xdg).join("scrapper/config.json"));
    }
    std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config/scrapper/config.json"))
}

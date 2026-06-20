//! API service clients and the [`Services`] aggregate used by the orchestrator and CLI.

pub mod http;

pub mod apple_music;
pub mod discogs;
pub mod lastfm;
pub mod perplexity;
pub mod spotify;
pub mod theaudiodb;
pub mod wikipedia;

pub use apple_music::AppleMusicService;
pub use discogs::DiscogsService;
pub use lastfm::LastfmService;
pub use perplexity::PerplexityService;
pub use spotify::SpotifyService;
pub use theaudiodb::TheAudioDbService;
pub use wikipedia::WikipediaService;

use crate::config::Config;

/// Outcome of a single service health probe.
pub enum Probe {
    Ok(String),
    Skipped(String),
    Failed(String),
}

/// All service clients, constructed from config.
#[derive(Clone)]
pub struct Services {
    pub discogs: DiscogsService,
    pub apple_music: AppleMusicService,
    pub spotify: SpotifyService,
    pub lastfm: LastfmService,
    pub wikipedia: WikipediaService,
    pub theaudiodb: TheAudioDbService,
    pub perplexity: PerplexityService,
}

impl Services {
    pub fn new(cfg: &Config) -> Self {
        Self {
            discogs: DiscogsService::new(cfg),
            apple_music: AppleMusicService::new(cfg),
            spotify: SpotifyService::new(cfg),
            lastfm: LastfmService::new(cfg),
            wikipedia: WikipediaService::new(cfg),
            theaudiodb: TheAudioDbService::new(cfg),
            perplexity: PerplexityService::new(cfg),
        }
    }

    /// Probe every service concurrently. Unconfigured services are skipped, not failed.
    pub async fn test_all(&self) -> Vec<(&'static str, Probe)> {
        let (discogs, apple, spotify, lastfm, wiki, adb, plx) = tokio::join!(
            probe("discogs", self.discogs.is_configured(), self.discogs.health_check()),
            probe("apple_music", self.apple_music.is_configured(), self.apple_music.health_check()),
            probe("spotify", self.spotify.is_configured(), self.spotify.health_check()),
            probe("lastfm", self.lastfm.is_configured(), self.lastfm.health_check()),
            probe("wikipedia", self.wikipedia.is_configured(), self.wikipedia.health_check()),
            probe("theaudiodb", self.theaudiodb.is_configured(), self.theaudiodb.health_check()),
            probe("perplexity", self.perplexity.is_configured(), self.perplexity.health_check()),
        );
        vec![discogs, apple, spotify, lastfm, wiki, adb, plx]
    }
}

async fn probe<F>(name: &'static str, configured: bool, fut: F) -> (&'static str, Probe)
where
    F: std::future::Future<Output = http::ServiceResult<String>>,
{
    if !configured {
        return (name, Probe::Skipped("not configured".into()));
    }
    match fut.await {
        Ok(detail) => (name, Probe::Ok(detail)),
        Err(e) => (name, Probe::Failed(e.to_string())),
    }
}

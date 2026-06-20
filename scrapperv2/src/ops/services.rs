//! `test` command. Currently validates that credentials are present/parseable for each service
//! (config-presence checks, no network). Live connectivity probes land with the services layer.

use anyhow::Result;

use crate::Config;

fn status(present: bool) -> &'static str {
    if present {
        "✓ configured"
    } else {
        "✗ missing credentials"
    }
}

pub async fn test_all(cfg: &Config) -> Result<()> {
    println!("Service configuration check:\n");

    let discogs = !cfg.discogs.access_token.is_empty();
    println!("  discogs      {}", status(discogs));

    let apple = !cfg.apple_music.key_id.is_empty()
        && !cfg.apple_music.team_id.is_empty()
        && cfg.apple_private_key_path().exists();
    println!("  apple_music  {}", status(apple));
    if !cfg.apple_music.key_id.is_empty() && !cfg.apple_private_key_path().exists() {
        println!("               (private key not found at {})", cfg.apple_private_key_path().display());
    }

    let spotify = !cfg.spotify.client_id.is_empty() && !cfg.spotify.client_secret.is_empty();
    println!("  spotify      {}", status(spotify));

    let lastfm = !cfg.lastfm.api_key.is_empty();
    println!("  lastfm       {}", status(lastfm));

    println!("  wikipedia    ✓ no credentials required");
    println!("  theaudiodb   {}", status(!cfg.theaudiodb.api_token.is_empty()));

    let perplexity = !cfg.perplexity.api_key.is_empty();
    println!("  perplexity   {}", status(perplexity));

    println!("\nNote: live connectivity probes arrive with the services layer.");
    Ok(())
}

//! Parse service identities from user input — a bare ID, a pasted share URL, or a service URI.
//! Pure string functions so every accepted form is unit-testable without the network.

/// Strip an URL's query string and fragment.
fn strip_query(s: &str) -> &str {
    let end = s.find(['?', '#']).unwrap_or(s.len());
    &s[..end]
}

/// The path segments of an URL-ish input, ignoring scheme/host when a known host matches.
fn path_segments<'a>(input: &'a str, hosts: &[&str]) -> Option<Vec<&'a str>> {
    let s = strip_query(input.trim().trim_end_matches('/'));
    let rest = s.strip_prefix("https://").or_else(|| s.strip_prefix("http://")).unwrap_or(s);
    let (host, path) = rest.split_once('/')?;
    let host = host.strip_prefix("www.").unwrap_or(host);
    if !hosts.iter().any(|h| host.eq_ignore_ascii_case(h)) {
        return None;
    }
    Some(path.split('/').filter(|p| !p.is_empty()).collect())
}

/// Percent-decode, with `+` treated as a space (the Last.fm URL convention).
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hex = &s[i + 1..i + 3];
                if let Ok(b) = u8::from_str_radix(hex, 16) {
                    out.push(b);
                    i += 3;
                } else {
                    out.push(b'%');
                    i += 1;
                }
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn all_digits(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
}

fn is_spotify_id(s: &str) -> bool {
    s.len() == 22 && s.bytes().all(|b| b.is_ascii_alphanumeric())
}

/// Apple Music album: bare numeric id or `music.apple.com/{sf}/album/{slug}/{id}` (an `?i=` track
/// query on the URL is ignored — the album id is the path segment).
pub fn apple_album_id(input: &str) -> Option<String> {
    apple_id(input, "album")
}

/// Apple Music artist: bare numeric id or `music.apple.com/{sf}/artist/{slug}/{id}`.
pub fn apple_artist_id(input: &str) -> Option<String> {
    apple_id(input, "artist")
}

fn apple_id(input: &str, kind: &str) -> Option<String> {
    let t = input.trim();
    if all_digits(t) {
        return Some(t.to_string());
    }
    let segs = path_segments(t, &["music.apple.com", "itunes.apple.com", "geo.music.apple.com"])?;
    let kind_pos = segs.iter().position(|s| s.eq_ignore_ascii_case(kind))?;
    // The id is the last all-digit segment after the kind (usually slug/id, sometimes just id).
    segs[kind_pos + 1..]
        .iter()
        .rev()
        .find(|s| all_digits(s.strip_prefix("id").unwrap_or(s)))
        .map(|s| s.strip_prefix("id").unwrap_or(s).to_string())
}

/// Spotify album: bare 22-char id, `open.spotify.com/album/{id}` or `spotify:album:{id}`.
pub fn spotify_album_id(input: &str) -> Option<String> {
    spotify_id(input, "album")
}

/// Spotify artist: bare 22-char id, `open.spotify.com/artist/{id}` or `spotify:artist:{id}`.
pub fn spotify_artist_id(input: &str) -> Option<String> {
    spotify_id(input, "artist")
}

fn spotify_id(input: &str, kind: &str) -> Option<String> {
    let t = strip_query(input.trim());
    if is_spotify_id(t) {
        return Some(t.to_string());
    }
    if let Some(rest) = t.strip_prefix("spotify:") {
        let (k, id) = rest.split_once(':')?;
        return (k.eq_ignore_ascii_case(kind) && is_spotify_id(id)).then(|| id.to_string());
    }
    let segs = path_segments(t, &["open.spotify.com", "play.spotify.com"])?;
    // Locale-prefixed paths (`/intl-de/album/...`) put the kind one segment in.
    let kind_pos = segs.iter().position(|s| s.eq_ignore_ascii_case(kind))?;
    segs.get(kind_pos + 1).filter(|s| is_spotify_id(s)).map(|s| s.to_string())
}

/// Last.fm album URL → (artist, album): `last.fm/music/{artist}/{album}`, percent-decoded.
pub fn lastfm_album_parts(input: &str) -> Option<(String, String)> {
    let segs = path_segments(input, &["last.fm", "lastfm.de", "lastfm.fr"])?;
    let music_pos = segs.iter().position(|s| s.eq_ignore_ascii_case("music"))?;
    match segs[music_pos + 1..] {
        [artist, album, ..] => Some((percent_decode(artist), percent_decode(album))),
        _ => None,
    }
}

/// Last.fm artist: `last.fm/music/{artist}` URL (percent-decoded) or a bare artist name.
pub fn lastfm_artist_name(input: &str) -> Option<String> {
    let t = input.trim();
    if let Some(segs) = path_segments(t, &["last.fm", "lastfm.de", "lastfm.fr"]) {
        let music_pos = segs.iter().position(|s| s.eq_ignore_ascii_case("music"))?;
        return segs.get(music_pos + 1).map(|a| percent_decode(a));
    }
    (!t.is_empty()).then(|| t.to_string())
}

/// Discogs artist: bare numeric id or `discogs.com/artist/{id}[-{slug}]`.
pub fn discogs_artist_id(input: &str) -> Option<String> {
    let t = input.trim();
    if all_digits(t) {
        return Some(t.to_string());
    }
    let segs = path_segments(t, &["discogs.com"])?;
    let artist_pos = segs.iter().position(|s| s.eq_ignore_ascii_case("artist"))?;
    let seg = segs.get(artist_pos + 1)?;
    let digits: String = seg.bytes().take_while(|b| b.is_ascii_digit()).map(char::from).collect();
    (!digits.is_empty()).then_some(digits)
}

/// Wikipedia page title: `…wikipedia.org/wiki/{title}` (underscores → spaces, percent-decoded)
/// or a bare title.
pub fn wikipedia_title(input: &str) -> Option<String> {
    let t = input.trim();
    if t.contains("wikipedia.org") {
        let s = strip_query(t);
        let title = s.split("/wiki/").nth(1)?;
        return Some(percent_decode(title).replace('_', " "));
    }
    (!t.is_empty()).then(|| t.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apple_album_forms() {
        assert_eq!(apple_album_id("1440788012").as_deref(), Some("1440788012"));
        assert_eq!(apple_album_id("https://music.apple.com/gb/album/parklife/1440788012").as_deref(), Some("1440788012"));
        assert_eq!(
            apple_album_id("https://music.apple.com/gb/album/parklife/1440788012?i=1440788013&ls=1").as_deref(),
            Some("1440788012")
        );
        assert_eq!(apple_album_id("https://music.apple.com/gb/album/1440788012").as_deref(), Some("1440788012"));
        assert_eq!(apple_album_id("https://music.apple.com/gb/artist/blur/528564"), None);
        assert_eq!(apple_album_id("https://example.com/album/123"), None);
        assert_eq!(apple_album_id("not an id"), None);
    }

    #[test]
    fn apple_artist_forms() {
        assert_eq!(apple_artist_id("528564").as_deref(), Some("528564"));
        assert_eq!(apple_artist_id("https://music.apple.com/gb/artist/blur/528564").as_deref(), Some("528564"));
        assert_eq!(apple_artist_id("https://music.apple.com/gb/album/parklife/1440788012"), None);
    }

    #[test]
    fn spotify_album_forms() {
        assert_eq!(spotify_album_id("0Xy0GmnB2rGnVAWQb8vXnV").as_deref(), Some("0Xy0GmnB2rGnVAWQb8vXnV"));
        assert_eq!(
            spotify_album_id("https://open.spotify.com/album/0Xy0GmnB2rGnVAWQb8vXnV?si=abc123").as_deref(),
            Some("0Xy0GmnB2rGnVAWQb8vXnV")
        );
        assert_eq!(
            spotify_album_id("https://open.spotify.com/intl-de/album/0Xy0GmnB2rGnVAWQb8vXnV").as_deref(),
            Some("0Xy0GmnB2rGnVAWQb8vXnV")
        );
        assert_eq!(spotify_album_id("spotify:album:0Xy0GmnB2rGnVAWQb8vXnV").as_deref(), Some("0Xy0GmnB2rGnVAWQb8vXnV"));
        assert_eq!(spotify_album_id("spotify:artist:0Xy0GmnB2rGnVAWQb8vXnV"), None);
        assert_eq!(spotify_album_id("https://open.spotify.com/artist/0Xy0GmnB2rGnVAWQb8vXnV"), None);
        assert_eq!(spotify_album_id("tooshort"), None);
    }

    #[test]
    fn lastfm_forms() {
        assert_eq!(
            lastfm_album_parts("https://www.last.fm/music/Blur/Parklife"),
            Some(("Blur".into(), "Parklife".into()))
        );
        assert_eq!(
            lastfm_album_parts("https://www.last.fm/music/The+Beautiful+South/0898"),
            Some(("The Beautiful South".into(), "0898".into()))
        );
        assert_eq!(
            lastfm_album_parts("https://www.last.fm/music/Sigur%20R%C3%B3s/%C3%81g%C3%A6tis%20byrjun"),
            Some(("Sigur Rós".into(), "Ágætis byrjun".into()))
        );
        assert_eq!(lastfm_album_parts("https://www.last.fm/music/Blur"), None);
        assert_eq!(lastfm_artist_name("https://www.last.fm/music/The+Beautiful+South").as_deref(), Some("The Beautiful South"));
        assert_eq!(lastfm_artist_name("Boards of Canada").as_deref(), Some("Boards of Canada"));
    }

    #[test]
    fn discogs_artist_forms() {
        assert_eq!(discogs_artist_id("125246").as_deref(), Some("125246"));
        assert_eq!(discogs_artist_id("https://www.discogs.com/artist/125246-Blur").as_deref(), Some("125246"));
        assert_eq!(discogs_artist_id("https://www.discogs.com/artist/125246").as_deref(), Some("125246"));
        assert_eq!(discogs_artist_id("https://www.discogs.com/release/1389988"), None);
        assert_eq!(discogs_artist_id("Blur"), None);
    }

    #[test]
    fn wikipedia_forms() {
        assert_eq!(wikipedia_title("https://en.wikipedia.org/wiki/Blur_(band)").as_deref(), Some("Blur (band)"));
        assert_eq!(wikipedia_title("https://en.wikipedia.org/wiki/Sigur_R%C3%B3s").as_deref(), Some("Sigur Rós"));
        assert_eq!(wikipedia_title("Blur (band)").as_deref(), Some("Blur (band)"));
        assert_eq!(wikipedia_title("   "), None);
    }
}

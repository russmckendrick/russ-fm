//! `/media/*` — artwork and JSON from the data directory (`public/`). The scrapper only writes
//! `-hi-res.jpg`; the site's build makes `-medium` (800px) and `-avatar` (128px square), so
//! when those are missing they're derived from the hi-res file on demand and cached under
//! `<scrapper>/.cache/web-media/` — never written into `public/`.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, Result};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use tokio::sync::Semaphore;

/// Sizes derived from `-hi-res.jpg` when the file isn't on disk.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Derived {
    /// 800px on the long edge.
    Medium,
    /// 128px square, centre-cropped.
    Avatar,
}

impl Derived {
    fn from_path(rel: &str) -> Option<(Self, String)> {
        if let Some(stem) = rel.strip_suffix("-medium.jpg") {
            return Some((Derived::Medium, format!("{stem}-hi-res.jpg")));
        }
        if let Some(stem) = rel.strip_suffix("-avatar.jpg") {
            return Some((Derived::Avatar, format!("{stem}-hi-res.jpg")));
        }
        None
    }
}

/// Validate a `/media/` path: top-level `album/` or `artist/` (or a root-level data file like
/// `collection.json`), no empty, `.` or `..` segments.
pub fn safe_rel(path: &str) -> Option<String> {
    let segs: Vec<&str> = path.split('/').collect();
    let ok = segs.iter().all(|s| !s.is_empty() && *s != "." && *s != ".." && !s.contains('\\'));
    let allowed = matches!(segs.as_slice(), [_] ) || matches!(segs.first(), Some(&"album") | Some(&"artist"));
    (ok && allowed).then(|| segs.join("/"))
}

pub struct Media {
    data_dir: PathBuf,
    cache_dir: PathBuf,
    /// Bounds concurrent resizes (a cover grid asks for dozens at once).
    permits: Arc<Semaphore>,
}

impl Media {
    pub fn new(data_dir: PathBuf, cache_dir: PathBuf) -> Self {
        let n = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
        Self { data_dir, cache_dir, permits: Arc::new(Semaphore::new(n)) }
    }

    /// Resolve `rel` (already passed through [`safe_rel`]) to a file on disk, deriving it from
    /// the hi-res image when needed. `Ok(None)` means not found.
    pub async fn resolve(&self, rel: &str) -> Result<Option<PathBuf>> {
        let direct = self.data_dir.join(rel);
        if direct.is_file() {
            return Ok(Some(direct));
        }
        let Some((kind, source_rel)) = Derived::from_path(rel) else { return Ok(None) };
        let source = self.data_dir.join(source_rel);
        if !source.is_file() {
            return Ok(None);
        }
        let cached = self.cache_dir.join(rel);
        if is_fresh(&cached, &source) {
            return Ok(Some(cached));
        }
        let _permit = self.permits.acquire().await.context("resize semaphore closed")?;
        // Another request may have made it while we waited.
        if is_fresh(&cached, &source) {
            return Ok(Some(cached));
        }
        let out = cached.clone();
        tokio::task::spawn_blocking(move || derive(&source, &out, kind)).await??;
        Ok(Some(cached))
    }
}

fn is_fresh(cached: &Path, source: &Path) -> bool {
    let m = |p: &Path| std::fs::metadata(p).and_then(|m| m.modified()).ok();
    match (m(cached), m(source)) {
        (Some(c), Some(s)) => c >= s,
        _ => false,
    }
}

fn derive(source: &Path, out: &Path, kind: Derived) -> Result<()> {
    let img = image::open(source).with_context(|| format!("decoding {}", source.display()))?;
    let resized = match kind {
        Derived::Medium => img.resize(800, 800, FilterType::Triangle),
        Derived::Avatar => img.resize_to_fill(128, 128, FilterType::Triangle),
    };
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent)?;
    }
    // Write to a temp file then rename, so a half-written file is never served.
    let tmp = out.with_extension("jpg.tmp");
    {
        let mut f = std::io::BufWriter::new(std::fs::File::create(&tmp)?);
        JpegEncoder::new_with_quality(&mut f, 85).encode_image(&resized.to_rgb8())?;
    }
    std::fs::rename(&tmp, out)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_rel_rejects_escapes() {
        assert_eq!(safe_rel("album/x/x-medium.jpg").as_deref(), Some("album/x/x-medium.jpg"));
        assert_eq!(safe_rel("collection.json").as_deref(), Some("collection.json"));
        assert_eq!(safe_rel("album/../secrets/key"), None);
        assert_eq!(safe_rel("album//x"), None);
        assert_eq!(safe_rel("other/x.jpg"), None);
    }

    #[tokio::test]
    async fn derives_medium_and_avatar_from_hi_res() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("public");
        let album = data.join("album/a-1");
        std::fs::create_dir_all(&album).unwrap();
        image::RgbImage::from_pixel(1600, 1200, image::Rgb([200, 10, 10])).save(album.join("a-1-hi-res.jpg")).unwrap();
        let media = Media::new(data.clone(), dir.path().join("cache"));

        let medium = media.resolve("album/a-1/a-1-medium.jpg").await.unwrap().unwrap();
        assert!(medium.starts_with(dir.path().join("cache")), "never written into public/");
        assert_eq!(image::image_dimensions(&medium).unwrap(), (800, 600));
        let avatar = media.resolve("album/a-1/a-1-avatar.jpg").await.unwrap().unwrap();
        assert_eq!(image::image_dimensions(&avatar).unwrap(), (128, 128));
        assert!(media.resolve("album/a-1/a-1-other.jpg").await.unwrap().is_none());
        assert!(!album.join("a-1-medium.jpg").exists());
    }
}

//! `/media/*` — artwork and JSON from the data directory (`public/`). The scrapper only writes
//! `-hi-res.jpg`; the site's build makes `-medium` (800px) and `-avatar` (128px square), so
//! when those are missing they're derived from the hi-res file on demand and cached under
//! `<scrapper>/.cache/web-media/` — never written into `public/`. An artist's sizes come from
//! its photo source, as the site's build makes them: a fanart chosen as the artist photo
//! (`source` in its `-image.json`), else the hi-res, with the avatar cut round the faces.

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
        let derived = Derived::from_path(rel);
        // An artist's photo notes: the chosen photo and where its faces are.
        let notes = match (&derived, rel.strip_prefix("artist/")) {
            (Some(_), Some(rest)) => rest.split('/').next().map(|slug| self.data_dir.join("artist").join(slug).join(format!("{slug}-image.json"))),
            _ => None,
        }
        .filter(|p| p.is_file());
        let chosen = notes.as_deref().and_then(photo_source);
        // A size left in public/ was made from the hi-res: only served when no other photo is chosen.
        if direct.is_file() && chosen.is_none() {
            return Ok(Some(direct));
        }
        let Some((kind, source_rel)) = derived else {
            return Ok(direct.is_file().then_some(direct));
        };
        let source = chosen.unwrap_or_else(|| self.data_dir.join(source_rel));
        if !source.is_file() {
            return Ok(None);
        }
        let cached = self.cache_dir.join(rel);
        // Stale when the source or the notes (a new choice, new face boxes) are newer.
        let fresh = |c: &Path| is_fresh(c, &source) && notes.as_deref().is_none_or(|n| is_fresh(c, n));
        if fresh(&cached) {
            return Ok(Some(cached));
        }
        let _permit = self.permits.acquire().await.context("resize semaphore closed")?;
        // Another request may have made it while we waited.
        if fresh(&cached) {
            return Ok(Some(cached));
        }
        let out = cached.clone();
        let faces = notes.as_deref().and_then(face_notes);
        tokio::task::spawn_blocking(move || derive(&source, &out, kind, faces.as_ref())).await??;
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

/// The chosen artist photo from its notes (`source`, a fanart), when it is on disk.
fn photo_source(notes: &Path) -> Option<PathBuf> {
    let text = std::fs::read_to_string(notes).ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    let file = json.get("source")?.as_str()?;
    let ok = !file.contains(['/', '\\']) && file.ends_with(".jpg");
    let path = notes.parent()?.join(file);
    (ok && path.is_file()).then_some(path)
}

/// The photo notes the avatar crop needs: the size they were measured at, face boxes and focus.
struct FaceNotes {
    width: f64,
    height: f64,
    faces: Vec<[f64; 4]>,
    focus: Option<[f64; 2]>,
}

fn face_notes(notes: &Path) -> Option<FaceNotes> {
    let json: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(notes).ok()?).ok()?;
    let num = |v: &serde_json::Value| v.as_f64();
    let faces = json
        .get("faces")
        .and_then(|f| f.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|b| {
                    let b = b.as_array()?;
                    Some([num(b.first()?)?, num(b.get(1)?)?, num(b.get(2)?)?, num(b.get(3)?)?])
                })
                .collect()
        })
        .unwrap_or_default();
    let focus = json.get("focus").and_then(|f| f.as_array()).and_then(|f| Some([num(f.first()?)?, num(f.get(1)?)?]));
    Some(FaceNotes { width: num(json.get("width")?)?, height: num(json.get("height")?)?, faces, focus })
}

/// The square to cut the avatar from, in px of a `w`×`h` image: round the faces (room for hair
/// and shoulders, never tighter than the short side over 1.8), else the focus, else the middle.
/// The site's build does the same (src/lib/artistPhotoSource.ts, avatarCrop). None when the
/// notes no longer describe the image (other proportions).
fn avatar_crop(notes: &FaceNotes, w: u32, h: u32) -> Option<(u32, u32, u32)> {
    let k = w as f64 / notes.width;
    if (h as f64 / notes.height - k).abs() >= 0.01 {
        return None;
    }
    let (wf, hf) = (w as f64, h as f64);
    let short = wf.min(hf);
    let (mut cx, mut cy, mut size) = (wf / 2.0, hf / 2.0, short);
    if !notes.faces.is_empty() {
        let f = &notes.faces;
        let x0 = f.iter().map(|b| b[0]).fold(f64::MAX, f64::min) * wf;
        let x1 = f.iter().map(|b| b[0] + b[2]).fold(f64::MIN, f64::max) * wf;
        let y0 = f.iter().map(|b| b[1]).fold(f64::MAX, f64::min) * hf;
        let y1 = f.iter().map(|b| b[1] + b[3]).fold(f64::MIN, f64::max) * hf;
        let face = f.iter().map(|b| b[3]).fold(0.0, f64::max) * hf;
        cx = (x0 + x1) / 2.0;
        cy = (y0 + y1) / 2.0 + face * 0.25;
        size = short.min((short / 1.8).max((x1 - x0).max(y1 - y0) + face * 2.2));
    } else if let Some([fx, fy]) = notes.focus {
        cx = fx * wf;
        cy = fy * hf;
    }
    let s = size.round();
    let clamp = |v: f64, hi: f64| v.max(0.0).min(hi).round() as u32;
    Some((clamp(cx - s / 2.0, wf - s), clamp(cy - s / 2.0, hf - s), s as u32))
}

fn derive(source: &Path, out: &Path, kind: Derived, faces: Option<&FaceNotes>) -> Result<()> {
    let img = image::open(source).with_context(|| format!("decoding {}", source.display()))?;
    let resized = match kind {
        Derived::Medium => img.resize(800, 800, FilterType::Triangle),
        Derived::Avatar => match faces.and_then(|n| avatar_crop(n, img.width(), img.height())) {
            Some((x, y, s)) => img.crop_imm(x, y, s, s).resize_exact(128, 128, FilterType::Triangle),
            None => img.resize_to_fill(128, 128, FilterType::Triangle),
        },
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

    #[tokio::test]
    async fn artist_sizes_follow_the_chosen_photo() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("public");
        let artist = data.join("artist/band");
        std::fs::create_dir_all(&artist).unwrap();
        image::RgbImage::from_pixel(600, 600, image::Rgb([0, 0, 0])).save(artist.join("band-hi-res.jpg")).unwrap();
        image::RgbImage::from_pixel(1280, 720, image::Rgb([255, 255, 255])).save(artist.join("band-fanart01.jpg")).unwrap();
        std::fs::write(artist.join("band-image.json"), r#"{"source":"band-fanart01.jpg","width":1280,"height":720,"faces":[[0.1,0.2,0.1,0.2]],"focus":[0.15,0.3]}"#).unwrap();
        let media = Media::new(data.clone(), dir.path().join("cache"));

        let medium = media.resolve("artist/band/band-medium.jpg").await.unwrap().unwrap();
        assert_eq!(image::image_dimensions(&medium).unwrap(), (800, 450), "made from the 16:9 fanart");
        let avatar = media.resolve("artist/band/band-avatar.jpg").await.unwrap().unwrap();
        let px = image::open(&avatar).unwrap().to_rgb8().get_pixel(64, 64).0;
        assert!(px[0] > 200, "the white fanart, not the black hi-res");
    }

    #[test]
    fn avatar_crop_centres_on_the_faces() {
        let n = FaceNotes { width: 1280.0, height: 720.0, faces: vec![[0.1, 0.2, 0.1, 0.2]], focus: None };
        let (x, _, s) = avatar_crop(&n, 1280, 720).unwrap();
        // Faces centred at x 192; the square sits at the photo's left, not its middle.
        assert!(x < 100 && s >= 400);
        // An upscaled photo (same proportions) is cropped at its new size; other proportions aren't.
        assert!(avatar_crop(&n, 2560, 1440).is_some());
        assert!(avatar_crop(&n, 1000, 1000).is_none());
    }
}

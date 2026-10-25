//! Local AI upscaling of the site's images through Upscayl's bundled `upscayl-bin` (Real-ESRGAN,
//! on the GPU): small artist photos, small album covers and artist fanart. The image is upscaled
//! 4× to a PNG, resized to its target with Lanczos3 and written back over the original as a
//! quality-90 JPEG. The original is kept first under `<scrapper>/backups/upscale-originals/`,
//! with a line per upscale in its `log.jsonl`, so any of them can be undone.
//!
//! Only images under their target are touched, so running it again changes nothing:
//! - artist photos and album covers under 1000px on the short side, to 2000px on the long side
//!   (at most 4×);
//! - fanart under 2560px wide, to 2560 wide (1280×720 becomes 2560×1440).

use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{bail, Context, Result};
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use serde_json::json;

use crate::Config;

/// What a file is, from its name; decides its target size.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// An artist's `-hi-res.jpg`.
    Photo,
    /// An album's `-hi-res.jpg`.
    Cover,
    /// An artist's `-fanart0N.jpg`.
    Fanart,
}

impl Kind {
    /// From a path relative to the data directory (`artist/<slug>/<file>`, `album/<slug>/<file>`).
    pub fn of(rel: &str) -> Option<Kind> {
        let segs: Vec<&str> = rel.split('/').collect();
        let [top, _, file] = segs.as_slice() else { return None };
        match (*top, file) {
            ("artist", f) if f.ends_with("-hi-res.jpg") => Some(Kind::Photo),
            ("artist", f) if is_fanart(f) => Some(Kind::Fanart),
            ("album", f) if f.ends_with("-hi-res.jpg") => Some(Kind::Cover),
            _ => None,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Kind::Photo => "artist photo",
            Kind::Cover => "album cover",
            Kind::Fanart => "fanart",
        }
    }

    /// The size to upscale `w`×`h` to, or None when it is already big enough.
    pub fn target(self, w: u32, h: u32) -> Option<(u32, u32)> {
        let (w, h) = (w.max(1), h.max(1));
        let scale = match self {
            Kind::Photo | Kind::Cover if w.min(h) < PHOTO_SHORT_SIDE => (PHOTO_LONG_SIDE as f64 / w.max(h) as f64).min(4.0),
            Kind::Fanart if w < FANART_WIDTH => (FANART_WIDTH as f64 / w as f64).min(4.0),
            _ => return None,
        };
        // Under 1.25× isn't worth a pass through the model.
        (scale >= 1.25).then(|| ((w as f64 * scale).round() as u32, (h as f64 * scale).round() as u32))
    }
}

/// Photos and covers shorter than this on their short side are upscaled…
pub const PHOTO_SHORT_SIDE: u32 = 1000;
/// …to this on their long side.
pub const PHOTO_LONG_SIDE: u32 = 2000;
/// Fanart narrower than this is upscaled to it.
pub const FANART_WIDTH: u32 = 2560;

fn is_fanart(file: &str) -> bool {
    file.strip_suffix(".jpg")
        .and_then(|f| f.rsplit_once("-fanart"))
        .is_some_and(|(_, n)| n.len() == 2 && n.bytes().all(|b| b.is_ascii_digit()))
}

/// An image's size, and the size it would be upscaled to.
#[derive(Debug, Clone, Copy)]
pub struct Plan {
    pub kind: Kind,
    pub from: (u32, u32),
    pub to: Option<(u32, u32)>,
}

/// What [`Upscaler::upscale`] did.
#[derive(Debug, Clone, Copy)]
pub struct Done {
    pub from: (u32, u32),
    pub to: (u32, u32),
}

/// Read a file's size and work out its target.
pub fn plan(file: &Path, kind: Kind) -> Result<Plan> {
    let (w, h) = image::image_dimensions(file).with_context(|| format!("reading {}", file.display()))?;
    Ok(Plan { kind, from: (w, h), to: kind.target(w, h) })
}

pub struct Upscaler {
    bin: PathBuf,
    models: PathBuf,
    model: String,
    originals: PathBuf,
    data_dir: PathBuf,
}

impl Upscaler {
    /// Find `upscayl-bin` and its models (see [`crate::config::UpscaleConfig`]).
    pub fn find(cfg: &Config) -> Result<Self> {
        let app = PathBuf::from("/Applications/Upscayl.app/Contents/Resources/bin/upscayl-bin");
        let bin = [
            (!cfg.upscale.bin.is_empty()).then(|| PathBuf::from(&cfg.upscale.bin)),
            std::env::var_os("UPSCAYL_BIN").map(PathBuf::from),
            which("upscayl-bin"),
            Some(app),
        ]
        .into_iter()
        .flatten()
        .find(|p| p.is_file());
        let Some(bin) = bin else {
            bail!("upscayl-bin not found: install Upscayl (brew install --cask upscayl) or set upscale.bin in config.json");
        };
        let models = if cfg.upscale.models.is_empty() {
            bin.parent().and_then(Path::parent).map(|p| p.join("models")).unwrap_or_default()
        } else {
            PathBuf::from(&cfg.upscale.models)
        };
        if !models.join(format!("{}.param", cfg.upscale.model)).is_file() {
            bail!("model {} not found in {} (set upscale.models / upscale.model in config.json)", cfg.upscale.model, models.display());
        }
        Ok(Self {
            bin,
            models,
            model: cfg.upscale.model.clone(),
            originals: cfg.base_dir.join("backups").join("upscale-originals"),
            data_dir: cfg.data_dir(),
        })
    }

    /// Upscale `rel` (relative to the data directory) to its target, keeping the original.
    /// Blocking (a few seconds on the GPU): call it from `spawn_blocking` in async code.
    /// `force` upscales an image already at its target to 2× instead.
    pub fn upscale(&self, rel: &str, force: bool) -> Result<Done> {
        let Some(kind) = Kind::of(rel) else { bail!("{rel} isn't an artist photo, album cover or fanart") };
        let file = self.data_dir.join(rel);
        let p = plan(&file, kind)?;
        let to = match (p.to, force) {
            (Some(to), _) => to,
            (None, true) => (p.from.0 * 2, p.from.1 * 2),
            (None, false) => bail!("{rel} is already {}×{}; nothing to do", p.from.0, p.from.1),
        };

        // The original first, once: a second upscale of the same file keeps the first original.
        let kept = self.originals.join(rel);
        if !kept.exists() {
            std::fs::create_dir_all(kept.parent().context("original path")?)?;
            std::fs::copy(&file, &kept).with_context(|| format!("keeping the original at {}", kept.display()))?;
        }

        let tmp = tempdir()?;
        let png = tmp.join("upscaled.png");
        let out = Command::new(&self.bin)
            .arg("-i").arg(&file)
            .arg("-o").arg(&png)
            .arg("-m").arg(&self.models)
            .arg("-n").arg(&self.model)
            .args(["-s", "4", "-f", "png"])
            .output()
            .with_context(|| format!("running {}", self.bin.display()))?;
        if !out.status.success() || !png.is_file() {
            let _ = std::fs::remove_dir_all(&tmp);
            bail!("upscayl-bin failed on {rel}: {}", String::from_utf8_lossy(&out.stderr).trim());
        }

        let img = image::open(&png).context("reading the upscaled image")?.resize_exact(to.0, to.1, FilterType::Lanczos3).into_rgb8();
        let staged = file.with_extension("jpg.upscaling");
        {
            let mut w = std::io::BufWriter::new(std::fs::File::create(&staged)?);
            JpegEncoder::new_with_quality(&mut w, 90).encode_image(&img).context("encoding the JPEG")?;
        }
        std::fs::rename(&staged, &file)?;
        let _ = std::fs::remove_dir_all(&tmp);

        let line = json!({
            "file": rel, "kind": kind.label(), "from": [p.from.0, p.from.1], "to": [to.0, to.1],
            "model": self.model, "at": crate::util::now_iso(),
        });
        use std::io::Write;
        if let Ok(mut log) = std::fs::OpenOptions::new().create(true).append(true).open(self.originals.join("log.jsonl")) {
            let _ = writeln!(log, "{line}");
        }
        Ok(Done { from: p.from, to })
    }

    /// Put an upscaled image back to its kept original (and drop the copy). False when there
    /// is no original for it.
    pub fn restore(&self, rel: &str) -> Result<bool> {
        let kept = self.originals.join(rel);
        if !kept.is_file() {
            return Ok(false);
        }
        std::fs::copy(&kept, self.data_dir.join(rel))?;
        std::fs::remove_file(&kept)?;
        Ok(true)
    }

    /// Whether `rel` has a kept original (it was upscaled).
    pub fn has_original(&self, rel: &str) -> bool {
        self.originals.join(rel).is_file()
    }
}

fn which(name: &str) -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|paths| std::env::split_paths(&paths).map(|d| d.join(name)).find(|p| p.is_file()))
}

fn tempdir() -> Result<PathBuf> {
    let dir = std::env::temp_dir().join(format!("scrapper-upscale-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_come_from_the_file_name() {
        assert_eq!(Kind::of("artist/pixies/pixies-hi-res.jpg"), Some(Kind::Photo));
        assert_eq!(Kind::of("artist/pixies/pixies-fanart03.jpg"), Some(Kind::Fanart));
        assert_eq!(Kind::of("album/doolittle-1/doolittle-1-hi-res.jpg"), Some(Kind::Cover));
        assert_eq!(Kind::of("artist/pixies/pixies-medium.jpg"), None);
        assert_eq!(Kind::of("artist/pixies/pixies-fanart3.jpg"), None);
        assert_eq!(Kind::of("pixies-hi-res.jpg"), None);
    }

    #[test]
    fn targets_only_small_images() {
        // 600×600 → 2000×2000 (3.3×); 506×652 → 1552×2000.
        assert_eq!(Kind::Photo.target(600, 600), Some((2000, 2000)));
        assert_eq!(Kind::Photo.target(506, 652), Some((1552, 2000)));
        // 234×259 is capped at 4×.
        assert_eq!(Kind::Cover.target(234, 259), Some((936, 1036)));
        // Big enough already.
        assert_eq!(Kind::Photo.target(1024, 1024), None);
        assert_eq!(Kind::Cover.target(1400, 1400), None);
        // 1280×720 fanart → 2560×1440; 2560 wide is done.
        assert_eq!(Kind::Fanart.target(1280, 720), Some((2560, 1440)));
        assert_eq!(Kind::Fanart.target(2560, 1440), None);
        // A 999×1700 photo would only grow 1.18×: not worth it.
        assert_eq!(Kind::Photo.target(999, 1700), None);
    }
}

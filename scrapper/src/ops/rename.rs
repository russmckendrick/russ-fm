//! Rename a public output folder when a title/name edit changes its slug: move the directory,
//! rename the slug-prefixed image files inside, and drop the stale `{old}.json` (the caller
//! writes the fresh one). Pure filesystem — no DB or network — so it's fully unit-testable.

use std::path::{Path, PathBuf};

use anyhow::{bail, Result};

/// Image-file suffixes inside a release folder.
pub const RELEASE_SUFFIXES: &[&str] = &["-hi-res.jpg", "-medium.jpg", "-small.jpg"];
/// Image-file suffixes inside an artist folder.
pub const ARTIST_SUFFIXES: &[&str] = &["-hi-res.jpg", "-medium.jpg", "-small.jpg", "-avatar.jpg"];

/// A planned folder rename under `base` (e.g. `public/album`).
pub struct RenamePlan {
    pub old_dir: PathBuf,
    pub new_dir: PathBuf,
    pub old_slug: String,
    pub new_slug: String,
}

/// Plan a rename, or `None` when the slugs are equal (nothing to do).
pub fn plan(base: &Path, old_slug: &str, new_slug: &str) -> Option<RenamePlan> {
    if old_slug == new_slug {
        return None;
    }
    Some(RenamePlan {
        old_dir: base.join(old_slug),
        new_dir: base.join(new_slug),
        old_slug: old_slug.to_string(),
        new_slug: new_slug.to_string(),
    })
}

/// Execute a rename plan. Fails (leaving everything untouched) when the target folder already
/// exists; a missing source folder just creates the target. Inside the moved folder every
/// `{old_slug}{suffix}` file is renamed to `{new_slug}{suffix}`, and a stale `{old_slug}.json`
/// is removed — the caller writes the fresh `{new_slug}.json` afterwards.
pub fn apply(plan: &RenamePlan, suffixes: &[&str]) -> Result<()> {
    if plan.new_dir.exists() {
        bail!(
            "a folder named \"{}\" already exists — refusing to overwrite it",
            plan.new_dir.display()
        );
    }
    if !plan.old_dir.exists() {
        std::fs::create_dir_all(&plan.new_dir)?;
        return Ok(());
    }
    std::fs::rename(&plan.old_dir, &plan.new_dir)?;
    for suffix in suffixes {
        let old_file = plan.new_dir.join(format!("{}{suffix}", plan.old_slug));
        if old_file.exists() {
            std::fs::rename(&old_file, plan.new_dir.join(format!("{}{suffix}", plan.new_slug)))?;
        }
    }
    let stale_json = plan.new_dir.join(format!("{}.json", plan.old_slug));
    if stale_json.exists() {
        std::fs::remove_file(&stale_json)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tempdir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("scrapper-rename-{tag}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn touch(p: &Path) {
        std::fs::write(p, "x").unwrap();
    }

    #[test]
    fn no_op_when_slugs_equal() {
        assert!(plan(Path::new("/tmp"), "same", "same").is_none());
    }

    #[test]
    fn renames_folder_images_and_drops_stale_json() {
        let base = tempdir("ok");
        let old = base.join("old-slug");
        std::fs::create_dir_all(&old).unwrap();
        touch(&old.join("old-slug-hi-res.jpg"));
        touch(&old.join("old-slug-medium.jpg"));
        touch(&old.join("old-slug.json"));
        touch(&old.join("unrelated.txt"));

        let p = plan(&base, "old-slug", "new-slug").unwrap();
        apply(&p, RELEASE_SUFFIXES).unwrap();

        let new = base.join("new-slug");
        assert!(!old.exists());
        assert!(new.join("new-slug-hi-res.jpg").exists());
        assert!(new.join("new-slug-medium.jpg").exists());
        assert!(!new.join("old-slug.json").exists(), "stale JSON removed");
        assert!(new.join("unrelated.txt").exists(), "other files carried over");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn collision_leaves_everything_untouched() {
        let base = tempdir("collide");
        let old = base.join("old-slug");
        std::fs::create_dir_all(&old).unwrap();
        touch(&old.join("old-slug-hi-res.jpg"));
        std::fs::create_dir_all(base.join("new-slug")).unwrap();

        let p = plan(&base, "old-slug", "new-slug").unwrap();
        assert!(apply(&p, RELEASE_SUFFIXES).is_err());
        assert!(old.join("old-slug-hi-res.jpg").exists(), "source untouched after collision");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn missing_source_creates_target() {
        let base = tempdir("missing");
        let p = plan(&base, "never-existed", "fresh").unwrap();
        apply(&p, ARTIST_SUFFIXES).unwrap();
        assert!(base.join("fresh").is_dir());
        let _ = std::fs::remove_dir_all(&base);
    }
}

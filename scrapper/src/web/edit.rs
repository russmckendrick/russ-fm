//! Editing records from the browser, with a preview of exactly what changes before anything is
//! written. Edits go through the same ops as the TUI's detail editor, split into apply (in
//! memory) and commit (rename folder, save, write JSON), so a preview is the commit's output
//! rendered without writing: the public JSON and the collection.json entry, before and after.

use std::sync::Arc;

use anyhow::{anyhow, bail, Context, Result};
use serde::Deserialize;
use serde_json::{json, Value};

use super::AppState;
use crate::db::{ArtistRecord, ReleaseRecord};
use crate::ops::artist::{self, ArtistField};
use crate::ops::release::{self, ReleaseField};
use crate::ops::FieldKind;
use crate::output::{artist_to_value, collection, images, release_to_value};
use crate::sanitize::sanitize_folder_name;
use crate::services::Services;

/// One field change: `text` for scalar, list and service fields, `rows` for structured ones.
#[derive(Debug, Deserialize)]
pub struct Edit {
    pub field: String,
    pub text: Option<String>,
    pub rows: Option<Vec<Vec<String>>>,
}

#[derive(Debug, Deserialize)]
pub struct EditBody {
    pub edits: Vec<Edit>,
    /// false: preview only.
    #[serde(default)]
    pub save: bool,
}

// ── Releases ────────────────────────────────────────────────────────────────────────────────

/// The database record behind an album folder.
pub fn release_record(st: &AppState, slug: &str) -> Result<ReleaseRecord> {
    let id = slug.rsplit_once('-').map(|(_, id)| id).filter(|id| id.bytes().all(|b| b.is_ascii_digit()));
    let rec = match id {
        Some(id) => st.db.get_release_by_discogs_id(id)?,
        None => None,
    };
    rec.ok_or_else(|| anyhow!(super::api::NotFound(format!("no release {slug} in the database"))))
}

/// The detail editor's field list: every field with its kind, current value and (for
/// structured fields) its rows.
pub fn release_fields(rec: &ReleaseRecord) -> Value {
    let fields: Vec<Value> = ReleaseField::all()
        .iter()
        .map(|&f| {
            let structured = f.kind() == FieldKind::Structured;
            json!({
                "key": f.key(),
                "label": f.label(),
                "kind": f.kind().as_str(),
                "editable": f.editable(),
                "refreshable": f.refreshable(),
                "present": f.present(rec),
                "multiline": f.multiline(),
                "value": f.get(rec),
                "columns": structured.then(|| release::release_columns(f)),
                "rows": structured.then(|| release::release_rows(rec, f)),
            })
        })
        .collect();
    json!({ "fields": fields, "slug": release::release_folder(rec) })
}

/// Apply `edits` to a copy of `rec`. Service fields are fetched from their APIs. Returns the
/// edited record and whether new artwork sources arrived.
async fn apply_release_edits(services: &Services, rec: &ReleaseRecord, edits: &[Edit]) -> Result<(ReleaseRecord, bool)> {
    let mut after = rec.clone();
    let mut download = false;
    for e in edits {
        let field = ReleaseField::from_key(&e.field).ok_or_else(|| anyhow!("unknown release field {:?}", e.field))?;
        let text = e.text.as_deref().unwrap_or("");
        match field.kind() {
            FieldKind::RefreshOnly => bail!("{} can only be refreshed from its source", field.label()),
            FieldKind::Structured => {
                let rows = e.rows.as_deref().ok_or_else(|| anyhow!("{} needs rows", field.label()))?;
                release::apply_release_rows(&mut after, field, rows).with_context(|| field.label())?;
            }
            FieldKind::Service => {
                download |= release::fetch_release_service(services, &mut after, field, text).await.with_context(|| field.label())?;
            }
            _ => release::apply_release_value(&mut after, field, text).with_context(|| field.label())?,
        }
    }
    Ok((after, download))
}

/// Preview or save edits to one release.
pub async fn edit_release(st: Arc<AppState>, slug: String, body: EditBody) -> Result<Value> {
    let s = st.clone();
    let before = tokio::task::spawn_blocking(move || release_record(&s, &slug)).await??;
    let services = Services::new(&st.cfg);
    let (after, download) = apply_release_edits(&services, &before, &body.edits).await?;
    let (old_slug, new_slug) = (release::release_folder(&before), release::release_folder(&after));

    if !body.save {
        let s = st.clone();
        return tokio::task::spawn_blocking(move || -> Result<Value> {
            let mut notes = Vec::new();
            if old_slug != new_slug {
                notes.push(format!("The album folder moves from {old_slug}/ to {new_slug}/ (artwork comes along)."));
            }
            if download {
                notes.push("New artwork sources: the cover is downloaded again on save.".to_string());
            }
            notes.push("collection.json is regenerated on save.".to_string());
            Ok(json!({
                "files": [
                    {
                        "path": format!("public/album/{new_slug}/{new_slug}.json"),
                        "before": release_to_value(&before, &s.db),
                        "after": release_to_value(&after, &s.db),
                    },
                    {
                        "path": format!("public/collection.json → {new_slug}"),
                        "before": collection::entry_for(&s.cfg, &s.db, &before),
                        "after": collection::entry_for(&s.cfg, &s.db, &after),
                    },
                ],
                "slug": new_slug,
                "notes": notes,
            }))
        })
        .await?;
    }

    if download {
        let target = st.cfg.image_sizes.hi_res.split('x').next().and_then(|s| s.parse::<u32>().ok()).unwrap_or(2000);
        let client = release::image_client();
        let _ = images::download_release_hires(&client, &st.cfg.releases_dir(), &new_slug, &after.raw_data, target, None).await;
    }
    let s = st.clone();
    tokio::task::spawn_blocking(move || -> Result<Value> {
        let saved = release::commit_release_edit(&s.cfg, &s.db, &before, after)?;
        let n = collection::regenerate(&s.cfg, &s.db)?;
        Ok(json!({ "saved": true, "slug": release::release_folder(&saved), "collection_entries": n }))
    })
    .await?
}

// ── Artists ─────────────────────────────────────────────────────────────────────────────────

/// The database record behind an artist folder: the published JSON's `id`, else a name match.
pub fn artist_record(st: &AppState, slug: &str) -> Result<ArtistRecord> {
    let path = st.cfg.artists_dir().join(slug).join(format!("{slug}.json"));
    let public: Option<Value> = std::fs::read(&path).ok().and_then(|b| serde_json::from_slice(&b).ok());
    if let Some(p) = &public {
        if let Some(rec) = p.get("id").and_then(Value::as_str).map(|id| st.db.get_artist_by_id(id)).transpose()?.flatten() {
            return Ok(rec);
        }
        if let Some(rec) = p.get("name").and_then(Value::as_str).map(|n| st.db.get_artist_by_name(n)).transpose()?.flatten() {
            return Ok(rec);
        }
    }
    let lib = st.library.get()?;
    if let Some(a) = lib.artists.iter().find(|a| a.slug == slug) {
        if let Some(rec) = st.db.get_artist_by_name(&a.name)? {
            return Ok(rec);
        }
    }
    Err(anyhow!(super::api::NotFound(format!("no artist {slug} in the database"))))
}

pub fn artist_fields(rec: &ArtistRecord) -> Value {
    let fields: Vec<Value> = ArtistField::all()
        .iter()
        .map(|&f| {
            let structured = f.kind() == FieldKind::Structured;
            json!({
                "key": f.key(),
                "label": f.label(),
                "kind": f.kind().as_str(),
                "editable": f.editable(),
                "refreshable": f.refreshable(),
                "present": f.present(rec),
                "multiline": f.multiline(),
                "value": f.get(rec),
                "columns": structured.then_some(["Type", "URL", "Width", "Height"]),
                "rows": structured.then(|| release::images_to_rows(&rec.images)),
            })
        })
        .collect();
    json!({ "fields": fields, "slug": sanitize_folder_name(&rec.name) })
}

async fn apply_artist_edits(services: &Services, rec: &ArtistRecord, edits: &[Edit]) -> Result<(ArtistRecord, bool)> {
    let mut after = rec.clone();
    let mut download = false;
    for e in edits {
        let field = ArtistField::from_key(&e.field).ok_or_else(|| anyhow!("unknown artist field {:?}", e.field))?;
        let text = e.text.as_deref().unwrap_or("");
        match field.kind() {
            FieldKind::RefreshOnly => bail!("{} can only be refreshed from its source", field.label()),
            FieldKind::Structured => {
                let rows = e.rows.as_deref().ok_or_else(|| anyhow!("{} needs rows", field.label()))?;
                artist::apply_artist_rows(&mut after, field, rows).with_context(|| field.label())?;
            }
            FieldKind::Service => {
                download |= artist::fetch_artist_service(services, &mut after, field, text).await.with_context(|| field.label())?;
            }
            _ => artist::apply_artist_value(&mut after, field, text).with_context(|| field.label())?,
        }
    }
    Ok((after, download))
}

/// Preview or save edits to one artist.
pub async fn edit_artist(st: Arc<AppState>, slug: String, body: EditBody) -> Result<Value> {
    let s = st.clone();
    let before = tokio::task::spawn_blocking(move || artist_record(&s, &slug)).await??;
    let services = Services::new(&st.cfg);
    let (after, download) = apply_artist_edits(&services, &before, &body.edits).await?;
    let (old_slug, new_slug) = (sanitize_folder_name(&before.name), sanitize_folder_name(&after.name));

    if !body.save {
        let s = st.clone();
        return tokio::task::spawn_blocking(move || -> Result<Value> {
            let embedding = s.db.releases_embedding_artist(before.discogs_id.as_deref(), &before.name)?.len();
            let mut notes = Vec::new();
            if old_slug != new_slug {
                notes.push(format!(
                    "The artist folder moves from {old_slug}/ to {new_slug}/, and the name changes on {embedding} release(s)."
                ));
            }
            if embedding > 0 {
                notes.push(format!("{embedding} release JSON file(s) that show this artist are rewritten on save."));
            }
            if download {
                notes.push("New photo sources: the artist photo is downloaded again on save.".to_string());
            }
            Ok(json!({
                "files": [{
                    "path": format!("public/artist/{new_slug}/{new_slug}.json"),
                    "before": artist_to_value(&before),
                    "after": artist_to_value(&after),
                }],
                "slug": new_slug,
                "notes": notes,
            }))
        })
        .await?;
    }

    if download {
        let client = release::image_client();
        let _ = images::download_artist_hires(&client, &st.cfg.artists_dir(), &new_slug, &after.raw_data, 2000, None).await;
    }
    let s = st.clone();
    tokio::task::spawn_blocking(move || -> Result<Value> {
        let (saved, fanout) = artist::commit_artist_edit(&s.cfg, &s.db, &before, after)?;
        let n = collection::regenerate(&s.cfg, &s.db)?;
        Ok(json!({
            "saved": true,
            "slug": sanitize_folder_name(&saved.name),
            "releases_rewritten": fanout,
            "collection_entries": n,
        }))
    })
    .await?
}

//! `backfill-fanart`: download every artist's TheAudioDB fanart next to its hi-res photo
//! (`{slug}-fanart01.jpg`, `-fanart02.jpg`, …) from the URLs already stored in
//! `raw_data.theaudiodb`, so no API is called. New and refreshed artists get theirs when the
//! hi-res photo is downloaded; this catches up everyone stored before that.

use std::collections::BTreeMap;

use anyhow::Result;
use futures::stream::{self, StreamExt};

use crate::cli::BackfillFanartArgs;
use crate::db::Db;
use crate::output::images;
use crate::sanitize::sanitize_folder_name;
use crate::Config;

struct Job {
    name: String,
    folder: String,
    raw_data: serde_json::Value,
    wanted: usize,
}

pub async fn run(cfg: &Config, args: BackfillFanartArgs) -> Result<()> {
    let db = Db::open(cfg.db_path())?;
    let artist_dir = cfg.artists_dir();

    // Some artists have more than one record (a duplicate under another ID) sharing one public
    // folder. One job per folder, from the record with the most fanart. Nothing is ever deleted.
    let mut no_folder = 0usize;
    let mut by_folder: BTreeMap<String, Job> = BTreeMap::new();
    for s in db.list_artists(u32::MAX, "name")? {
        if args.artist.as_deref().is_some_and(|a| !s.name.eq_ignore_ascii_case(a)) {
            continue;
        }
        let Some(rec) = db.get_artist_by_id(&s.id)? else { continue };
        let folder = sanitize_folder_name(&rec.name);
        if !artist_dir.join(&folder).is_dir() {
            no_folder += 1;
            continue;
        }
        let wanted = images::artist_fanart_urls(&rec.raw_data).len();
        if by_folder.get(&folder).is_some_and(|j| j.wanted >= wanted) {
            continue;
        }
        by_folder.insert(folder.clone(), Job { name: rec.name.trim().to_string(), folder, raw_data: rec.raw_data, wanted });
    }

    let (mut without, mut complete) = (0usize, 0usize);
    let mut jobs: Vec<Job> = Vec::new();
    for job in by_folder.into_values() {
        let (folder, wanted) = (&job.folder, job.wanted);
        let dir = artist_dir.join(folder);
        let on_disk = |n: usize| dir.join(images::fanart_file_name(folder, n)).exists();
        if wanted == 0 {
            without += 1;
            continue;
        }
        if !args.force && (1..=wanted).all(on_disk) {
            complete += 1;
            continue;
        }
        jobs.push(job);
    }
    if let Some(l) = args.limit {
        jobs.truncate(l as usize);
    }
    let images_wanted: usize = jobs.iter().map(|j| j.wanted).sum();

    crate::say!(
        "{} artist(s) with fanart to fetch ({images_wanted} image(s)); {complete} already complete, {without} with no fanart stored, {no_folder} with no public folder.",
        jobs.len()
    );
    if args.dry_run {
        for j in jobs.iter().take(25) {
            crate::say!("  [dry-run] {} → {} fanart", j.name, j.wanted);
        }
        if jobs.len() > 25 {
            crate::say!("  …and {} more", jobs.len() - 25);
        }
        return Ok(());
    }

    let client = crate::ops::release::image_client();
    let total = jobs.len();
    let mut done = 0usize;
    let mut sum = images::FanartOutcome::default();
    let force = args.force;
    // Owned per download (not borrowed from `jobs`): the web UI runs commands on a spawned
    // task, which needs this future to be `Send` for any lifetime.
    let mut results = stream::iter(jobs.into_iter().map(move |j| {
        let (client, artist_dir) = (client.clone(), artist_dir.clone());
        async move {
            let o = images::download_artist_fanart(&client, &artist_dir, &j.folder, &j.raw_data, force).await;
            (j.name, o)
        }
    }))
    .buffer_unordered(args.concurrency.max(1));
    while let Some((name, o)) = results.next().await {
        done += 1;
        sum.downloaded += o.downloaded;
        sum.kept += o.kept;
        sum.failed += o.failed;
        let mut what = vec![format!("{} downloaded", o.downloaded)];
        if o.kept > 0 {
            what.push(format!("{} kept", o.kept));
        }
        if o.failed > 0 {
            what.push(format!("{} failed", o.failed));
        }
        crate::say!("[{done}/{total}] {name} — {}", what.join(", "));
    }
    crate::say!(
        "Done: {} downloaded, {} kept, {} failed.",
        sum.downloaded,
        sum.kept,
        sum.failed
    );
    Ok(())
}

//! discogs-sub — draft Discogs release submissions for records that aren't in the database yet.
//!
//! Discogs has no API for adding releases, so this builds the draft locally (JSON + a Markdown
//! walk-through in form order) from the closest existing Discogs version plus MusicBrainz,
//! Apple Music and Spotify, applying the Release Submission Guidelines. You then enter it via
//! "Copy to Draft" or https://www.discogs.com/release/add and submit it yourself.

mod draft;
mod musicbrainz;
mod render;
mod rules;
mod sources;

use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use clap::{Args, Parser, Subcommand};
use dialoguer::{Confirm, Input, Select};

use draft::{InHand, Query};
use rules::Family;
use sources::Clients;

#[derive(Parser)]
#[command(name = "discogs-sub", version, about = "Draft Discogs release submissions from your copy plus Discogs, MusicBrainz, Apple Music and Spotify")]
struct Cli {
    /// Path to the scrapper config.json (default: ./config.json, then ~/.config/scrapper/config.json).
    #[arg(short, long, global = true)]
    config: Option<PathBuf>,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Build a draft for a release you own.
    Draft(Box<DraftArgs>),
    /// Is this barcode already on Discogs (or MusicBrainz)?
    Check {
        barcode: String,
    },
}

#[derive(Args)]
struct DraftArgs {
    /// Artist as on the cover ("Various" for compilations).
    artist: String,
    /// Release title.
    title: String,
    /// Carrier of your copy.
    #[arg(long, value_enum, default_value = "vinyl")]
    format: Family,
    /// Barcode from your copy (digits; spacing doesn't matter).
    #[arg(long)]
    barcode: Option<String>,
    /// Vinyl colour as you'd describe it, most distinctive word first ("Transparent Light Blue").
    #[arg(long, alias = "color")]
    colour: Option<String>,
    /// Non-standard weight printed on the release ("180g").
    #[arg(long)]
    weight: Option<String>,
    /// "Limited" is printed on the release (or stated by the label).
    #[arg(long, conflicts_with = "not_limited")]
    limited: bool,
    /// Drop "Limited Edition" copied from a sibling.
    #[arg(long)]
    not_limited: bool,
    /// Your copy is hand/stamp numbered.
    #[arg(long)]
    numbered: bool,
    /// Number of LPs (vinyl).
    #[arg(long)]
    lps: Option<usize>,
    /// Tracks per side, e.g. "5,4" or "3,3,2,3" — overrides any guessed layout.
    #[arg(long, value_delimiter = ',')]
    sides: Option<Vec<usize>>,
    /// Runout per side, verbatim: --matrix "A=IOM773-A 1" --matrix "B=…".
    #[arg(long)]
    matrix: Vec<String>,
    /// Extra release-notes text (inserts, stickers, numbering…).
    #[arg(long)]
    notes: Option<String>,
    /// Discogs release id to start from instead of the auto-picked closest version.
    #[arg(long)]
    base: Option<u64>,
    /// Put reference durations (MusicBrainz / Apple Music / Spotify) in the duration field,
    /// with the Submission Notes line RSG §12.6.4 requires. Off by default: timings should come
    /// from the release itself.
    #[arg(long)]
    fill_durations: bool,
    /// Ask for the details of your copy (barcode, colour, sides, runouts…).
    #[arg(short, long)]
    interactive: bool,
    /// Build a draft even if the barcode is already on Discogs.
    #[arg(long)]
    force: bool,
    /// Output folder (default: discogs-sub/drafts).
    #[arg(long)]
    out: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let cfg = scrapper::Config::load(cli.config.as_deref()).context("loading scrapper config")?;
    let clients = Clients::new(&cfg);
    match cli.command {
        Command::Check { barcode } => check(&clients, &barcode).await,
        Command::Draft(args) => draft_cmd(&clients, *args).await,
    }
}

async fn check(c: &Clients, barcode: &str) -> Result<()> {
    let hits = sources::barcode_hits(c, barcode).await?;
    if hits.is_empty() {
        println!("Not on Discogs: no release carries {barcode}.");
    } else {
        print_hits(&hits);
    }
    for r in c.mb.releases_by_barcode(&rules::digits(barcode)).await.unwrap_or_default() {
        println!(
            "MusicBrainz: {} — {} ({}) https://musicbrainz.org/release/{}",
            r.get("title").and_then(|t| t.as_str()).unwrap_or(""),
            musicbrainz::media_formats(&r).join(" + "),
            r.get("disambiguation").and_then(|t| t.as_str()).unwrap_or(""),
            r.get("id").and_then(|t| t.as_str()).unwrap_or("")
        );
    }
    Ok(())
}

fn print_hits(hits: &[serde_json::Value]) {
    println!("Already on Discogs:");
    for h in hits {
        println!(
            "  r{} {} — {} https://www.discogs.com/release/{}",
            h.get("id").and_then(|i| i.as_i64()).unwrap_or(0),
            h.get("title").and_then(|t| t.as_str()).unwrap_or(""),
            h.get("format").and_then(|f| f.as_array()).map(|f| f.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join(", ")).unwrap_or_default(),
            h.get("id").and_then(|i| i.as_i64()).unwrap_or(0),
        );
    }
}

async fn draft_cmd(c: &Clients, a: DraftArgs) -> Result<()> {
    let mut hand = InHand {
        barcode: a.barcode.clone(),
        colour: a.colour.clone(),
        weight: a.weight.clone(),
        limited: if a.limited { Some(true) } else if a.not_limited { Some(false) } else { None },
        numbered: a.numbered,
        lps: a.lps,
        sides: a.sides.clone(),
        matrix: parse_matrix(&a.matrix)?,
        notes: a.notes.clone(),
        fill_durations: a.fill_durations,
    };

    if a.interactive && hand.barcode.is_none() {
        let b: String = Input::new().with_prompt("Barcode on your copy (blank to skip)").allow_empty(true).interact_text()?;
        hand.barcode = Some(b).filter(|b| !b.trim().is_empty());
    }

    let base = a.base.map(|b| b.to_string());
    let g = sources::gather(c, &a.artist, &a.title, a.format, hand.barcode.as_deref(), base.as_deref()).await?;
    if !g.barcode_hits.is_empty() {
        print_hits(&g.barcode_hits);
        let go_on = a.force
            || (a.interactive && Confirm::new().with_prompt("That barcode is already on Discogs (another variant may share it). Draft anyway?").default(false).interact()?);
        if !go_on {
            bail!("barcode already on Discogs — add that release to your collection instead (or rerun with --force)");
        }
    }
    for s in &g.skipped {
        eprintln!("  ! {s}");
    }

    let query = |hand: &InHand| Query { artist: a.artist.clone(), title: a.title.clone(), family: a.format, in_hand: hand.clone() };
    let mut d = draft::build(&g, query(&hand), a.base);

    if a.interactive {
        ask_in_hand(&mut hand, &d, a.format)?;
        d = draft::build(&g, query(&hand), a.base);
        if a.format.has_sides() {
            for side in draft::sides_of(&d.tracklist) {
                if hand.matrix.iter().any(|(s, _)| *s == side) {
                    continue;
                }
                let text: String = Input::new().with_prompt(format!("Side {side} runout, verbatim (blank to skip)")).allow_empty(true).interact_text()?;
                if !text.trim().is_empty() {
                    hand.matrix.push((side, text.trim().to_string()));
                }
            }
            d = draft::build(&g, query(&hand), a.base);
        }
    }

    let out = a.out.clone().unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("drafts"));
    let dir = out.join(slug(&format!("{} {} {}", a.artist, a.title, a.format.discogs_name())));
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join("draft.json"), serde_json::to_string_pretty(&d)?)?;
    std::fs::write(dir.join("draft.md"), render::markdown(&d))?;

    println!("\n{} – {}", d.artists.iter().map(|x| x.name.as_str()).collect::<Vec<_>>().join(", "), d.title);
    match &d.base {
        Some(b) => println!("  closest Discogs version: r{} — {}", b.id, b.summary),
        None => println!("  no version on Discogs yet — new submission"),
    }
    println!("  {} tracks, {} credits, {} companies", d.tracklist.iter().filter(|t| t.type_ == "track").count(), d.extraartists.len(), d.companies.len());
    for f in d.flags.iter().filter(|f| f.level == draft::Level::Todo) {
        println!("  TODO {}: {}", f.field, f.message);
    }
    println!("\n  {}\n  {}", dir.join("draft.md").display(), dir.join("draft.json").display());
    Ok(())
}

/// Prompts for what only the copy in hand can tell us, using the first draft for defaults.
fn ask_in_hand(hand: &mut InHand, d: &draft::Draft, family: Family) -> Result<()> {
    eprintln!();
    if let Some(b) = &d.base {
        eprintln!("Closest Discogs version: r{} — {}", b.id, b.summary);
    }
    for h in d.hints.iter().filter(|h| h.starts_with("MusicBrainz lists")) {
        eprintln!("  {h}");
    }
    if family == Family::Vinyl && hand.colour.is_none() {
        let c: String = Input::new().with_prompt("Vinyl colour, most distinctive word first (blank = black)").allow_empty(true).interact_text()?;
        hand.colour = Some(c.trim().to_string()).filter(|c| !c.is_empty());
    }
    if hand.limited.is_none() {
        let pick = Select::new()
            .with_prompt("\"Limited\" printed on the release / stated by the label?")
            .items(["Leave as the sibling has it", "Yes", "No"])
            .default(0)
            .interact()?;
        hand.limited = [None, Some(true), Some(false)][pick];
    }
    if !hand.numbered {
        hand.numbered = Confirm::new().with_prompt("Is your copy numbered?").default(false).interact()?;
    }
    if family.has_sides() && hand.sides.is_none() {
        let layout: Vec<String> = draft::sides_of(&d.tracklist)
            .iter()
            .map(|s| d.tracklist.iter().filter(|t| t.position.starts_with(s.as_str())).count().to_string())
            .collect();
        let tracks = d.tracklist.iter().filter(|t| t.type_ == "track").count();
        let answer: String = Input::new()
            .with_prompt(format!("Tracks per side for {tracks} tracks (blank keeps {})", layout.join(",")))
            .allow_empty(true)
            .interact_text()?;
        if !answer.trim().is_empty() {
            let counts: Vec<usize> = answer.split(',').map(|n| n.trim().parse()).collect::<Result<_, _>>().context("tracks per side must be numbers like 5,4")?;
            if counts.iter().sum::<usize>() != tracks {
                bail!("{} tracks per side don't add up to {tracks}", answer.trim());
            }
            hand.lps = Some(counts.len().div_ceil(2));
            hand.sides = Some(counts);
        }
    }
    if hand.notes.is_none() {
        let n: String = Input::new().with_prompt("Anything else on your copy for the notes (inserts, stickers…)? blank to skip").allow_empty(true).interact_text()?;
        hand.notes = Some(n.trim().to_string()).filter(|n| !n.is_empty());
    }
    if !hand.fill_durations && d.tracklist.iter().all(|t| t.duration.is_empty()) && d.tracklist.iter().any(|t| !t.reference_durations.is_empty()) {
        hand.fill_durations = Confirm::new()
            .with_prompt("No printed durations. Fill them from streaming/MusicBrainz times (noted in Submission Notes)?")
            .default(false)
            .interact()?;
    }
    Ok(())
}

fn parse_matrix(items: &[String]) -> Result<Vec<(String, String)>> {
    items
        .iter()
        .map(|m| {
            let (side, text) = m.split_once('=').with_context(|| format!("--matrix \"{m}\" must look like A=<runout text>"))?;
            Ok((side.trim().to_uppercase(), text.trim().to_string()))
        })
        .collect()
}

fn slug(s: &str) -> String {
    let mut out = String::new();
    for ch in s.to_lowercase().replace('&', "and").chars() {
        if ch.is_alphanumeric() {
            out.push(ch);
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    out.trim_matches('-').to_string()
}

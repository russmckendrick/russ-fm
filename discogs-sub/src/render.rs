//! Markdown rendering of a [`Draft`], laid out in the order of the Discogs "Add Release" form.

use std::fmt::Write;

use crate::draft::{Credit, Draft, Level};

fn esc(s: &str) -> String {
    s.replace('|', "\\|")
}

fn artist_name(c: &Credit) -> String {
    let link = c.id.filter(|i| *i > 0).map(|id| format!(" [a{id}]")).unwrap_or_else(|| " *(not linked)*".into());
    if c.anv.is_empty() {
        format!("{}{link}", c.name)
    } else {
        format!("{} as \"{}\"{link}", c.name, c.anv)
    }
}

fn credit_line(credits: &[Credit]) -> String {
    credits
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let join = if i + 1 < credits.len() { format!(" {} ", if c.join.is_empty() { "," } else { &c.join }) } else { String::new() };
            format!("{}{}", if c.anv.is_empty() { &c.name } else { &c.anv }, join)
        })
        .collect::<String>()
        .replace(" , ", ", ")
}

fn flags_for(d: &Draft, field: &str, out: &mut String) {
    for f in d.flags.iter().filter(|f| f.field == field) {
        let tag = match f.level {
            Level::Todo => "**TODO**",
            Level::Verify => "*Verify*",
        };
        let _ = writeln!(out, "> {tag} — {}", f.message);
    }
}

pub fn markdown(d: &Draft) -> String {
    let mut o = String::new();
    let artist = credit_line(&d.artists);
    let _ = writeln!(o, "# {artist} – {} · Discogs draft\n", d.title);
    let _ = writeln!(
        o,
        "Your copy: **{}**{}{} · generated {}\n",
        d.query.family.discogs_name(),
        d.query.in_hand.colour.as_deref().map(|c| format!(", {c}")).unwrap_or_default(),
        d.query.in_hand.barcode.as_deref().map(|b| format!(", barcode {b}")).unwrap_or_default(),
        &d.generated_at[..16.min(d.generated_at.len())]
    );

    let todo = d.flags.iter().filter(|f| f.level == Level::Todo).count();
    let verify = d.flags.iter().filter(|f| f.level == Level::Verify).count();
    let _ = writeln!(o, "**{todo} to fill from the record · {verify} to check against it.** Nothing below has been submitted — Discogs has no API for adding releases.\n");

    // Fastest route.
    if !d.copy_to_draft_edits.is_empty() {
        let _ = writeln!(o, "## Fastest route: Copy to Draft\n");
        if let Some(b) = &d.base {
            let _ = writeln!(o, "Closest existing version: [r{}]({}) — {}\n", b.id, b.url, b.summary);
        }
        for (i, e) in d.copy_to_draft_edits.iter().enumerate() {
            let _ = writeln!(o, "{}. {e}", i + 1);
        }
        let _ = writeln!(o);
    } else {
        let _ = writeln!(o, "## Route\n\nNo version is on Discogs yet — start a new submission at https://www.discogs.com/release/add and enter the fields below (Save Draft keeps it in https://www.discogs.com/users/drafts).\n");
    }

    let _ = writeln!(o, "## Artist\n");
    for a in &d.artists {
        let _ = writeln!(o, "- {}{}", artist_name(a), if a.join.is_empty() || a.join == "," { String::new() } else { format!(" — join \"{}\"", a.join) });
    }
    flags_for(d, "artists", &mut o);

    let _ = writeln!(o, "\n## Title\n\n{}\n", d.title);

    let _ = writeln!(o, "## Label / Catalog#\n");
    for l in &d.labels {
        let _ = writeln!(o, "- {}{} — `{}`", l.name, l.id.filter(|i| *i > 0).map(|i| format!(" [l{i}]")).unwrap_or_default(), if l.catno.is_empty() { "?" } else { &l.catno });
    }
    flags_for(d, "labels", &mut o);

    let _ = writeln!(o, "\n## Format\n");
    for f in &d.formats {
        let _ = writeln!(o, "- {} × **{}** — {}{}", f.qty, f.name, f.descriptions.join(", "), if f.text.is_empty() { String::new() } else { format!(" — free text: \"{}\"", f.text) });
    }
    flags_for(d, "formats", &mut o);

    let _ = writeln!(o, "\n## Country / Released\n\n- Country: {}\n- Released: {}", or_blank(&d.country), or_blank(&d.released));
    flags_for(d, "country", &mut o);
    flags_for(d, "released", &mut o);

    let _ = writeln!(o, "\n## Genre / Style\n\n- Genre: {}\n- Style: {}", or_blank(&d.genres.join(", ")), or_blank(&d.styles.join(", ")));
    flags_for(d, "genres", &mut o);

    let _ = writeln!(o, "\n## Tracklist\n");
    let any_artists = d.tracklist.iter().any(|t| !t.artists.is_empty());
    let _ = writeln!(o, "| Pos |{} Title | Credits | Duration | Reference times |", if any_artists { " Artist |" } else { "" });
    let _ = writeln!(o, "|---|{}---|---|---|---|", if any_artists { "---|" } else { "" });
    for t in &d.tracklist {
        let credits = t.extraartists.iter().map(|c| format!("{} – {}", c.role, c.name)).collect::<Vec<_>>().join("<br>");
        let refs = t.reference_durations.iter().map(|(s, d)| format!("{d} {}", short(s))).collect::<Vec<_>>().join(" · ");
        let title = if t.type_ == "heading" { format!("**{}** *(heading)*", t.title) } else { t.title.clone() };
        let _ = writeln!(
            o,
            "| {} |{} {} | {} | {} | {} |",
            t.position,
            if any_artists { format!(" {} |", esc(&credit_line(&t.artists))) } else { String::new() },
            esc(&title),
            esc(&credits),
            t.duration,
            refs
        );
    }
    let _ = writeln!(o);
    flags_for(d, "tracklist", &mut o);

    let _ = writeln!(o, "\nReference times: MB MusicBrainz · AM Apple Music · SP Spotify · rNNN another Discogs version.");
    let _ = writeln!(o, "\n## Credits\n");
    if d.extraartists.is_empty() {
        let _ = writeln!(o, "*(none)*");
    } else {
        let _ = writeln!(o, "| Role | Name | Tracks |\n|---|---|---|");
        for c in &d.extraartists {
            let _ = writeln!(o, "| {} | {} | {} |", esc(&c.role), esc(&artist_name(c)), if c.tracks.is_empty() { "all" } else { &c.tracks });
        }
    }
    flags_for(d, "credits", &mut o);

    let _ = writeln!(o, "\n## Companies\n");
    if d.companies.is_empty() {
        let _ = writeln!(o, "*(none)*");
    }
    for c in &d.companies {
        let _ = writeln!(o, "- {} — {}{}", c.entity_type_name, c.name, c.id.filter(|i| *i > 0).map(|i| format!(" [l{i}]")).unwrap_or_default());
    }
    flags_for(d, "companies", &mut o);

    let _ = writeln!(o, "\n## Barcode and Other Identifiers\n\n| Type | Value | Description |\n|---|---|---|");
    for i in &d.identifiers {
        let _ = writeln!(o, "| {} | {} | {} |", i.kind, if i.value.is_empty() { "**← from your copy**".into() } else { format!("`{}`", i.value) }, i.description);
    }
    flags_for(d, "identifiers", &mut o);

    let _ = writeln!(o, "\n## Release Notes\n\n```\n{}\n```", d.notes);
    flags_for(d, "notes", &mut o);

    let _ = writeln!(o, "\n## Images\n\nYour own photos only (§13.1.4): front, back, both labels, runouts, inserts.\n");

    let _ = writeln!(o, "## Submission Notes\n\n```\n{}\n```\n", d.submission_notes);

    if !d.hints.is_empty() {
        let _ = writeln!(o, "## Hints from other sources\n");
        for h in &d.hints {
            let _ = writeln!(o, "- {h}");
        }
        let _ = writeln!(o);
    }

    let _ = writeln!(o, "## Sources\n");
    if let Some(m) = &d.master_id {
        let _ = writeln!(o, "- Discogs master: https://www.discogs.com/master/{m}");
    }
    for s in &d.siblings {
        let _ = writeln!(o, "- [r{}]({}) — {}", s.id, s.url, s.summary);
    }
    for (src, url) in &d.references {
        let _ = writeln!(o, "- {src}: {url}");
    }
    o
}

fn or_blank(s: &str) -> &str {
    if s.is_empty() {
        "*(blank)*"
    } else {
        s
    }
}

fn short(source: &str) -> &str {
    match source {
        "MusicBrainz" => "MB",
        "Apple Music" => "AM",
        "Spotify" => "SP",
        // Discogs versions are already short ("r38574621").
        other => other,
    }
}

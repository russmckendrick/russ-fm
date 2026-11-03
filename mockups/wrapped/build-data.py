#!/usr/bin/env python3
"""Flatten each public/wrapped/wrapped-YYYY.json plus the album, artist and explore
data it points at into mockups/wrapped/data/YYYY.json for the Wrapped mockup.

Run from the repo root:  python3 mockups/wrapped/build-data.py
"""
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "public"
OUT = Path(__file__).resolve().parent / "data"
UK = ZoneInfo("Europe/London")

VOCAB = json.loads((ROOT / "src/config/vinyl-colours.json").read_text())
COLOURS = VOCAB["colours"]
PATTERN_WORDS = {w: k for k, words in VOCAB["patterns"].items() for w in words} if isinstance(VOCAB["patterns"], dict) else {w: w for w in VOCAB["patterns"]}


def load(p):
    try:
        return json.loads(Path(p).read_text())
    except (OSError, ValueError):
        return None


def vinyl(text):
    """Discogs colour text -> {n, hex, glass, see, pat}; None when it names no colour."""
    low = text.lower()
    words = re.findall(r"[a-z]+", low)
    glass = any(w in VOCAB["glass"] for w in words)
    see = glass or any(w in VOCAB["translucent"] for w in words)
    pat = next((k for w in words for p, k in PATTERN_WORDS.items() if w.startswith(p)), None)
    hexes = []
    for ph in VOCAB["phrases"]:
        if ph in low and isinstance(VOCAB["phrases"], dict):
            hexes.append(VOCAB["phrases"][ph])
    hexes += [COLOURS[w] for w in words if w in COLOURS and w != "black"]
    if "black" in words and not hexes:
        hexes = [COLOURS["black"]] if pat else []
    if not hexes and not glass:
        return None
    return {"n": text, "hex": hexes[:3] or ["#dfe6ea"], "glass": glass, "see": see, "pat": pat}


def secs(d):
    m = re.match(r"^(\d+):(\d\d)(?::(\d\d))?$", d or "")
    if not m:
        return 0
    a, b, c = m.groups()
    return int(a) * 3600 + int(b) * 60 + int(c) if c else int(a) * 60 + int(b)


def pressing(fd):
    """(discs, size, grams) from Discogs format_details."""
    discs, size, grams = 0, '12"', 0
    for f in fd or []:
        if (f.get("name") or "").lower() not in ("vinyl", "lp"):
            continue
        q = int(re.sub(r"\D", "", str(f.get("qty") or "1")) or 1)
        desc = " ".join(f.get("descriptions") or []) + " " + (f.get("text") or "")
        s = '7"' if '7"' in desc else '10"' if '10"' in desc else '12"'
        g = re.search(r"(\d{3})\s?g", desc)
        per = int(g.group(1)) if g else {'7"': 42, '10"': 100}.get(s, 140)
        discs += q
        size = s
        grams += q * per
    return discs, size, grams


def main():
    OUT.mkdir(exist_ok=True)
    explore = load(PUB / "explore/explore.json")
    ex_albums = {a["slug"]: a for a in explore["albums"]}
    ex_artists = explore["artists"]
    ex_index = {a["slug"]: i for i, a in enumerate(ex_artists)}
    families = explore["families"]
    collection = load(PUB / "collection.json")

    # First year each artist turned up in the collection
    first_year = {}
    for r in collection:
        y = int(r["date_added"][:4])
        for a in r["artists"]:
            s = a["uri_artist"].strip("/").split("/")[-1]
            first_year[s] = min(first_year.get(s, 9999), y)
    per_year = Counter(int(r["date_added"][:4]) for r in collection)

    for wf in sorted((PUB / "wrapped").glob("wrapped-20*.json")):
        w = load(wf)
        year = w["year"]
        rels, artist_count = [], Counter()
        for item in w["releases"]:
            r = item["release"]
            d = load(PUB / f"album/{r['slug']}/{r['slug']}.json") or {}
            ex = ex_albums.get(r["slug"], {})
            when = None
            if d.get("date_added") and "T" in d["date_added"]:
                when = datetime.fromisoformat(d["date_added"]).astimezone(UK)
            tracks = d.get("tracklist") or []
            timed = [secs(t.get("duration")) for t in tracks]
            known = sum(1 for t in timed if t)
            runtime = sum(timed) if tracks and known >= len(tracks) * 0.6 else None
            discs, size, grams = pressing(d.get("format_details"))
            descs = {x for f in d.get("format_details") or [] for x in f.get("descriptions") or []}
            credits = d.get("credits") or []
            role = lambda *names: sorted({c["name"] for c in credits if any(n in c.get("role", "") for n in names)})
            col = r.get("colors") or {}
            slugs = [a["slug"] for a in r["artists"]]
            for s in slugs:
                artist_count[s] += 1
            rels.append({
                "s": r["slug"], "t": r["release_name"], "by": r["release_artist"], "a": slugs,
                "d": r["date_added"], "h": round(when.hour + when.minute / 60, 2) if when else None,
                "wd": when.weekday() if when else None,
                "y": r.get("year_original") or (int(d["year"]) if str(d.get("year", "")).isdigit() else None),
                "g": r["genre_names"], "st": d.get("styles") or [], "fam": ex.get("fam"),
                "c": {k: col.get(k) for k in ("flood", "ink", "ground", "secondary", "hue", "vivid")},
                "img": r["images"]["medium"], "rt": runtime, "tracks": len(tracks),
                "discs": discs or 1, "size": size, "g_wt": grams or 140,
                "vc": [v for v in (vinyl(t) for t in d.get("vinyl_colours") or []) if v],
                "ed": sorted(descs & {"Limited Edition", "Reissue", "Record Store Day", "Remastered", "Compilation",
                                       "Deluxe Edition", "Numbered", "Picture Disc", "45 RPM", "Repress", "Special Edition", "Box Set"}),
                "lab": (d.get("labels") or [None])[0], "ctry": d.get("country"),
                "cut": role("Lacquer Cut"), "mas": role("Mastered", "Remastered"), "prod": role("Producer"),
                "lis": ex.get("lis"),
            })

        artists = []
        for s, n in artist_count.most_common():
            meta = load(PUB / f"artist/{s}/{s}-image.json") or {}
            info = ex_artists[ex_index[s]] if s in ex_index else {}
            fan = meta.get("fanart") or {}
            artists.append({
                "s": s, "name": next(a["name"] for x in w["releases"] for a in x["release"]["artists"] if a["slug"] == s),
                "n": n, "new": first_year.get(s) == year,
                "avatar": f"/artist/{s}/{s}-avatar.jpg", "photo": f"/artist/{s}/{s}-medium.jpg",
                "fanart": f"/artist/{s}/{fan['file']}" if fan.get("file") else None,
                "focus": meta.get("focus"), "from": info.get("from"), "formed": info.get("formed"),
                "cc": info.get("cc"),
            })

        # Links touching this year's artists, from the explore graph
        mine = {ex_index[a["s"]] for a in artists if a["s"] in ex_index}
        touching = [l for l in explore["links"] if l["a"] in mine or l["b"] in mine]
        # Keep every link inside the year, plus the 40 older artists most tied into it.
        reach = Counter(x for l in touching for x in (l["a"], l["b"]) if x not in mine)
        keep = {i for i, _ in reach.most_common(40)}
        links, seen = [], set()
        for l in touching:
            key = tuple(sorted((l["a"], l["b"])))
            if key in seen or not ({l["a"], l["b"]} <= mine | keep):
                continue
            seen.add(key)
            links.append({"a": ex_artists[l["a"]]["slug"], "b": ex_artists[l["b"]]["slug"],
                          "type": l["why"][0]["type"], "who": l["why"][0].get("who")})
        others = {x for l in links for x in (l["a"], l["b"])} - {a["s"] for a in artists}
        outside = [{"s": s, "name": ex_artists[ex_index[s]]["name"], "avatar": f"/artist/{s}/{s}-avatar.jpg"} for s in sorted(others)]

        out = {
            "year": year, "ytd": w.get("isYearToDate", False), "summary": w["summary"],
            "families": families, "releases": rels, "artists": artists,
            "links": links, "outside": outside,
            "perYear": {str(y): per_year[y] for y in sorted(per_year)},
        }
        (OUT / f"{year}.json").write_text(json.dumps(out, separators=(",", ":")))
        print(year, len(rels), "releases,", len(artists), "artists,", len(links), "links,", sum(1 for r in rels if r["rt"]), "timed")


if __name__ == "__main__":
    main()

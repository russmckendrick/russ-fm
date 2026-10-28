#!/usr/bin/env python3
"""Build the shared data for the /explore prototypes.

Reads the static site data in public/ and writes, into mockups/explore/data/:

  explore.json      albums, artists, people and artist-to-artist links
  sleeves-N.jpg     128px sleeve atlases, 32 x 32 cells per sheet
  avatars.jpg       64px artist avatar atlas, 40 columns

Run from the repo root:  python3 mockups/explore/build-data.py
"""
import glob
import json
import os
import re
from collections import defaultdict

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PUB = os.path.join(ROOT, 'public')
OUT = os.path.join(ROOT, 'mockups', 'explore', 'data')
os.makedirs(OUT, exist_ok=True)

SLEEVE = 128
SLEEVE_COLS = 32
AVATAR = 64
AVATAR_COLS = 40

# Same taxonomy as src/lib/genreFamilies.ts, in disc order.
FAMILIES = [
    ('prog', 'Prog & Psych', ['Prog Rock', 'Art Rock', 'Psychedelic Rock', 'Space Rock', 'Krautrock', 'Symphonic Rock', 'Progressive Metal', 'Post Rock', 'Neo-Classical', 'Math Rock', 'Acid Rock']),
    ('hard', 'Hard Rock & Metal', ['Hard Rock', 'Heavy Metal', 'Thrash', 'Stoner Rock', 'Arena Rock', 'Glam', 'Classic Rock', 'Southern Rock', 'Blues Rock', 'Rock & Roll', 'Doom Metal', 'Speed Metal', 'Sludge Metal', 'Groove Metal', 'Pub Rock', 'Rockabilly', 'AOR']),
    ('pop', 'Pop', ['Pop Rock', 'Soft Rock', 'Ballad', 'Vocal', 'Europop', 'Beat', 'Chanson', 'Dance-pop', 'Alt-Pop', 'Schlager', 'Pop/Rock', 'Pop']),
    ('folk', 'Folk & Country', ['Folk Rock', 'Acoustic', 'Folk', 'Country', 'Country Rock', 'Americana', 'Celtic', 'Bluegrass', 'Singer/Songwriter', 'Folk, World, & Country']),
    ('soul', 'Soul, Funk & Jazz', ['Soul', 'Rhythm & Blues', 'Funk', 'Disco', 'Jazz-Funk', 'Acid Jazz', 'Neo Soul', 'Gospel', 'RnB/Swing', 'Northern Soul', 'P.Funk', 'Jazz-Rock', 'Fusion', 'Contemporary Jazz', 'Soul-Jazz', 'Hard Bop', 'Bop', 'Modal', 'Smooth Jazz', 'Swing', 'Electric Blues', 'Modern Electric Blues', 'Chicago Blues', 'Country Blues', 'Funk / Soul', 'Jazz', 'Blues', 'Latin']),
    ('hiphop', 'Hip Hop & Reggae', ['Conscious', 'Boom Bap', 'Gangsta', 'Pop Rap', 'Jazzy Hip-Hop', 'Turntablism', 'Reggae', 'Dub', 'Roots Reggae', 'Rocksteady', 'Dancehall', 'Hip Hop']),
    ('screen', 'Stage & Screen', ['Soundtrack', 'Score', 'Comedy', 'Musical', 'Theme', 'Spoken Word', 'Modern Classical', 'Contemporary', 'Stage & Screen', 'Classical', 'Non-Music']),
    ('elec', 'Electronic', ['Ambient', 'Leftfield', 'Downtempo', 'Techno', 'House', 'Breakbeat', 'Trip Hop', 'Abstract', 'Experimental', 'IDM', 'Big Beat', 'Acid House', 'Electronica', 'Drum n Bass', 'Trance', 'Dub Techno', 'Synthwave', 'Breaks', 'Musique Concrète', 'Drone', 'Berlin-School', 'Chillwave', 'Avantgarde', 'Electronic']),
    ('wave', 'Synth & New Wave', ['New Wave', 'Synth-pop', 'Electro', 'Post-Punk', 'Darkwave', 'Minimal', 'Coldwave', 'Italo-Disco', 'Hi NRG', 'EBM', 'Electroclash', 'Ethereal']),
    ('punk', 'Punk & Ska', ['Punk', 'Ska', 'Pop Punk', 'Hardcore', 'Oi', 'Emo', 'Garage Rock', 'Mod']),
    ('indie', 'Indie & Britpop', ['Indie Rock', 'Indie Pop', 'Britpop', 'Lo-Fi', 'Power Pop', 'Jangle Pop', 'Twee Pop', 'Madchester', 'Baggy']),
    ('alt', 'Alternative', ['Alternative Rock', 'Grunge', 'Shoegaze', 'Industrial', 'Funk Metal', 'Nu Metal', 'Alternative Metal', 'Noise', 'Goth Rock', 'Alternative']),
]
TERM = {}
for key, _, terms in FAMILIES:
    for t in terms:
        TERM.setdefault(t, key)


def family_of(styles, genres):
    for t in styles or []:
        if t in TERM:
            return TERM[t]
    for t in genres or []:
        if t in TERM:
            return TERM[t]
    return 'hard' if 'Rock' in (genres or []) else 'pop'


def slug_of(uri):
    return uri.strip('/').split('/')[-1]


def load(path):
    with open(path) as fh:
        return json.load(fh)


def year_int(v):
    try:
        y = int(str(v)[:4])
        return y if 1900 < y < 2100 else None
    except (TypeError, ValueError):
        return None


def yt_id(uri):
    m = re.search(r'(?:v=|youtu\.be/)([\w-]{11})', uri or '')
    return m.group(1) if m else None


collection = load(os.path.join(PUB, 'collection.json'))
colours = load(os.path.join(PUB, 'album-colors.json'))
tv = {r['uri']: r for r in load(os.path.join(PUB, 'tv.json'))['releases']}

# ---- artists ------------------------------------------------------------
artist_slugs = sorted({slug_of(a['uri_artist']) for c in collection for a in c.get('artists') or [] if a.get('uri_artist')})
artists, a_index, by_name, by_discogs = [], {}, {}, {}
raw_discogs = {}
for slug in artist_slugs:
    path = os.path.join(PUB, 'artist', slug, slug + '.json')
    if not os.path.exists(path):
        continue
    d = load(path)
    rd = d.get('raw_data') or {}
    dg = (rd.get('discogs') or {}).get('raw_data') or {}
    tadb = rd.get('theaudiodb') or {}
    img_path = os.path.join(PUB, 'artist', slug, slug + '-image.json')
    img = load(img_path) if os.path.exists(img_path) else {}
    fan = img.get('fanart') or {}
    fanart = sorted(int(m.group(1)) for f in glob.glob(os.path.join(PUB, 'artist', slug, slug + '-fanart0*.jpg'))
                    if (m := re.search(r'fanart0(\d)\.jpg$', f)))
    vids = []
    for v in (rd.get('theaudiodb_videos') or []) + (rd.get('wikidata_videos') or []):
        vid = yt_id(v.get('uri'))
        if vid and vid not in [x[0] for x in vids]:
            vids.append([vid, v.get('track') or '', v.get('album') or ''])
    bio = (d.get('biography') or tadb.get('biography_en') or '').replace('\r', '').strip()
    entry = {
        'slug': slug,
        'name': d.get('name') or slug,
        'bio': bio[:420],
        'genre': tadb.get('genre') or (d.get('genres') or [None])[0],
        'style': tadb.get('style'),
        'mood': tadb.get('mood'),
        'cc': tadb.get('country_code'),
        'from': tadb.get('country'),
        'born': year_int(tadb.get('born_year')),
        'formed': year_int(tadb.get('formed_year')),
        'died': year_int(tadb.get('died_year')),
        'followers': d.get('followers') or 0,
        'pop': d.get('popularity') or 0,
        'fanart': fanart,
        'focus': fan.get('salient') and [round((fan['salient'][0] + fan['salient'][2] / 2), 3), round((fan['salient'][1] + fan['salient'][3] / 3), 3)] or img.get('focus'),
        'tone': (img.get('backdrop') or {}).get('tone'),
        'members': [m.get('name') for m in dg.get('members') or []][:12],
        'videos': vids[:8],
        'records': [],
    }
    a_index[slug] = len(artists)
    artists.append(entry)
    by_name[entry['name'].lower()] = slug
    if d.get('discogs_id'):
        by_discogs[str(d['discogs_id'])] = slug
    raw_discogs[slug] = dg

# ---- albums -------------------------------------------------------------
albums = []
guest_edges = []
for c in collection:
    slug = slug_of(c['uri_release'])
    pal = colours.get(c['uri_release']) or {}
    a_slugs = [slug_of(a['uri_artist']) for a in c.get('artists') or [] if a.get('uri_artist') and slug_of(a['uri_artist']) in a_index]
    t = tv.get(c['uri_release']) or {}
    vids = [[v['id'], v.get('title') or '', v.get('kind') or ''] for v in (t.get('videos') or [])]
    vids.sort(key=lambda v: {'video': 0, 'live': 1}.get(v[2], 2))
    i = len(albums)
    albums.append({
        'slug': slug,
        't': c.get('release_name'),
        'by': c.get('release_artist'),
        'a': [a_index[s] for s in a_slugs],
        'y': c.get('year_original') or year_int(c.get('date_release_year')),
        'added': c.get('date_added'),
        'g': c.get('genre_names') or [],
        's': c.get('styles') or [],
        'l': c.get('labels') or [],
        'c': c.get('country'),
        'fam': family_of(c.get('styles'), c.get('genre_names')),
        'fmt': c.get('format_primary'),
        'vc': (c.get('vinyl_colours') or [None])[0],
        'lis': c.get('lastfm_listeners') or 0,
        'fl': pal.get('flood') or '#777777',
        'ink': pal.get('ink') or '#ffffff',
        'gr': pal.get('ground') or '#111111',
        'h': pal.get('hue') if pal.get('hue') is not None else 0,
        'viv': pal.get('vivid') or 1,
        'v': vids[:5],
    })
    for s in a_slugs:
        artists[a_index[s]]['records'].append(i)
    # guests credited on individual tracks
    path = os.path.join(PUB, 'album', slug, slug + '.json')
    if os.path.exists(path):
        d = load(path)
        guests = set()
        for tr in d.get('tracklist') or []:
            for ta in tr.get('artists') or []:
                name = (ta.get('name') if isinstance(ta, dict) else ta) or ''
                g = by_name.get(re.sub(r'\s*\(\d+\)$', '', name).lower())
                if g and g not in a_slugs:
                    guests.add((g, tr.get('title') or ''))
        for g, track in guests:
            for s in a_slugs:
                guest_edges.append((s, g, i, track))

# ---- links between artists ---------------------------------------------
links = defaultdict(list)  # (a, b) sorted -> [reason]


def add(a, b, reason):
    if a == b or 'various' in (a, b):
        return
    if reason.get('who'):
        reason['who'] = re.sub(r'\s*\(\d+\)$', '', reason['who'])
    key = tuple(sorted((a, b)))
    if reason not in links[key]:
        links[key].append(reason)


people = defaultdict(lambda: {'name': '', 'thumb': None, 'bands': set()})
for slug, dg in raw_discogs.items():
    for kind in ('members', 'groups', 'aliases'):
        for m in dg.get(kind) or []:
            mid = str(m.get('id'))
            other = by_discogs.get(mid)
            if other and other != slug:
                rel = {'members': 'member', 'groups': 'group', 'aliases': 'alias'}[kind]
                add(slug, other, {'type': rel, 'who': m.get('name'), 'from': slug})
            if kind == 'members':
                p = people[mid]
                p['name'] = re.sub(r'\s*\(\d+\)$', '', m.get('name') or '')
                p['thumb'] = p['thumb'] or m.get('thumbnail_url')
                p['bands'].add(slug)
                if other:
                    p['bands'].add(other)
    # a solo artist's own groups also count as bands for that person
    did = next((k for k, v in by_discogs.items() if v == slug), None)
    for g in dg.get('groups') or []:
        other = by_discogs.get(str(g.get('id')))
        if did and other:
            people[did]['name'] = people[did]['name'] or artists[a_index[slug]]['name']
            people[did]['bands'].update({slug, other})

people_out = []
for pid, p in people.items():
    bands = sorted(p['bands'])
    if len(bands) < 2:
        continue
    people_out.append({'id': pid, 'name': p['name'], 'thumb': p['thumb'], 'bands': [a_index[b] for b in bands],
                       'artist': a_index.get(by_discogs.get(pid))})
    for x in range(len(bands)):
        for y in range(x + 1, len(bands)):
            add(bands[x], bands[y], {'type': 'bandmate', 'who': p['name']})

for s, g, i, track in guest_edges:
    add(s, g, {'type': 'guest', 'album': i, 'track': track, 'host': a_index[s], 'guest': a_index[g]})

link_out = [{'a': a_index[a], 'b': a_index[b], 'why': why} for (a, b), why in links.items()]

data = {
    'families': [{'key': k, 'name': n} for k, n, _ in FAMILIES],
    'albums': albums,
    'artists': artists,
    'people': people_out,
    'links': link_out,
    'atlas': {'sleeve': SLEEVE, 'cols': SLEEVE_COLS, 'avatar': AVATAR, 'avatarCols': AVATAR_COLS},
}
with open(os.path.join(OUT, 'explore.json'), 'w') as fh:
    json.dump(data, fh, separators=(',', ':'), ensure_ascii=False)
print(f"albums {len(albums)}  artists {len(artists)}  people {len(people_out)}  links {len(link_out)}")


# ---- atlases ------------------------------------------------------------
def thumb(path, size):
    try:
        im = Image.open(path)
        im.draft('RGB', (size * 2, size * 2))
        im = im.convert('RGB')
        w, h = im.size
        s = min(w, h)
        im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
        return im.resize((size, size), Image.LANCZOS)
    except Exception:
        return None


per = SLEEVE_COLS * SLEEVE_COLS
for sheet in range((len(albums) + per - 1) // per):
    chunk = albums[sheet * per:(sheet + 1) * per]
    rows = (len(chunk) + SLEEVE_COLS - 1) // SLEEVE_COLS
    atlas = Image.new('RGB', (SLEEVE_COLS * SLEEVE, SLEEVE_COLS * SLEEVE), (20, 20, 20))
    for n, al in enumerate(chunk):
        im = thumb(os.path.join(PUB, 'album', al['slug'], al['slug'] + '-hi-res.jpg'), SLEEVE)
        if im is None:
            im = Image.new('RGB', (SLEEVE, SLEEVE), al['fl'])
        atlas.paste(im, ((n % SLEEVE_COLS) * SLEEVE, (n // SLEEVE_COLS) * SLEEVE))
    atlas.save(os.path.join(OUT, f'sleeves-{sheet}.jpg'), quality=82, optimize=True)
    print('sleeve sheet', sheet, len(chunk), rows)

rows = (len(artists) + AVATAR_COLS - 1) // AVATAR_COLS
atlas = Image.new('RGB', (AVATAR_COLS * AVATAR, rows * AVATAR), (30, 30, 30))
for n, ar in enumerate(artists):
    base = os.path.join(PUB, 'artist', ar['slug'], ar['slug'])
    im = thumb(base + '-avatar.jpg', AVATAR) or thumb(base + '-hi-res.jpg', AVATAR)
    if im:
        atlas.paste(im, ((n % AVATAR_COLS) * AVATAR, (n // AVATAR_COLS) * AVATAR))
atlas.save(os.path.join(OUT, 'avatars.jpg'), quality=85, optimize=True)
print('avatars', len(artists))

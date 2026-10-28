# Explore: The Thread (`/explore/thread`)

A vertical feed where every card is one hop through the collection, and every card says how it follows the one before: "Tony Visconti produced "Heroes" and Electric Warrior", "Robert Fripp played in both David Bowie and King Crimson", "Also on Charisma", "Also on red vinyl". Swipe up for the next hop, sideways for another way out of the card before, tap for details. It never ends: the next card is picked as you arrive.

## Using it

| Input | Phone | Desktop |
| --- | --- | --- |
| Next / previous hop | swipe up / down | ↓ / ↑, `J` / `K`, Space / Shift+Space, PageDown / PageUp, mouse wheel (one hop per gesture) |
| Another way out (branch) | swipe sideways, or tap the "N more ways out" pill | ← / →, `H` / `L`, sideways scroll |
| Details | tap the card, or Enter | always open on the right |
| Back along the trail | tap a step in the row at the top | click a step in the column on the left |
| Copy a link to the trail | "Copy link" | "Copy link", or `C` |
| Sound on a video card | "Muted · tap for sound" | click the card, or `M` |

Escape closes the details sheet. The details sheet can also be dragged down by its top edge.

## URL parameters

| Parameter | Meaning |
| --- | --- |
| `seed=<artist-slug>` | Start from this artist. The Galaxy's "Follow the thread from here" links to `/explore/thread?seed=<artist-slug>`. |
| `album=<album-slug>` | Start from this record. |
| `trail=<slug>,<slug>,…` | A shared trail: artist and record slugs in order. It opens on the last one. |
| `r=<seed>` | The trail's random seed. With it, a shared trail replays exactly: the same cards, reasons and card types (fanart, sleeve or video). |

With none of these (plain `/explore/thread`), the feed starts from a random artist with four or more links (and a fanart hero). The page keeps the URL current with `?trail=…&r=…` (replace, not push), so the address bar is always a shareable link. A different search arriving from outside (a link to `/explore/thread`, back/forward) starts again from it. The path is `THREAD_PATH` in `thread.ts`; The Galaxy (`/explore`, `/explore/<artist-slug>`) is the default Explore page.

## Layout

- **Phone** (below 700px): the feed fills the space under the sticky nav (`100dvh - 64px`); the trail is a row of avatars and sleeves over the top of the card, and the details open in a bottom sheet.
- **Tablet** (700px up): the feed is a tall 9:16 column, centred; the details are still a sheet.
- **Desktop** (1180px up): trail column (280px) | feed column | details panel (380px).

The nav and page ground take the current card's colours through `usePageFlood`: a record's own flood, ink and ground, or an artist's newest record's.

## Cards

| View | When | What it shows |
| --- | --- | --- |
| `fanart` | artists with a fanart hero | `fanartUrl(artist)` (the one hero file on R2), placed on `artist.focus` |
| `photo` | artists without one | `artistPhotoUrl(artist, 'hi-res')` |
| `sleeve` | records | the medium sleeve on the record's flood (`fl`, text in `ink`) |
| `video` | now and then for rhythm (never two in a row), and on "on film" hops | a muted, looping YouTube embed over a poster that crops YouTube's letterbox; plays only on the current, settled card, and never autoplays under reduced motion |

Each card has the connection line at the top: the hop number, a short label ("Shared member", "Same credit", "Label"), the sentence, and the person's Discogs photo when the link runs through one person. Below it is a "N more ways out" pill with dots. At the bottom are the title (`FitTitle`, `.t-disp` for artists, `.t-cond` for records), the artist line, mono meta, and "Next: …", which is how the following card connects.

## Picking hops: `src/lib/explore/thread.ts`

Pure and unit tested (`src/lib/__tests__/exploreThread.test.ts`).

- **From an artist** (`artistOuts`): every linked artist with its strongest reason (`sortReasons`/`reasonWeight` from `data.ts`, so bandmates and members first, then credits), the record they are credited on (`credit`), the other artist's record for a `shared-credit`, guest spots, up to four of their own records, and one of their records as a video.
- **From a record** (`albumOuts`):
  - its guests
  - the collection artists credited on it
  - another record by someone credited on this one (`same-credit`, "same producer" and the like, built from `people[].credits` via `creditsOn`, without needing an artist link)
  - its artist
  - the same label (preferring the same year)
  - the same vinyl colour family (`colourTags` from `src/lib/vinylLook.ts`)
  - the rarest shared style
  - the same year and genre family
- **Ranking** (`Thread.computeOuts`):
  - The base weight gets jitter, and penalties for repeating a recent link type, a card or sentence already seen this session, or a third artist (or record) in a row.
  - Nothing already on the trail is offered.
  - The top seven become the ways out.
  - A lone artist with no links carries on through their records' credits, labels and styles.
  - A dead end jumps to a well-connected artist and says so.
- **`connect()`** finds the best reason for any hop the feed didn't propose itself: a record picked from the details panel, or a shared trail whose hop isn't among the candidates.
- **Seeded randomness.** Every random choice uses `rngFor(seed, decision, position, card)`: which record on a label, ranking jitter, whether a card is a video. A trail therefore replays from its slugs plus `r`, even when the original session's ranking differed because of cards seen and abandoned. `Thread.start()` looks each hop up among all candidates, not just the top seven.
- **`Thread`** holds the trail (`trail`, `cur`, `maxSeen`). Its methods:
  - `go(k)` moves along the trail.
  - `branch(±1)` swaps the current card for another way out of the previous one and drops the cards after it.
  - `setNext(hop)` makes a picked hop the next card.
  - `siblings()` returns the ways out either side of the current card.
  - `search()` returns `trail=…&r=…`.
  - `ensureAhead()` keeps two cards generated ahead.

`src/lib/explore/threadCards.ts` has what a card shows: `cardImageUrl`, `thumbUrl`, `focusPosition`, `cardPalette` (the card's colours for the nav), `cardText`, `trimBio`. `src/lib/explore/threadMotion.ts` has the motion maths: `springStep` (stiffness 330, damping 31, a faint overshoot; a 0.22s linear crossfade under reduced motion), `swipeDirection` (16% of the height or a 0.45px/ms flick vertically, 22% sideways), `rubberBand`, `dragAxis`.

## Components: `src/components/explore/thread/`

| File | What it does |
| --- | --- |
| `ThreadFeed.tsx` | The controller: pointer, wheel and keyboard input; a `requestAnimationFrame` spring that moves the cards by writing transforms straight to their elements (React only re-renders when the trail changes); settle (marks the card seen, writes the URL, preloads the next two cards and the next way out); the page flood and title; the details as a panel or a sheet. |
| `ThreadCard.tsx` | One card (memoised). Renders the previous, current and next cards plus the ways out either side of the current one; the feed positions them. Parallax: the picture lags the card by 30%. |
| `ThreadTrail.tsx` | The trail row/column; keeps the current step in view. |
| `ThreadDetails.tsx` | Bio or record details, credits, every way out (each a hop), the records owned as sleeves (each a hop), videos that play with sound in the panel, and links to the album/artist page and "See on the map" (The Galaxy at `/explore/<artist-slug>`). |
| `ThreadSheet.tsx` | The bottom sheet: drag its top edge down, tap outside, Escape or Close. `inert` while closed. |
| `thread.css` | Layout and card styles (`thr-` classes) on the player tokens (`--ground`, `--cream`, `--ease-out`, `.t-kicker`, `.pill`). |

The page itself is `src/pages/explore/ThreadPage.tsx` (`ExploreThreadPage`). It loads the graph with `useExplore()` and shows a loading block or a retry.

## Reduced motion

Cards crossfade in place instead of sliding, there is no parallax, the sheet fades instead of sliding, and videos never autoplay (turning sound on still plays one).

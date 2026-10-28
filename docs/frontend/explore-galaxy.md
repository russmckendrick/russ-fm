# The Galaxy (`/explore`)

A 3D map of every artist in the collection. Each artist is a star showing their avatar, sized by how many of their records are in the collection and glowing in the average colour of their sleeves. Artists are grouped into the 12 genre families (one nebula each, laid along a spiral). Light trails join artists who share someone: a member, a guest spot, or a producer, player, writer, engineer or designer credited on both artists' records. Clicking an artist flies the camera to them, their records orbit them as spinning discs, and the panel explains every connection. Clicking a connection flies along its trail to the next artist.

## URLs

| URL | Shows |
| --- | --- |
| `/explore` | The whole map. The default Explore page (the nav's Explore link). |
| `/explore/:artist` | The map focused on that artist (slug as on `/artist/:slug`). Each hop pushes a new URL, so Back goes to the previous artist and any hop can be shared. An unknown slug shows the whole map. |

Links in: The Thread's details link "See on the map" to `/explore/<artist>`. Links out: the panel's "Follow the thread from here" goes to `/explore/thread?seed=<artist>`, "Artist page" to `/artist/<artist>`, record tiles and orbiting discs to `/album/<slug>`.

## Interactions

- Drag to turn, wheel or pinch to zoom, right-drag or two fingers to pan. After 7 s untouched the camera drifts slowly round (not with reduced motion).
- Hover a star, a disc or a focused trail for a tooltip (name, records, family, connections / title, year, vinyl / the reason).
- Click a star to focus it. Its trails brighten, everything else dims, its records orbit it (the sleeve on the label, the pressing colour from `vinylLook` on the vinyl), the nav and sky take the colours of its most vivid sleeve, and the panel opens.
- Click a linked star, its label, a focused trail, an edge pill or a row in the panel to hop along that trail. Labels for linked artists off screen are pinned to the screen edge with an arrow pointing their way.
- The breadcrumb in the panel lists the hops; clicking an earlier artist goes back there and cuts the path.
- Search (top left) flies to an artist; arrow keys and Enter work. The shuffle button goes to a random artist with at least two connections, the map button back to the whole map. Family labels fly to that nebula. Escape closes the focus.
- Phones: the panel is a bottom sheet (tap the handle to fold it down to the name) and the focused star centres in the space above it. Fewer discs (28) and edge pills (10).
- Reduced motion: no drift, no spinning or orbiting discs, cuts instead of flights.

## Modules

| File | What it does |
| --- | --- |
| `src/pages/explore/GalaxyPage.tsx` | Route component. Loads `explore.json` (`useExplore`), prepares it, gets the layout, keeps focus in the URL, the hop path and the trail just travelled (`linkBetween` on the previous and new focus, so Back also flies along the trail), the nav flood (`usePageFlood`), title and meta, and the insets the panel and HUD take. Lazy-loads the canvas. |
| `src/components/explore/galaxy/GalaxyCanvas.tsx` | Lazy chunk (Three.js lives only here). Creates one `GalaxyScene`, passes focus, insets, ground and reduced motion through, disposes it on unmount. Shows a plain message if WebGL is unavailable. |
| `src/components/explore/galaxy/GalaxyHud.tsx` | Title and counts, search combobox, Random, Whole map, trail colour key, hint. |
| `src/components/explore/galaxy/GalaxyPanel.tsx` | The focused artist: fanart (else photo), a band in the lead sleeve's flood with family, name and facts, breadcrumb, links, bio, members, connections grouped by trail kind (six shown, "Show all"), records. Doubles as the text alternative to the map. |
| `src/components/explore/galaxy/atlasStyle.ts` | CSS background for one cell of the avatar or sleeve atlas. |
| `src/components/explore/galaxy/AtlasImage.tsx` | An `<img>` (`artistPhotoUrl(…, 'avatar')` in connection and search rows, `sleeveUrl(…, 'medium')` for record tiles) fading in over its atlas cell, which stays if the file fails. |
| `src/components/explore/galaxy/galaxy.css` | The DOM labels the scene draws over the canvas (family names, linked artists, edge pills, tooltip). |
| `src/lib/explore/galaxyLayout.ts` | Pure: `prepareGalaxy` (family per artist, star size and colour, family colours, links with trail kind and spring strength), `TRAIL_KINDS`, `familyCentres`, `orbitRings`, `focusDistance`, `edgePoint` / `spreadPinned` (edge pills), `clearOfEachOther` (family labels never overlap; bigger families win), `pathAfterVisit`, `searchArtists`, `reasonLines` / `connectionGroups` (one sentence per person via `describeLink`), `leadRecord`, `discPaint` (flat WebGL colours from a `VinylLook`), `cropWindow`, `closeUps`. |
| `src/lib/explore/galaxyForce.ts` | The force layout (`layoutGalaxy`): seeded, so the same data always gives the same map. Grid-hashed soft repulsion, springs along links, gravity to the family centre. Springs are weaker between families, for weak reasons, for shared credits (a quarter) and for well-connected artists (divided by √ of the smaller end's link count, set in `forceJob`), so thousands of shared credits do not pull the nebulae together. Import-free so the worker stays small. |
| `src/lib/explore/galaxy.worker.ts` | Runs `layoutGalaxy` in a module Web Worker. |
| `src/lib/explore/galaxyWorkerClient.ts` | `computeLayout`: localStorage cache (key `russfm:galaxy-layout:v2:<generated>:<artists>:<links>:<albums>`, older keys are removed), else the worker, else the main thread. |
| `src/lib/explore/galaxyHiRes.ts` | Sharp close-ups (`GalaxyHiRes`). Every few frames it picks the stars at least 28px in radius on screen (30px on phones), biggest first, up to 48 (24), loads each one's `artistPhotoUrl(artist, 'medium')` and draws it on a billboard over the atlas star, cut to the avatar's square (`artist.crop`, else the centre square for the photo's aspect: `cropWindow`) and fading in. The focused artist's orbiting discs get their `sleeveUrl(album, 'medium')` labels the same way, turning with the disc. One queue loads six textures at a time, biggest on screen first (`crossOrigin = 'anonymous'`: assets.russ.fm answers with CORS for russ.fm); LRU caches (80 photos, 64 sleeves; 40 / 36 on phones) dispose what is no longer drawn. A failed load (no CORS on other origins, a missing file) leaves the atlas cell. |
| `src/lib/explore/galaxyScene.ts` | The Three.js scene class: stars (one instanced quad pass for avatars and one for glows, avatars round-masked from `AVATAR_SHEET_URL`; drawn after the trails so no trail crosses a face), trails (one `LineSegments` buffer for every link, dim by default; the focused artist's 40 strongest as bright `LineSegments2`, the rest of a busy artist's shared credits as slightly brighter thin lines), dust (one mote per record in its sleeve colour plus faint family haze), orbiting discs (instanced; the sleeve atlas from `sleeveSheetUrl` is loaded the first time an artist is focused), flights along trails, CPU picking, idle drift, view offset beside the panel, and the DOM labels. `dispose()` frees every geometry, material and texture and removes listeners and labels. |

## Trail colours

| Kind | Reasons | Colour |
| --- | --- | --- |
| Member or group | `member`, `group`, `alias` | pale blue |
| Shared member | `bandmate` | amber |
| Guest spot | `guest` | rose |
| Credited on a record | `credit` | green |
| Shared credit | `shared-credit` | violet, much dimmer (there are thousands) |

A link takes the kind of its strongest reason (`sortReasons`), so a band and its member usually show as "Shared member".

## Data

Reads `public/explore/explore.json` (see `src/lib/explore/types.ts`) and the atlases `public/explore/avatars.webp` and `public/explore/sleeves-N.webp` through the helpers in `src/lib/explore/data.ts`. "Various" and artists with no records are left off the map. Images in the panel go through `fanartUrl` / `artistPhotoUrl` (`medium`).

## Tests

`src/lib/__tests__/exploreGalaxy.test.ts`: preparation (hidden artists, family choice, sizes, trail kinds and strengths), layout determinism, hop path, orbit rings and camera distance, edge pills and label de-overlap, disc paint from vinyl looks, search and connection sentences, the photo crop window, close-up picking and spring weakening.

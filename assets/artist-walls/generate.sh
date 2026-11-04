#!/bin/sh
# One fly-poster wall per /tv room id (src/lib/tv.ts), like the release rooms.
# Each Codex photo has one landscape poster printed solid chroma-key green that carries
# the wall's light and wear as shading; scripts/process-artist-walls.py turns that into the hole + a shade layer.
# Usage: sh assets/artist-walls/generate.sh [room-id ...]   (originals land beside it as <id>.png)
# Then: scripts/process-artist-walls.py <room-id>
set -e
cd "$(dirname "$0")"
# The codex-image skill's generator; CODEX_IMAGE_GEN overrides where it is.
S="${CODEX_IMAGE_GEN:-$(ls -t "$HOME"/Library/Application\ Support/Claude/local-agent-mode-sessions/skills-plugin/*/*/skills/codex-image/scripts/codex-image.sh "$HOME"/.claude/skills/codex-image/scripts/codex-image.sh 2>/dev/null | head -1)}"
[ -n "$S" ] || { echo "No codex-image.sh found: set CODEX_IMAGE_GEN" >&2; exit 1; }
BASE="Photoreal photograph, eye-level, camera perfectly square-on to the wall, 35mm lens, cinematic, fine detail, film grain, no people, no readable text anywhere, no logos, no brand names. CENTRE OF FRAME: one big LANDSCAPE paper poster (4:3, wider than tall, about 46 percent of the image width, its centre slightly above the middle of the image), facing the camera dead-on with straight level edges. The poster is old wheat-pasted paper printed solid bright chroma-key green (#00FF00); it shows the scene's real light and wear only as shading on the green: soft wrinkles, glue bubbles, a fold crease or two, the lamp light falling off across it, light grime; it stays clearly saturated green everywhere. One corner is torn away and one edge has a small rip, showing the wall beneath. Around it: older torn, weathered, faded posters and flyers with abstract shapes and NO readable text. Nothing else in the image is green; plants are deep olive."
# Each wall generates in a temporary folder (codex-image.sh collects every new
# image in its output folder, so never this one), then lands here as <id>.png + .txt.
# A wall that already has an original is skipped: move it aside to redo it.
declare_room() {
  [ -z "$ONLY" ] || echo " $ONLY " | grep -q " $1 " || return 0
  [ -f "$1.png" ] && return 0
  tmp=$(mktemp -d)
  bash "$S" -p "$BASE SETTING: $2" -s 1536x1024 -q high -o "$tmp" -t 600
  f=$(ls "$tmp"/*.png | head -1)
  mv "$f" "$1.png" && mv "${f%.png}.txt" "$1.txt" && rm -rf "$tmp"
}
ONLY="$*"
declare_room shelves "the red-brick side wall of an independent record shop on a quiet street, late afternoon sun, a bike locked to a drainpipe, warm light."
declare_room basement "a basement venue stairwell, painted brick in dark green-black, a bare bulb in a cage above, worn concrete steps at the edge, tungsten light, deep shadows."
declare_room bedroom "a 1990s teenager's bedroom wall at night, the poster stuck up with yellowed tape among overlapping gig flyers with abstract shapes, fairy lights along the top, an amber lava lamp glow."
declare_room prog-art "a corridor in a 1970s art school, pale concrete wall with a cork strip, pinned abstract prints, strip light, a dusty radiator below."
declare_room electronic "a concrete railway underpass at night, cool cyan and magenta strip lights, rave flyer remnants, wet floor reflections."
declare_room metal "a corrugated steel roller shutter on an industrial unit at night, rust, chains, a single harsh floodlight from above, dark tarmac."
declare_room post-punk "a grey concrete wall on a 1980s northern English estate in drizzle, a sodium street light, rain-streaked concrete, overcast dusk."
declare_room punk "a squat venue wall layered with torn xeroxed flyers and stickers with no text, spray-paint scribbles of abstract shapes only, a bare red bulb, gritty."
declare_room hip-hop "a plywood construction-site hoarding on a New York street, layered torn posters, a fire hydrant at the kerb, late golden-hour sun, brownstones behind."
declare_room soul-funk "a 1970s nightclub entrance wall with dark wood panels and warm amber globe lights, a velvet rope stand at the edge, glossy floor."
declare_room folk "a weathered timber barn wall used as a village noticeboard, drawing pins, rusted nails, overcast countryside light, long grass at the base."
declare_room pop "a pastel pink painted city wall in bright midday sun, crisp shadows, a palm shadow falling across the wall."
declare_room soundtracks "the outside wall of an old cinema at night, art deco tiles, warm marquee bulbs glowing above the top of frame, wet pavement."
declare_room jazz-blues "a narrow cobbled side street outside a late-night jazz club, old plaster wall in ochre, a wrought-iron lamp, rain, blue night light."
declare_room live "a city back alley beside a music venue at night, a venue side door with red light inside, metal crowd barriers, wet cobbles, a single warm caged lamp above left, a drainpipe at the right, deep shadows."

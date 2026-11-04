"""4x upscales of the Codex originals in assets/<kind>/, for the room scripts.

The upscales are cached in assets/.upscaled/<kind>/<id>.png (git-ignored) and
redone when the original is newer. They are made by the codex-image skill's
local finisher (FSRCNN on the CPU, no paid service): set CODEX_IMAGE_FINISH to
its finish.sh, or it is found under ~/.claude/skills or the Claude app's skills.
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'assets'


def _finisher() -> Path:
    env = os.environ.get('CODEX_IMAGE_FINISH')
    if env:
        return Path(env)
    home = Path.home()
    candidates = [home / '.claude/skills/codex-image/scripts/finish.sh']
    plugins = home / 'Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin'
    candidates += sorted(plugins.glob('*/*/skills/codex-image/scripts/finish.sh'), key=lambda p: p.stat().st_mtime, reverse=True)
    for c in candidates:
        if c.exists():
            return c
    sys.exit('No codex-image finisher found: set CODEX_IMAGE_FINISH to its scripts/finish.sh')


def originals(kind: str, ids: list[str]) -> list[str]:
    """The room ids to process: those asked for, else every <id>.png in assets/<kind>/."""
    return ids or sorted(p.stem for p in (ASSETS / kind).glob('*.png'))


def upscaled(kind: str, ids: list[str], scale: int = 4) -> Path:
    """The folder of 4x upscales of assets/<kind>/<id>.png for these ids, made where missing or stale."""
    cache = ASSETS / '.upscaled' / kind
    cache.mkdir(parents=True, exist_ok=True)
    stale = [i for i in ids if not (cache / f'{i}.png').exists() or (cache / f'{i}.png').stat().st_mtime < (ASSETS / kind / f'{i}.png').stat().st_mtime]
    if stale:
        finish = _finisher()
        # The finisher refuses to overwrite, so it writes into a fresh folder first.
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(
                ['sh', str(finish), *[str(ASSETS / kind / f'{i}.png') for i in stale], '--upscale-only', '--scale', str(scale), '--output-dir', tmp],
                check=True,
            )
            for i in stale:
                shutil.move(Path(tmp) / f'{i}.png', cache / f'{i}.png')
    return cache

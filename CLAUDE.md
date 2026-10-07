# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla-JS Tetris. No dependencies, no build step, no package.json. Three files: `index.html` (DOM/canvas), `style.css` (dark retro theme), `game.js` (all game logic, ~300 lines).

## Running / testing

No install or build. Open directly or serve statically:

```bash
xdg-open index.html          # Linux, open file directly
python3 -m http.server 8000  # or: npx serve .
```

There is no test suite, linter, or bundler — verify changes by opening the page and playing.

## Architecture (`game.js`)

- **Board**: `ROWS × COLS` matrix; each cell is `0` (empty) or a color index `1–7` identifying the piece that occupies it.
- **Pieces**: the 7 tetrominoes are square matrices in `PIECES`. Rotation is done via `rotateCW` (transpose + row reverse), not by storing rotation states.
- **Collision** (`collide`): checks board bounds and overlap with locked cells; used both for movement and for `ghostY` projection.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` until a non-colliding position is found, else the rotation is discarded.
- **Game loop** (`loop`): driven by `requestAnimationFrame`; accumulates `dt` and advances the piece one row once `dropAccum >= dropInterval`.
- **Locking** (`lockPiece` → `merge` + `clearLines` + `spawn`): merges the current piece into `board`, clears full rows (scanning bottom-up, re-checking the same row index after a splice), then spawns the next piece.
- **Scoring/leveling**: `LINE_SCORES = [0, 100, 300, 500, 800]` × current `level`; hard drop adds 2 pts/row, soft drop 1 pt/row. `level` increases every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Ghost piece**: `ghostY()` projects the current piece straight down to its landing row; drawn at `globalAlpha = 0.2`.
- **Bomb power-up**: every `BOMB_MIN_MS..BOMB_MAX_MS` (random) of play time, `loop` swaps `next` for `bombPiece()` (1x1, `type = BOMB_TYPE`, `bomb: true`). `lockPiece` calls `explode()` instead of merge: clears the 3x3 around it, scores `BOMB_CELL_SCORE × level` per cell, no gravity. Bomb sprite is an inline SVG drawn in `drawBlock`; explosion FX is the `#fx` SVG + CSS animations (`showExplosion`).
- **Pause menu**: `P`/`Esc` toggles `#pause-menu` (separate from the game-over `#overlay`): Reanudar, Reiniciar (`init()`), Ver controles, Nivel inicial (1–10, `startLevel` in localStorage; `init()` sets `level = startLevel`, `clearLines` uses `max(startLevel, floor(lines/10)+1)`). While open, game keys are ignored; after resume `ignoreRepeat` drops held-key repeats until the first keyup.
- Game-over is triggered inside `spawn()` when the freshly spawned piece already collides at its start position.

Tunable constants live at the top of `game.js`: `COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, initial `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS×BLOCK` by `ROWS×BLOCK`).

## Controls

`←`/`→` move, `↑`/`X` rotate, `↓` soft drop, `Space` hard drop, `P`/`Esc` pause menu.

# Brogue CE level generation, visualized (unofficial)

Enter a real game seed and depth to replay how standard **Brogue CE v1.15.1** generates that level. Step through room placements, loop candidates, rejected lakes, choke analysis, machines, bridges and first-entry environment updates. Play/pause, back, scrub, speed and phase navigation are available; the URL preserves seed, depth and replay position.

Live: https://scarf005.github.io/roguelike-algorithms/

The **Classic algorithms** view retains BSP, cellular automata, drunkard's walk, random rooms, recursive backtracker, symmetric shadowcasting, BFS, Dijkstra maps and A*, including their existing permalink format.

## Run

Requires Deno 2.9. The checked-in WASM assets are sufficient for normal development and deployment; Emscripten is only needed to rebuild the engine.

```sh
deno task dev
deno task typecheck
deno task lint
deno task test
deno fmt --check
deno task build
deno task preview
```

Space plays/pauses, Left/Right steps, and Shift + Left/Right changes phase, outside form controls. On narrow screens, pan the map horizontally; glyphs remain readable without horizontal page scrolling.

## Engine and correctness

The C engine is pinned to [Brogue CE commit `1ba4240b7a928ddf0ffb772717bf1d433cd63804`](https://github.com/tmewett/BrogueCE/tree/1ba4240b7a928ddf0ffb772717bf1d433cd63804). A fresh headless WASM instance runs initialization and every preceding depth, including items, monsters, stair retries and environment simulation. The boundary is **canonical fresh sequential first entry**, following `SeedCatalog.c`, not an arbitrary played save. See [the investigation](docs/phase1-report.md).

Read-only hooks capture real C decisions and owned reversible deltas. Phase checkpoints support scrubbing without keeping a full board per candidate. Rendering uses a canvas, the engine's terrain glyphs and base palette; no tileset is used. Terrain layers, not a pixel-identical game screenshot, are the correctness boundary.

Tests compare every committed native terrain fixture to WASM, retain the independent Phase 1 hashes, compare both RNG streams to native vectors, replay and reverse all board planes, and check detailed traces against phase-only checkpoints. Observer-off, phase and full modes must preserve final state and RNG.

## Rebuild the engine and fixtures

Activate [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) **4.0.10**, then provide the compiler path:

```sh
env EMCC=/path/to/emsdk/upstream/emscripten/emcc deno task brogue:wasm
```

Native fixture generation requires `make` and a C compiler, but no graphical libraries:

```sh
deno task brogue:native .brogue-build/brogue-dump
deno task brogue:verify-native --binary .brogue-build/brogue-dump
deno task brogue:fixtures .brogue-build/brogue-dump
deno fmt src/brogue/fixtures
```

The native dump links an observer-disabled wrapper and calls the real engine sequentially. Fixtures include depths 1, 13 and 26, legacy 32-bit seeds, the 32/64-bit transition and a large 64-bit seed; the uint64 maximum is tested via the direct wrapper because upstream's one-seed catalog range overflows. RNG fixtures come from the same native binary's `--rng` entry point, using `rand_range(0, 2147483646)` to keep the interval valid on WASM32. Regeneration never updates the retained Phase 1 baseline hashes.

Build scripts and compiler flags are in [`scripts/brogue/`](scripts/brogue/); copied source and its provenance are in [`vendor/brogue-ce/`](vendor/brogue-ce/). GitHub Pages deploys the validated build on pushes to `main`.

## Credits and license

This is an **unofficial** visualization, not the game or an official Brogue CE project. [Brogue](https://sites.google.com/site/broguegame/) was created by **Brian Walker**; [Community Edition](https://github.com/tmewett/BrogueCE) is maintained by the Brogue CE contributors.

This repository and the vendored Brogue code are **AGPL-3.0** (Brogue headers permit version 3 or later). Original copyright notices are retained. The generated JavaScript also retains Emscripten's MIT license notice. No `tiles.png` or Oryx commercial assets are distributed.

# TASK: Brogue CE level generation visualizer

## Goal

Turn this site into an unofficial, interactive, step-by-step visualizer of how [Brogue: Community Edition](https://github.com/tmewett/BrogueCE) builds its dungeon levels. The killer feature: a player enters a real Brogue CE game seed and depth, and watches that exact level being generated, phase by phase.

## Why

The current site is a generic collection of roguelike algorithms (BSP, cellular automata, shadowcasting, A*, ...). That territory is already covered well by [Red Blob Games](https://www.redblobgames.com/), [Albert Ford's shadowcasting article](https://www.albertford.com/shadowcasting/), and the rot.js demos. Brogue's level architect is a specific, well-loved and visually rich pipeline that, as far as we know, nobody visualizes interactively. Focusing on it gives the site a reason to exist and a concrete visual reference (Brogue itself) instead of a generic "AI-made" look.

## Current state of this repo

- Deno 2.9 + Vite 8 + SolidJS, deployed to GitHub Pages by `.github/workflows/pages.yml` on push to `main`. Live: https://scarf005.github.io/roguelike-algorithms/
- `src/algorithms/`: pure TS, no DOM. Generators yield lightweight step events; the runner applies them to typed arrays in place (`board.ts`). Seeded RNG in `rng.ts`.
- `src/sim.ts` + `src/render.ts`: one canvas at cell resolution, one `putImageData` per frame, requestAnimationFrame with a steps-per-frame speed control. Solid only drives controls.
- Tasks: `deno task dev|build|typecheck|lint|test|preview`, `deno fmt --check`. 50 tests pass.
- License: AGPL-3.0.

Default: the Brogue visualizer replaces the generic algorithms as the site's content. Reuse the runner/render architecture where it fits; delete generic algorithms that no longer serve the Brogue site (say which in the Phase 1 report).

## Brogue CE facts (verified against `master`, latest release v1.15.1)

- Level generation lives in `src/brogue/Architect.c`. `digDungeon()` runs, in order:
  1. `clearLevel()` fills with granite.
  2. `carveDungeon(grid)`: first room from `dungeonProfileCatalog[DP_BASIC_FIRST_ROOM]` (adjusted per depth), then `attachRooms(grid, &theDP, 35, 35)` repeatedly designs a random room (`designCrossRoom`, `designSymmetricalCrossRoom`, `designSmallRoom`, `designCircularRoom`, `designChunkyRoom`, `designCavern`, optional `attachHallwayTo`) and slides it onto a door site where `roomFitsAt()`.
  3. `addLoops(grid, 20)`: opens loop doorways (grid value 2) where the pathing distance between the two sides is at least 20.
  4. Grid to `pmap`; 60% of door sites become `DOOR`. `finishWalls(false)`.
  5. `designLakes()` + `fillLakes()`: blob lakes of decreasing size, rejected if `lakeDisruptsPassability()`; liquid chosen by `liquidType()`, shallow `createWreath()`.
  6. `runAutogenerators(false)`, `removeDiagonalOpenings()`.
  7. `addMachines()` → `buildAMachine()` using blueprints (vaults, key puzzles, flavor machines) and `analyzeMap(true)` choke-point analysis.
  8. `runAutogenerators(true)`, `cleanUpLakeBoundaries()`, `while (buildABridge())`, `finishDoors()`, `finishWalls(true)`.
- `D_INSPECT_LEVELGEN` blocks in `digDungeon()` mark natural phase boundaries (useful instrumentation points).
- RNG: `src/brogue/Math.c` (`seedRandomGenerator`, `rand_range`, `rand_percent`, `rand_64bits`; two streams `RNG_SUBSTANTIVE` / `RNG_COSMETIC`).
- Seeding: `initializeRogue()` in `RogueMain.c` seeds with the game seed, then derives `levels[i].levelSeed` for every depth up front (64-bit if the seed has high bits, else the legacy `rand_range(0, 9999)` pair). `startLevel()` calls `seedRandomGenerator(levelSeed)` right before generating the level.
- Caveat to investigate: `addMachines()` spawns items/monsters, and item generation reads cross-level state (e.g. `rogue.meteredItems`, `rogue.rewardRoomsGenerated`). Reproducing depth N may therefore require generating depths 1..N-1 first, or the RNG consumption diverges. `src/brogue/SeedCatalog.c` generates levels headlessly in sequence and is a good reference.
- Target the standard Brogue CE variant (not Rapid/Bullet Brogue; see `gameConst`).

## Phase 1: investigation (report before implementing)

Read the Brogue CE sources and write `docs/phase1-report.md` answering:

1. Which approach to take:
   - **B. Faithful TS port** of the architect, RNG, dungeon profiles, dungeon features, blueprints and whatever item/monster generation affects RNG consumption.
   - **C. Compile Brogue CE C to WASM** (emscripten or clang `--target=wasm32`) with a headless platform, and emit step events from instrumentation hooks inside `Architect.c`. Compare: lines of code involved, globals/state to isolate, bundle size, how step events are captured, maintenance when upstream changes. Recommend one.
2. Exactly what must run to reproduce depth N for a seed (levels 1..N-1? items? monsters?), measured, not guessed.
3. Which step granularity to expose (per room attempt, per lake attempt, per machine, per bridge ...) and the event schema.
4. An estimate of work and risks.

Stop after Phase 1 and report; do not start Phase 2 until the approach is confirmed.

## Phase 2: implementation

### Required behavior

- Inputs: game seed (accept the formats Brogue CE shows, including large 64-bit seeds), depth 1..26. State in the URL hash so links reproduce a view.
- Playback of the generation pipeline with play/pause, single step, step back or scrub (at least per phase), speed, "jump to phase".
- Each phase has a short explanation panel written from the source, naming the Brogue function it corresponds to.
- Show intermediate state that the final map hides: rejected room placements, door sites, rejected lakes and why, loop candidates, choke map, machine interiors.
- Render with Brogue's text-mode glyphs and colors (take glyphs/colors from the Brogue CE source). No `tiles.png` unless its license terms below are met.
- Performant: canvas rendering, no per-cell DOM or per-cell signals, smooth at Brogue's 79x29 grid at any speed.

### Correctness (hard requirement)

- The final map for a given seed and depth must match real Brogue CE v1.15.1 cell for cell (terrain layers at least).
- Build golden fixtures from the real game: compile Brogue CE natively (its `--print-seed-catalog` mode in `src/platform/main.c` already generates levels headlessly) and dump the final `pmap` for several seeds × depths (include depth 1, a mid depth, 26, a legacy 32-bit seed and a 64-bit seed). Tests compare against these fixtures.
- Tests also cover: RNG output matches the C RNG for known seeds; each phase's events, when replayed, produce the same map as running without instrumentation; invalid seed/depth input is rejected with a clear message.

### Design

Brogue is the visual reference; do not invent a generic web look.

- Dark background, Brogue's glyph set and terrain colors, monospace grid only for the map itself.
- The page is a tool with explanations, not a marketing page: no hero, feature cards, gradients, glassmorphism, pill buttons, emoji, or decorative animation.
- Every overlay color has a legend entry; start/stairs/markers are never hidden under overlays.
- Works at phone width without horizontal page scroll; keyboard shortcuts for play/step/phase.

## License and attribution (must do)

- Brogue CE code is AGPL-3.0 (file headers: "Copyright 2012 Brian Walker", AGPL-3.0 or later); this repo is AGPL-3.0, so porting or compiling it is fine.
- Keep original copyright notices. Every ported or vendored file states its origin (Brogue CE path + commit) and that it was modified.
- If vendoring as a git submodule or copied sources, pin the upstream commit.
- `bin/assets/tiles.png` is CC BY-SA 4.0 (not AGPL): only use with attribution and share-alike. Do not use Oryx Design Lab's commercial tileset.
- Present the site as unofficial: e.g. title "Brogue CE level generation, visualized (unofficial)", with links to Brogue CE and credit to Brian Walker and the Brogue CE maintainers in the footer and README.

## Repo conventions

- Deno tasks only; `deno fmt` (no semicolons), `deno lint`, `deno task typecheck`, `deno task test` must pass; CI deploys on push to `main`.
- Functional style, single-line arrow functions where natural, options objects for 3+ arguments.
- Atomic conventional commits with specific subjects (`feat:`, `fix:`, `test:`, `build:` for build/deps/WASM toolchain, `docs:`).
- README: what the site is, unofficial notice, credits, dev commands, how fixtures were generated.

## Done when

- Phase 1 report exists and the approach was confirmed.
- Golden-fixture tests pass for all fixture seeds and depths, plus the other tests above.
- fmt/lint/typecheck/test/build pass locally and the Pages workflow deploys successfully.
- Manually verified in a browser: several seeds and depths play through every phase with no console errors, at desktop and phone width.

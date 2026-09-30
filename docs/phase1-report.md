# Phase 1: Brogue CE level generation visualizer

## Decision

Recommend **C: compile the pinned Brogue CE C engine to WASM**, run it headlessly in a dedicated worker, and capture read-only generation events. Do not implement Phase 2 until this choice is confirmed.

Exact terrain reproduction is the deciding requirement. The architect is not a standalone room generator: machine construction generates items and monsters, and the entered level includes stairs, population and environment updates after `digDungeon()` returns. A faithful TS port would need substantial game logic, not just `Architect.c` and the RNG.

**Keep every existing algorithm**, as requested. Delete none of BSP, cellular automata, drunkard's walk, random rooms, recursive backtracker, shadowcasting, BFS, Dijkstra or A*. Keep their registry, RNG, tests and existing view functional. In Phase 2, make Brogue the default view and retain the current collection as a separate algorithms view with its existing links supported. Do not force Brogue's four-layer terrain into the generic wall/floor board.

This commit contains investigation documentation and a disposable native experiment patch only. No production code, WASM module, UI changes or golden-fixture tests have been implemented.

## Source baseline

Target **standard Brogue CE v1.15.1**, commit [`1ba4240b7a928ddf0ffb772717bf1d433cd63804`](https://github.com/tmewett/BrogueCE/tree/1ba4240b7a928ddf0ffb772717bf1d433cd63804), not current `master`, Rapid or Bullet Brogue. All source references below are relative to that commit:

- [Architect.c](https://github.com/tmewett/BrogueCE/blob/1ba4240b7a928ddf0ffb772717bf1d433cd63804/src/brogue/Architect.c): `analyzeMap` line 192, `addLoops` 340, `buildAMachine` 984, `addMachines` 1732, `attachRooms` 2367, `carveDungeon` 2456, `designLakes` 2638, `buildABridge` 2786, `digDungeon` 2877, `placeStairs` 3690, `initializeLevel` 3764.
- [RogueMain.c](https://github.com/tmewett/BrogueCE/blob/1ba4240b7a928ddf0ffb772717bf1d433cd63804/src/brogue/RogueMain.c): `initializeRogue` 190, level seeds and stair coordinates 256–285, `startLevel` 547, generation/retry/population 684–735, environment warm-up 792–798.
- [Math.c](https://github.com/tmewett/BrogueCE/blob/1ba4240b7a928ddf0ffb772717bf1d433cd63804/src/brogue/Math.c): two-stream 32-bit RNG state, `raninit`, rejection-sampled `rand_range`, `rand_64bits` and `seedRandomGenerator`, lines 92–192.
- [SeedCatalog.c](https://github.com/tmewett/BrogueCE/blob/1ba4240b7a928ddf0ffb772717bf1d433cd63804/src/brogue/SeedCatalog.c#L254-L318): headless initialization and sequential `startLevel` reference.
- [Globals.c](https://github.com/tmewett/BrogueCE/blob/1ba4240b7a928ddf0ffb772717bf1d433cd63804/src/brogue/Globals.c): colors, `tileCatalog` 315, dungeon features 603, dungeon profiles 934.
- [GlobalsBrogue.c](https://github.com/tmewett/BrogueCE/blob/1ba4240b7a928ddf0ffb772717bf1d433cd63804/src/variants/GlobalsBrogue.c): standard variant catalogs and `gameConst` values.
- [platformdependent.c](https://github.com/tmewett/BrogueCE/blob/1ba4240b7a928ddf0ffb772717bf1d433cd63804/src/platform/platformdependent.c#L44): `glyphToUnicode`; [main.c](https://github.com/tmewett/BrogueCE/blob/1ba4240b7a928ddf0ffb772717bf1d433cd63804/src/platform/main.c#L65) supplies `tryParseUint64` and `--print-seed-catalog`.

Two corrections to the brief matter for explanations/tests: `addLoops(grid, 20)` accepts distances **strictly greater than 20**, not greater than or equal to 20. `designLakes` actually tries **20 placements** per blob; the comment in `digDungeon` describing ten is stale. Explain executed code, not that comment.

## B versus C

### Source footprint

Measured with `wc -l` on the pinned checkout; counts include comments and blank lines, not reachable-code analysis:

| Source                                                    |  Lines | Why it matters                                                            |
| --------------------------------------------------------- | -----: | ------------------------------------------------------------------------- |
| `Architect.c`                                             |  3,837 | Terrain, rooms, lakes, machines, bridges, stairs, population entry        |
| `Math.c`                                                  |    288 | RNG and fixed-point helpers                                               |
| `Grid.c` + `Dijkstra.c`                                   |    806 | Blob generation, flood fills, distances                                   |
| `Globals.c` + `GlobalsBase.c` + `GlobalsBrogue.c`         |  3,036 | Terrain/features/profiles/blueprints, catalogs, globals, standard variant |
| `RogueMain.c`                                             |  1,414 | Initialization, persistent level state, first-entry pipeline              |
| `Items.c` + `Monsters.c`                                  | 12,866 | Machine and ordinary population, item state, RNG consumption              |
| `Movement.c` + `PowerTables.c`                            |  2,832 | FOV/terrain-related helpers and fixed-point tables                        |
| `Rogue.h` + `Globals.h`                                   |  3,678 | Types, flags, structs and declarations                                    |
| All C files selected by the native null-platform Makefile | 42,387 | Broad, buildable baseline, including all three variants and UI logic      |

The architect/RNG/grid/catalog subset alone is 7,967 lines. Including initialization/items/monsters expands the inspected source envelope to 22,247 lines before environment, lighting, FOV and other dependencies. These are **file sizes, not a claim that every line must be ported**. A minimal dependency slice has not been proven.

| Concern        | B: faithful TS port                                                                                                                                          | C: pinned C → WASM                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementation | Port architect and catalog data, then transitively required item/monster/environment/state logic. Estimated 15,000–30,000 TS/data lines; not measured.       | Initially retain the engine/null backend, add an exported headless entry and observer hooks. Estimated 500–1,500 new C/TS integration lines, excluding shared UI/renderer work; not measured. |
| State          | Explicit TS session object is attractive, but every global and mutable catalog must be correctly modeled.                                                    | Existing process-global engine state stays intact. One isolated WASM instance per worker/session; terminate/recreate on new seed rather than attempting partial resets.                       |
| RNG            | Must implement unsigned wrapping, rotation, unbiased range rejection, both streams and exact call order. Existing `src/algorithms/rng.ts` is not compatible. | Preserve `Math.c` and call order. Hooks must never draw random numbers or invoke game drawing/inspection helpers.                                                                             |
| Events         | Generators fit the current runner, but observer-only behavior and machine rollback still require care.                                                       | Copy scratch grids/pmap into a trace buffer at hooks; emit after synchronous generation. Play the stored trace in JS; no Asyncify needed for playback.                                        |
| Bundle         | Potentially smaller, tree-shakeable JS, but catalogs and transitive logic remain substantial.                                                                | Extra WASM/runtime download; omit SDL, ncurses, tiles and unrelated assets. Use worker-side lazy loading for the Brogue view.                                                                 |
| Size estimate  | Planning allowance 0.2–1 MiB compressed for engine/data JS.                                                                                                  | Planning allowance 0.5–2 MiB compressed WASM plus glue.                                                                                                                                       |
| Maintenance    | Every relevant upstream behavioral change needs a new port and differential tests; easy to miss RNG-only changes.                                            | Pin upstream revision, maintain a small patch series, regenerate both native and WASM fixtures when deliberately upgrading.                                                                   |
| Principal risk | A visually plausible port can still silently produce the wrong seed.                                                                                         | ABI/undefined behavior differences, build tooling, trace size, and unintentionally changing generation while instrumenting it.                                                                |

Bundle figures are **unverified planning allowances**, not measured outputs or advantages. This environment has no `emcc`; installed clang 22.1.8 with `--target=wasm32` failed compiling `Math.c` because `time.h` was unavailable (no WASM libc/sysroot). A WASM build, compressed size and native/WASM identity remain Phase 2 gates. Bare clang is not a libc/platform solution; prefer a pinned Emscripten SDK unless a WASI runtime design is deliberately chosen.

### Headless/state boundary

The native build already works with `GRAPHICS=NO TERMINAL=NO RELEASE=YES`, using `src/platform/null-platform.c`. It needs no SDL, ncurses or image assets. That is a useful starting backend, **not** a ready-to-export WASM API: its game loop exits, and the general platform layer still contains filesystem/time facilities.

The exported wrapper should follow `printSeedCatalog`: initialize the standard variant; set `rogue.nextGame = NG_NOTHING`, clear recording paths and playback flags, initialize once, run first entries sequentially, then free everything. No game loop or input waits. Audit reachable filesystem calls and either keep a minimal virtual filesystem or make the unused catalog path explicit; do not stub gameplay functions that consume substantive RNG.

Keep `rogue`, `levels`, player, `pmap`, scent/path/choke grids, creature lists, floor/pack items, mutable item frequencies/flavors, dungeon-feature eligibility, colors and both RNG streams in the same instance. Arrays and enums must be serialized field by field, never by transferring native `pcell` bytes: struct padding and `long` widths differ between native LP64 and WASM32. Brogue's fixed-point type is `long long`; retain its 64-bit arithmetic. Audit flags, casts and variadic formats on WASM32 and compare to native fixtures before accepting any result.

## What reproducing depth N actually requires

### Define the two final-map boundaries

1. **Architect-complete:** terrain immediately after the successful `digDungeon()` call. This is the end of the architect animation, but does not contain the finished entered level.
2. **First-entry complete:** terrain immediately after `startLevel()` returns, as seed catalog does. This includes stairs, population, amulet fallback, the 50 environment updates and remaining entry processing. Use this as the hard final-map fixture boundary, while retaining architect-complete checkpoints for explanations/tests.

The recommended guarantee is the standard game's **canonical fresh, sequential first-entry sequence**, matching seed catalog. A seed and depth do not encode a player's inventory, route, previous environment turns, creatures/items falling between levels or subsequent map evolution. Do not claim this reproduces every possible played save at depth N. Preserve that distinction in the UI.

### Measured ablations

Built the exact revision natively with GCC 16.2.1 on Linux x86-64, optimized `-O2`, standard variant, null platform. Compared all four numeric terrain layers for each of 2,291 cells, with row-major coordinates (`index = y * 79 + x`). A cell counts as different if **any** layer differs; flags, volume, items and monsters are not part of this comparison.

Seeds: `1`, `12345`, `4294967295` (legacy maximum), `4294967296` (first high-bit seed), `18446744073709551614` (large 64-bit seed). Depths: 1, 13, 26. There are 15 baseline runs and 60 ablation runs. The retained [probe patch](phase1-evidence/probe.patch) and [complete comparison CSV](phase1-evidence/comparisons.csv) make the scope explicit.

For depth 13/26, each ablation changes only the following:

- `direct`: initialize normally, then start the catalog loop at N rather than 1. Retain all other catalog calls, including its `oldLevelNumber = N - 1` argument.
- `no-items`: omit **ordinary** `populateItems(upLoc)` on depths strictly less than N. Do not remove item generation inside machines or population at N.
- `no-monsters`: similarly omit only ordinary `populateMonsters()` below N; machine monsters remain.
- `no-env`: omit only the environment warm-up loop below N, not at N.
- `reset-rewards`: generate prior depths normally, then zero `rogue.rewardRoomsGenerated` immediately before target generation.
- `reset-metered`: generate prior depths normally, then reset all metered-item counts/frequencies to initialization values immediately before target generation.

Each run records `dig` after `digDungeon()`, `initialized` after stairs/population/waypoints/color shuffle/amulet fallback but before RNG restoration and warm-up, and `entry` after `startLevel()` returns. A stair-generation retry overwrites `dig`, so it represents the last attempt, not every attempt.

| Change                          | Target `dig` differing cells, range across 10 cases | Target `entry` differing cells, range across 10 cases | Cases with `entry` differences |
| ------------------------------- | --------------------------------------------------: | ----------------------------------------------------: | -----------------------------: |
| Skip depths 1…N−1               |                                             276–580 |                                               290–610 |                          10/10 |
| Omit prior ordinary items       |                                                   0 |                                                 8–184 |                          10/10 |
| Omit prior ordinary monsters    |                                                   0 |                                                 0–187 |                           8/10 |
| Omit prior environment updates  |                                                   0 |                                                 0–201 |                           6/10 |
| Reset target reward-room count  |                                             276–580 |                                               292–632 |                          10/10 |
| Reset target metered-item state |                                                   0 |                                                  0–27 |                           6/10 |

Additionally, **all 15 baselines** differ between architect-complete and entry-complete: 9–170 cells. Between `initialized` and `entry`, 9/15 differ, by 1–164 cells. The difference is not merely a visual stairs marker: environment updates change terrain layers too.

Controls: for all 15 seed/depth pairs, catalog stdout was byte-identical between an unmodified native binary, the probe binary with observation disabled, and the probe binary with observation enabled. A second enabled run reproduced all three terrain dumps byte for byte. This validates repeatability and provides a noninterference check on catalog contents; it is **not** a proof that arbitrary future hooks preserve every RNG state.

### Interpretation and required execution

The cross-level architect difference is demonstrated, not guessed: resetting reward-room history changes target `dig`, and `addMachines` reads it to choose/count machines (`Architect.c` 1759–1772). Ordinary population ablations happened to preserve target `dig` in every measured case, but that is **not** evidence that machine items/monsters can be skipped or that population can be removed from first-entry fixtures. `buildAMachine` calls `generateItem` and `spawnHorde` inside the architect (around lines 1504–1592).

Ordinary item generation changes persistent metered counts/frequencies (`Items.c` 578–750). Prior population/warm-up changes the ongoing substantive RNG and potentially cross-level entity state. `startLevel` saves a newly drawn seed, seeds the level stream, generates/populates the level, then restores the saved seed **before** environment warm-up. This explains why prior work can affect entry terrain even when target `dig` stays identical. No reduced persistent-state shortcut has been proven.

For correctness, run this full reference path:

1. Initialize the **standard** `gameConst` variant and call `initializeRogue(gameSeed)` once. Preserve starting equipment/flavor initialization and mutable catalogs.
2. Derive every level seed **and stair coordinate in their interleaved upstream order**. High-bit game seeds use `rand_64bits`; legacy seeds use the two `rand_range(0, 9999)` draws. Do not independently hash `(gameSeed, depth)` or generate just N seed draws. `initializeRogue` also replaces a zero level seed with `i + 1`.
3. For depths 1 through N call `startLevel(depth == 1 ? 1 : depth - 1, 1)` in the catalog's state/order. Preserve stairs failure retries, full machine items/monsters, ordinary population, amulet fallback and environment updates.
4. Emit detailed events only for the requested depth, but execute earlier depths fully. Capture target architect and entry checkpoints separately. Do not execute visual inspection dialogs.
5. Serialize all four `pmap.layers` with explicit coordinates, upstream terrain IDs and revision/variant metadata. Include volume, machine number and relevant flags in trace/checkpoints even though the minimum golden comparison is terrain layers.

The maximum unsigned seed `18446744073709551615` needs a direct seed-string wrapper/test: upstream seed catalog's `startingSeed + numberOfSeedsToScan` loop overflows for a one-seed scan at that value. The probe deliberately uses maximum minus one. Do not inherit that catalog loop in the exported single-seed API.

### Reproducing the experiment

Use a disposable checkout. The patch preserves the original source headers and is modified experimental code based on the pinned Brogue paths; it is not a production hook implementation.

```sh
git clone --branch v1.15.1 --depth 1 https://github.com/tmewett/BrogueCE.git BrogueCE
cd BrogueCE
git rev-parse HEAD
make GRAPHICS=NO TERMINAL=NO RELEASE=YES -j4
# Save this unmodified binary for the catalog-output control.
cp bin/brogue ../brogue-unmodified
git apply /absolute/path/to/docs/phase1-evidence/probe.patch
make GRAPHICS=NO TERMINAL=NO RELEASE=YES -j4
mkdir -p ../probe-output
# Output directory must exist; hook paths are absolute.
env PHASE1_OUT=/absolute/path/to/probe-output PHASE1_TARGET=13 \
  bin/brogue --print-seed-catalog 1 1 13
```

For each ablation add exactly one of `PHASE1_DIRECT=1`, `PHASE1_NO_ITEMS=1`, `PHASE1_NO_MONSTERS=1`, `PHASE1_NO_ENV=1`, `PHASE1_RESET_REWARDS=1` or `PHASE1_RESET_METERED=1` to `env`, using a separate output directory. Repeat for the five seeds and depths above. With neither output nor ablation environment variables, the patched binary provides the disabled-observer control. Compare catalog stdout with the saved unmodified binary.

Dump format: one cell per line in y-then-x order, four decimal terrain IDs each followed by a space, then LF. Each baseline's `entry_sha256` in the CSV hashes those exact bytes. These hashes/ablation dumps are investigation evidence, **not** the final Phase 2 golden fixture suite; production fixtures should use a versioned explicit schema and a dump-only observer without ablations.

## Playback granularity and event contract

Use phase checkpoints for navigation and reversible mutation batches for detailed stepping. Default to one actual candidate/result or committed operation, not a frame per cell or every obviously impossible scan coordinate.

| Phase / source                                                                                                             | Detailed events and intermediate state                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Granite: `clearLevel`                                                                                                      | Initial four-layer snapshot; clear transient overlays                                                                                                                                                                                    |
| Rooms: `carveDungeon`, `designRandomRoom`, `attachRooms`, `roomFitsAt`                                                     | First-room/design snapshot, room type/hallway and local door sites; each viable alignment tested, accepted insertion, exhausted room attempt. Show candidate footprint plus first actual bounds/neighbor-collision witness on rejection. |
| Loops: `addLoops`                                                                                                          | Each two-sided candidate reaching the distance check, endpoints and computed distance, rejection or new door site (`2`). Keep scratch room grid separate from pmap.                                                                      |
| Terrain conversion: `digDungeon`, `finishWalls(false)`                                                                     | Door-site overlay survives grid disposal; resulting floors/60% door rolls/walls as a mutation batch                                                                                                                                      |
| Lakes: `designLakes`, `lakeDisruptsPassability`, `fillLakes`, `createWreath`                                               | Blob design, every placement outcome, footprint and actual unreachable dry-cell/flood-fill witness when rejected; liquid selection, deep region and shallow wreath                                                                       |
| Decoration: `runAutogenerators(false)`, `removeDiagonalOpenings`                                                           | Per autogenerator attempt/result where useful, plus phase snapshots of dungeon features and diagonal repair                                                                                                                              |
| Chokes/machines: `analyzeMap(true)`, `addMachines`, `buildAMachine`                                                        | Choke map after analysis, blueprint/origin/interior, each machine attempt outcome and feature batch; show failed/rolled-back attempts separately. Include nested adoption/recursion IDs.                                                 |
| Final architecture: `runAutogenerators(true)`, `cleanUpLakeBoundaries`, `buildABridge`, `finishDoors`, `finishWalls(true)` | Each bridge candidate reaching its substantive validity checks/result, committed span; separate checkpoints for machine decoration, boundaries, bridges and finishing                                                                    |
| Stairs/population: `placeStairs`, `initializeLevel`                                                                        | Stair result, full-generation retry when stairs fail, population/amulet checkpoint; preserve actual behavior even on failed generation                                                                                                   |
| First entry: `startLevel`, `updateEnvironment`                                                                             | Each of 50 warm-up iterations, followed by final entry checkpoint and player/stairs positions                                                                                                                                            |

Use the `D_INSPECT_LEVELGEN` boundaries as hook locations, **not** by enabling that flag: those blocks draw and wait for input. Add explicit observers for rejected placements, machine rollbacks, scratch grids and environment steps, which those blocks do not fully expose. Compute rejection metadata within existing checks; do not rerun checks that might mutate state or consume RNG. For unavailable diagnostics report `unknown`, not an invented reason.

Proposed serialized schema (design only):

```ts
type TraceHeader = {
  schemaVersion: 1
  upstreamCommit: string
  variant: "brogue"
  seed: string
  depth: number
  width: 79
  height: 29
  terrainOrder: readonly ["DUNGEON", "LIQUID", "GAS", "SURFACE"]
  boundary: "canonical-first-entry"
}

type Write = {
  plane: "terrain" | "volume" | "flags" | "machine" | "roomGrid"
  layer?: number
  index: number
  before: number
  after: number
}

type TraceEvent = {
  sequence: number
  generationAttempt: number
  phase: string
  sourceFunction: string
  kind: "phase" | "candidate" | "result" | "mutation" | "checkpoint"
  attemptId?: number
  parentAttemptId?: number
  outcome?: "accepted" | "rejected" | "rolled-back" | "exhausted"
  reason?: string
  details?: {
    roomType?: string
    hallway?: boolean
    blueprint?: number
    origin?: number
    translation?: readonly [number, number]
    endpoints?: readonly [number, number]
    pathDistance?: number
    iteration?: number
  }
  writes: readonly Write[]
  overlay?: {
    kind: "room" | "doors" | "loop" | "lake" | "choke" | "machine" | "bridge"
    indices: Uint16Array
    values?: Int16Array
    witness?: number
  }
  markers?: { up: number; down: number; player: number }
  checkpointId?: number
}
```

`terrainOrder` is upstream enum order, **not** drawing priority. Canonical row-major indices are independent of C's `pmap[x][y]` layout. A checkpoint stores owned copies of all board planes, markers, diagnostic overlay and phase. Room grids use signed 16-bit values (including `-1`); terrain IDs use unsigned 16-bit arrays. Export explicit numeric flags, not struct memory.

Copy data before local grids are freed or reused and before returning from hooks. Do not retain views into a growing WASM heap. Diagnostic overlays replace/clear explicitly and never mutate terrain. A failed machine can have interim writes before rollback; record those writes and their inverse, or capture an isolated candidate preview with only the committed state delta. Either way, replay must end at the real engine state.

Play/pause/speed/single-step consume stored events; reverse steps apply `before` values, restoring overlays/markers from stored prior state or nearest checkpoint. Phase scrub restores a checkpoint and replays forward. Event sequence and phase are independent of animation speed. A completed engine run returns both trace and final terrain; every phase replay must match observer-disabled checkpoints. Check substantive and cosmetic RNG states too using test-only exports; terrain equality alone is not sufficient evidence of RNG neutrality.

Store checkpoints per phase, not a full pmap for every candidate: four uint16 terrain planes alone cost 18,328 bytes per full map, before metadata/overlays. Use packed reversible deltas and bounded worker-to-main chunks. Never silently drop rejections to stay within a cap; surface a trace-limit failure or offer an explicit phase-only mode. Establish real trace-size limits with representative seeds in Phase 2.

## Rendering and retained architecture

Reuse the separation of imperative simulation/rendering from Solid controls and the requestAnimationFrame speed loop in `src/sim.ts`. Keep generic `board.ts`/`render.ts` behavior unchanged; add a Brogue-specific layered board/trace adapter and canvas glyph renderer. The current one-pixel-per-cell renderer cannot display glyphs: cache glyph/color drawing at character resolution, with no per-cell DOM/signals. Generation happens off the UI thread; rendering does not drive engine RNG.

Use `tileCatalog.character`, foreground/background color definitions and display priority from `Globals.c`, the display glyph enum in `Rogue.h`, and `glyphToUnicode` in `platformdependent.c`. For example walls map to `#`, closed doors to `+`, and floors to the Unicode middle dot. Do not confuse glyph enum IDs with Unicode code points. Source colors contain 0–100 channels, randomness and depth-dependent interpolation, not just CSS RGB literals. Export catalog values and use the game's deterministic cosmetic values or clearly documented source-derived unlit terrain colors. Exact screenshot/lighting reproduction is distinct from terrain-layer correctness and is not measured here.

The Brogue view should have the requested unofficial tool title, seed/depth controls, canvas, short source-named phase explanation and complete overlay legend; no hero/cards/gradients. Draw player/stairs/markers above overlays. Keep UI text non-monospace outside the map. Use a responsive map container at phone width and scoped keyboard shortcuts that do not hijack seed input. Seed/depth/phase belong in a separate Brogue hash namespace; keep existing algorithm hashes resolvable. Detailed visual/browser validation waits for implementation.

Input contract: canonical unsigned decimal seed strings in `1…18446744073709551615`, matching Brogue's displayed decimal representation and `tryParseUint64`; no floating-point conversion. Validate with `BigInt`, then pass a decimal string or two exact uint32 halves to C. Reject negative, zero, overflow, exponent, hex and fractional seeds with a clear message. Upstream's round-trip parser also rejects leading zeroes/signs/whitespace. Depth must be an integer 1…26. Tests must include values above JS's safe-integer boundary and the uint32 seeding transition.

## Work estimate and acceptance gates

Estimates assume one developer familiar with C and web tooling; they are not elapsed measurements or commitments.

| Work                                                                              | C: WASM         | B: TS                                                                      |
| --------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------- |
| Pinned build, exported headless path, native dump fixtures and native/WASM parity | 3–6 days        | 2–3 weeks for initial architect/RNG/catalog port                           |
| Detailed neutral hooks, rejected candidates, rollback trace and replay tests      | 5–8 days        | 3–6 additional weeks for item/monster/environment/state parity and tracing |
| Brogue glyph renderer, controls, phase prose, hashes, retained algorithms view    | 5–8 days        | Same shared work                                                           |
| Broader fixtures, bounds/errors, mobile/browser checks and deploy validation      | 3–5 days        | 1–2 additional weeks, depending on parity failures                         |
| Overall planning range                                                            | About 3–6 weeks | About 7–13 weeks                                                           |

Prioritize these gates after confirmation:

1. Pin the upstream source and Emscripten SDK. Expose only the standard variant; prove first-entry terrain equality between native and WASM before UI work. No approximate port or reduced state path as a fallback.
2. Generate native dump-only fixtures for the five measured seeds × depths 1/13/26, plus boundary/error cases and stairs-retry seeds. Include RNG vectors for both streams, legacy/high-bit seed derivation and range rejection. Fixture metadata must record commit, variant, boundary, dimensions, terrain order and generation command.
3. Verify instrumented versus noninstrumented terrain **at every phase**, final state and RNG state; verify forward/reverse/checkpoint replay and machine/stairs retries. Keep v1.15.1 behavior even if upstream later fixed it.
4. Add Brogue UI/renderer without removing existing algorithms or breaking their links/tests. Add clear invalid-input and generation/worker failure handling.
5. Keep all build/fixture tooling behind Deno tasks, using Deno TS scripts to invoke pinned native/WASM toolchains. Only then update build/Pages automation; no CI modifications in this phase.
6. Pass fmt/lint/typecheck/test/build, inspect desktop/phone playback for several seeds/depths and console errors, then separately verify the pushed Pages deployment. None of these Phase 2 acceptance items is claimed complete here.

Main risks: WASM32 integer/ABI divergence; native undefined behavior; hidden persistent/mutable state; machine rollback/recursive tracing; failed stair-generation side effects; huge detailed traces; generation cancellation and repeat-session resets; depth-26 warm-up altering many cells; responsive glyph legibility; upstream revision drift. Mitigate with differential fixtures, fresh worker instances, neutral hooks, explicit state boundaries and trace memory measurements, not visually similar approximations.

## Repository validation

After adding this report/evidence, `deno fmt --check`, `deno task lint`, `deno task typecheck`, `deno task test` (50 passed) and `deno task build` passed locally. The existing algorithm sources and UI were not changed. Browser playback, WASM correctness and Pages deployment were not tested because Phase 2 has not started.

## License, attribution and related upstream work

Brogue code is AGPL-3.0-or-later with original Brian Walker notices. Preserve those headers in every vendored/modified file and add origin path, pinned commit and modification notice. A submodule or copied source tree must be pinned; distribute the integration patches/build recipe and corresponding source. Do not import `tiles.png` or Oryx art. The proposed text-mode renderer needs no tileset; using `tiles.png` later would separately require CC BY-SA 4.0 attribution/share-alike compliance.

Phase 2 site title/footer and README must say **unofficial**, link [Brogue CE](https://github.com/tmewett/BrogueCE), credit Brian Walker and CE maintainers, and document dev commands and fixture generation. Leave the current README's algorithm description accurate until the Brogue view exists.

Relevant upstream context found by searching `tmewett/BrogueCE` issues for `level generation seed` / `seed generation`, and PRs for `wasm` / `level generation`:

- [#68, Generated items differ between ARM and x86](https://github.com/tmewett/BrogueCE/issues/68): historical reproducibility warning, not evidence of a remaining v1.15.1 bug. Confirms why native/WASM comparisons must include downstream generation, not just rooms.
- [#868, Clear items and monsters when level generation fails](https://github.com/tmewett/BrogueCE/pull/868): later retry cleanup fix touching `RogueMain.c`, `Items.c`, `Rogue.h`. The pinned release does not have that retry cleanup; do not silently cherry-pick it into a v1.15.1 visualizer.
- [#120, Enhance the seed catalog](https://github.com/tmewett/BrogueCE/pull/120): catalog handles machine keys, carried items and allies, reinforcing its value as the headless reference.

No WASM PR was returned by that bounded search. No existing implementation was established that satisfies this visualizer's exact-release and rejected-candidate trace requirements. This is a feature feasibility investigation, not an attribution of a newly introduced repository bug.

**Confirmation needed:** approve C (recommended) or choose B before starting Phase 2. In either case, retain the existing algorithms and use canonical first-entry terrain plus architect checkpoints as the proposed correctness boundary.

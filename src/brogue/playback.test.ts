import { assertEquals, assertThrows } from "@std/assert"
import { createPlayback } from "./playback.ts"
import { replayTrace } from "./trace.ts"
import { BROGUE_CELL_COUNT, TERRAIN_ORDER, UPSTREAM_COMMIT } from "./types.ts"
import type { CheckpointState, EngineResult, TraceEvent } from "./types.ts"

const fixture = (): EngineResult => {
  const initial: CheckpointState = {
    terrain: [
      new Uint16Array(BROGUE_CELL_COUNT),
      new Uint16Array(BROGUE_CELL_COUNT),
      new Uint16Array(BROGUE_CELL_COUNT),
      new Uint16Array(BROGUE_CELL_COUNT),
    ],
    volume: new Uint16Array(BROGUE_CELL_COUNT),
    flags: new Uint32Array(BROGUE_CELL_COUNT),
    machine: new Int16Array(BROGUE_CELL_COUNT),
    markers: { up: -1, down: -1, player: -1 },
    phase: "clearLevel",
    sequence: -1,
  }
  const events: TraceEvent[] = [
    {
      sequence: 0,
      generationAttempt: 1,
      phase: "clearLevel",
      sourceFunction: "clearLevel",
      kind: "phase",
      writes: [[0, 0, 42, 0, 1]],
    },
    {
      sequence: 1,
      generationAttempt: 1,
      phase: "rooms",
      sourceFunction: "attachRooms",
      kind: "mutation",
      writes: [[0, 0, 42, 1, 2]],
      overlay: { kind: "room", indices: new Uint16Array([42]) },
    },
    {
      sequence: 2,
      generationAttempt: 1,
      phase: "firstEntry",
      sourceFunction: "startLevel",
      kind: "checkpoint",
      writes: [[0, 1, 73, 0, 3], [5, 0, 0, -1, 42], [5, 0, 1, -1, 73], [
        5,
        0,
        2,
        -1,
        41,
      ]],
      markers: { up: 42, down: 73, player: 41 },
    },
  ]
  return {
    header: {
      schemaVersion: 1,
      upstreamCommit: UPSTREAM_COMMIT,
      variant: "brogue",
      seed: "1",
      depth: 1,
      width: 79,
      height: 29,
      terrainOrder: TERRAIN_ORDER,
      boundary: "canonical-first-entry",
    },
    events,
    checkpoints: [{ id: 0, state: initial }, {
      id: 1,
      state: replayTrace(initial, { events, through: 1 }),
    }],
    final: { id: 2, state: replayTrace(initial, { events }) },
    tileCatalog: [],
    rngState: [],
  }
}

Deno.test("playback: forward/back/scrub agree with replay from initial state", () => {
  const result = fixture()
  const playback = createPlayback(result)
  for (const position of [0, 1, 3, 2, 1, 0, 3, 0, 2]) {
    assertEquals(
      playback.seek(position),
      replayTrace(result.checkpoints[0].state, {
        events: result.events,
        through: position,
      }),
    )
    assertEquals(playback.cursor(), position)
  }
  assertEquals(result.checkpoints[0].state.terrain[0][42], 0)
})

Deno.test("playback: invalid scrub positions fail instead of corrupting cursor", () => {
  const playback = createPlayback(fixture())
  for (const position of [-1, 0.5, 4, NaN, Infinity]) {
    assertThrows(
      () => playback.seek(position),
      Error,
      "Step must be an integer",
    )
    assertEquals(playback.cursor(), 0)
  }
})

Deno.test("playback: missing initial checkpoint is a clear trace error", () => {
  const result = fixture()
  assertThrows(
    () => createPlayback({ ...result, checkpoints: [] }),
    Error,
    "initial checkpoint",
  )
})

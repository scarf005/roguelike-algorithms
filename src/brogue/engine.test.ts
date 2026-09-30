import { assert, assertEquals } from "@std/assert"
import { generateLevel, type RngVector, rngVectors } from "./engine.ts"
import { createPlayback } from "./playback.ts"
import { replayTrace, reverseTrace } from "./trace.ts"
import { BROGUE_CELL_COUNT, TERRAIN_ORDER, UPSTREAM_COMMIT } from "./types.ts"

const fixtureDirectory = new URL("./fixtures/", import.meta.url)
type Fixture = {
  upstreamCommit: string
  seed: string
  depth: number
  width: number
  height: number
  terrainOrder: readonly string[]
  terrain: number[][]
}
const baselineHashes = async () => {
  const text = await Deno.readTextFile(
    new URL("../../docs/phase1-evidence/comparisons.csv", import.meta.url),
  )
  return new Map(
    text.trim().split(/\r?\n/).slice(1).flatMap((row) => {
      const columns = row.split(",")
      return columns[2] === "baseline"
        ? [[`${columns[0]}/${columns[1]}`, columns[8]]]
        : []
    }),
  )
}
const terrainHash = async (terrain: number[][]) => {
  // The original native probe printed four layers, a trailing space, and LF per cell.
  const dump = Array.from(
    { length: BROGUE_CELL_COUNT },
    (_, index) => `${terrain.map((plane) => plane[index]).join(" ")} \n`,
  ).join("")
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(dump),
  )
  return Array.from(
    new Uint8Array(bytes),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("")
}

Deno.test("Brogue: every native fixture matches pinned WASM and reversible replay", async () => {
  const hashes = await baselineHashes()
  const matched = new Set<string>()
  const overlays = new Set<string>()
  for await (const entry of Deno.readDir(fixtureDirectory)) {
    if (!/^\d+-\d+\.json$/.test(entry.name)) continue
    const fixture = JSON.parse(
      await Deno.readTextFile(new URL(entry.name, fixtureDirectory)),
    ) as Fixture
    const key = `${fixture.seed}/${fixture.depth}`
    assertEquals(fixture.upstreamCommit, UPSTREAM_COMMIT)
    assertEquals([fixture.width, fixture.height], [79, 29])
    assertEquals(fixture.terrainOrder, TERRAIN_ORDER)
    const result = await generateLevel({
      seed: fixture.seed,
      depth: fixture.depth,
    })
    for (const event of result.events) {
      if (event.overlay) overlays.add(event.overlay.kind)
    }
    const terrain = result.final.state.terrain.map((plane) => Array.from(plane))
    assertEquals(terrain, fixture.terrain, `native/WASM mismatch at ${key}`)
    if (hashes.has(key)) {
      assertEquals(
        await terrainHash(terrain),
        hashes.get(key),
        `pristine native baseline ${key}`,
      )
    }
    for (const [role, position] of Object.entries(result.final.state.markers)) {
      assert(
        position >= 0,
        `final ${role} marker exists, including the depth-1 exit: ${key}`,
      )
    }
    const initial = result.checkpoints[0].state
    assertEquals(
      replayTrace(initial, { events: result.events }),
      result.final.state,
      `forward replay ${key}`,
    )
    assertEquals(
      reverseTrace(result.final.state, { events: result.events }),
      initial,
      `inverse replay ${key}`,
    )
    // Scrub checkpoints and step back must agree with replay, without mutating the fixtures.
    const playback = createPlayback(result)
    for (const checkpoint of [...result.checkpoints].reverse()) {
      assertEquals(
        playback.seek(checkpoint.state.sequence + 1),
        checkpoint.state,
        `scrub checkpoint ${key}`,
      )
    }
    matched.add(key)
  }
  for (const key of hashes.keys()) {
    assert(matched.has(key), `missing native fixture ${key}`)
  }
  assert(
    matched.has("18446744073709551615/26"),
    "uint64 maximum bypasses catalog end-bound overflow",
  )
  assert(
    overlays.has("bridge"),
    "actual bridge spans are visible across the native cases",
  )
  assert(
    overlays.has("loop"),
    "actual loop candidates are visible across the native cases",
  )
})

Deno.test("Brogue: both WASM RNG streams match independently generated native vectors", async () => {
  const fixture = JSON.parse(
    await Deno.readTextFile(new URL("rng-vectors.json", fixtureDirectory)),
  ) as {
    upstreamCommit: string
    count: number
    vectors: RngVector[]
  }
  assertEquals(fixture.upstreamCommit, UPSTREAM_COMMIT)
  assertEquals(fixture.vectors.length, 10)
  for (const vector of fixture.vectors) {
    assertEquals(
      await rngVectors(vector.seed, vector.stream, fixture.count),
      vector,
    )
  }
})

Deno.test("Brogue: detailed events match real phase-only checkpoints and RNG", async () => {
  const options = { seed: "12345", depth: 13 }
  const full = await generateLevel({ ...options, mode: "full" })
  const phase = await generateLevel({ ...options, mode: "phase" })
  const initial = full.checkpoints[0].state
  const fullBoundaries = full.events.filter((event) => event.kind === "phase")
  assertEquals(fullBoundaries.length, phase.events.length)
  for (let index = 0; index < phase.events.length; index++) {
    const boundary = fullBoundaries[index]
    const reference = phase.events[index]
    assertEquals([
      boundary.phase,
      boundary.sourceFunction,
      boundary.generationAttempt,
    ], [reference.phase, reference.sourceFunction, reference.generationAttempt])
    const actual = replayTrace(initial, {
      events: full.events,
      through: boundary.sequence + 1,
    })
    const expected = replayTrace(phase.checkpoints[0].state, {
      events: phase.events,
      through: reference.sequence + 1,
    })
    assertEquals({ ...actual, sequence: 0, activeOverlay: undefined }, {
      ...expected,
      sequence: 0,
      activeOverlay: undefined,
    }, `phase ${boundary.phase}`)
    assertEquals(
      boundary.rngState,
      reference.rngState,
      `phase RNG ${boundary.phase}`,
    )
  }
  assertEquals(full.rngState, phase.rngState)
  assertEquals(
    full.events.filter((event) => event.kind === "environment-step").map((
      event,
    ) => event.details?.iteration),
    Array.from({ length: 50 }, (_, index) => index + 1),
  )
  assert(
    full.events.some((event) => event.overlay?.kind === "loop"),
    "actual loop candidates are visible",
  )
  assert(
    full.events.some((event) =>
      event.overlay?.kind === "room" && event.outcome === "rejected"
    ),
  )
  assert(
    full.events.some((event) =>
      event.overlay?.kind === "lake" && event.outcome === "rejected"
    ),
  )
})

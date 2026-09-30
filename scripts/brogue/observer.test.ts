import { assert, assertEquals } from "@std/assert"

type WasmModule = {
  _engine_generate: (high: number, low: number, depth: number) => number
  _engine_set_mode: (mode: number) => void
  _engine_result_ptr: () => number
  _engine_result_len: () => number
  UTF8ToString: (pointer: number, length: number) => string
}

type Markers = {
  up: number
  down: number
  player: number
}

type State = {
  terrain: number[][]
  volume: number[]
  flags: number[]
  machine: number[]
  roomGrid: number[]
  markers: Markers
}

type Write = [
  plane: number,
  layer: number,
  index: number,
  before: number,
  after: number,
]

type Overlay = {
  kind: string
  sourceKind: string
  indices: number[]
  values: number[]
}

type Event = {
  sequence: number
  phase: string
  kind: string
  reason: string
  outcome: string
  details: Record<string, unknown>
  writes: Write[]
  overlay?: Overlay
  markers: Markers
  rngState: number[]
}

type Dump = {
  events: Event[]
  checkpoints: Array<{ id: number; state: State }>
  final: State & { sequence: number }
  rngState: number[]
}

const cases = [
  { seed: 1n, depth: 13 },
  { seed: 4_294_967_296n, depth: 26 },
  { seed: 18_446_744_073_709_551_615n, depth: 26 },
]

const load = async (): Promise<WasmModule> => {
  const imported = await import(
    new URL("../../public/brogue/brogue.js", import.meta.url).href
  ) as {
    default: (options: { wasmBinary: ArrayBuffer }) => Promise<WasmModule>
  }
  const bytes = await Deno.readFile(
    new URL("../../public/brogue/brogue.wasm", import.meta.url),
  )
  return await imported.default({ wasmBinary: bytes.buffer as ArrayBuffer })
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const generate = (
  { module, mode, seed, depth }: {
    module: WasmModule
    mode: number
    seed: bigint
    depth: number
  },
): Dump => {
  module._engine_set_mode(mode)
  assert(
    module._engine_generate(
      Number(seed >> 32n),
      Number(seed & 0xffff_ffffn),
      depth,
    ),
    `WASM rejected ${seed}/${depth}`,
  )
  return JSON.parse(
    module.UTF8ToString(
      module._engine_result_ptr(),
      module._engine_result_len(),
    ),
  ) as Dump
}

const currentValue = (state: State, write: Write): number => {
  const [plane, layer, index] = write
  if (plane === 0) return state.terrain[layer][index]
  if (plane === 1) return state.volume[index]
  if (plane === 2) return state.flags[index]
  if (plane === 3) return state.machine[index]
  if (plane === 4) return state.roomGrid[index]
  if (plane === 5) {
    if (index === 0) return state.markers.up
    if (index === 1) return state.markers.down
    if (index === 2) return state.markers.player
  }
  throw new Error(`unknown observer write plane/index: ${plane}/${index}`)
}

const setValue = (
  { state, write, value }: { state: State; write: Write; value: number },
): void => {
  const [plane, layer, index] = write
  if (plane === 0) state.terrain[layer][index] = value
  else if (plane === 1) state.volume[index] = value
  else if (plane === 2) state.flags[index] = value
  else if (plane === 3) state.machine[index] = value
  else if (plane === 4) state.roomGrid[index] = value
  else if (plane === 5 && index === 0) state.markers.up = value
  else if (plane === 5 && index === 1) state.markers.down = value
  else if (plane === 5 && index === 2) state.markers.player = value
  else throw new Error(`unknown observer write plane/index: ${plane}/${index}`)
}

const apply = (
  { state, write, reverse }: { state: State; write: Write; reverse: boolean },
): void => {
  const [, , , before, after] = write
  const expected = reverse ? after : before
  const next = reverse ? before : after
  assertEquals(
    currentValue(state, write),
    expected,
    "observer write is not reversible",
  )
  setValue({ state, write, value: next })
}

const replay = (dump: Dump): { initial: State; final: State } => {
  const initial = clone(dump.checkpoints[0].state)
  const state = clone(initial)
  for (const event of dump.events) {
    for (const write of event.writes) {
      apply({ state, write, reverse: false })
    }
    assertEquals(
      state.markers,
      event.markers,
      `marker mismatch at ${event.sequence}`,
    )
  }
  return { initial, final: state }
}

const assertReverseReplay = (dump: Dump): void => {
  const { initial, final } = replay(dump)
  assertEquals(final.terrain, dump.final.terrain)
  assertEquals(final.volume, dump.final.volume)
  assertEquals(final.flags, dump.final.flags)
  assertEquals(final.machine, dump.final.machine)
  assertEquals(final.markers, dump.final.markers)
  const reverse = clone(final)
  for (let eventIndex = dump.events.length - 1; eventIndex >= 0; eventIndex--) {
    const event = dump.events[eventIndex]
    for (
      let writeIndex = event.writes.length - 1;
      writeIndex >= 0;
      writeIndex--
    ) {
      apply({
        state: reverse,
        write: event.writes[writeIndex],
        reverse: true,
      })
    }
  }
  assertEquals(reverse, initial)
}

const assertObserverModes = (
  { module, seed, depth }: { module: WasmModule; seed: bigint; depth: number },
): void => {
  const off = generate({ module, mode: 0, seed, depth })
  const phase = generate({ module, mode: 1, seed, depth })
  const full = generate({ module, mode: 2, seed, depth })
  assertEquals(off.events, [])
  assertEquals(
    off.final,
    { ...full.final, sequence: -1 },
    "observer-off changed the generated state",
  )
  assertEquals(off.rngState, full.rngState)
  assertEquals(phase.final.terrain, full.final.terrain)
  assertEquals(phase.final.volume, full.final.volume)
  assertEquals(phase.final.flags, full.final.flags)
  assertEquals(phase.final.machine, full.final.machine)
  assertEquals(phase.final.markers, full.final.markers)
  assertEquals(phase.rngState, full.rngState)
  assert(phase.events.every((event) => event.kind === "phase"))
  assertEquals(
    phase.events.map((event) => event.phase),
    full.events.filter((event) => event.kind === "phase").map((event) =>
      event.phase
    ),
  )
  assert(full.events.length > 1000)
  assertEquals(
    full.events.map((event) => event.sequence),
    full.events.map((_, index) => index),
  )
  assertReverseReplay(full)

  const overlayKinds = new Set(
    full.events.flatMap((event) => event.overlay?.kind ?? []),
  )
  for (
    const kind of [
      "roomCandidate",
      "scratchroomgrid",
      "lakeFootprint",
      "lakeFloodMap",
      "wreath",
      "chokeGrid",
      "machineInterior",
    ]
  ) assert(overlayKinds.has(kind), `missing ${kind} overlay`)
  for (const event of full.events) {
    if (event.overlay) {
      assertEquals(event.overlay.indices.length, event.overlay.values.length)
      assertEquals(event.overlay.kind, event.overlay.sourceKind)
    }
  }
  assert(full.final.roomGrid.every((value) => value === 0))
}

Deno.test("observer modes are neutral and replay every emitted plane", async () => {
  const module = await load()
  for (const { seed, depth } of cases) {
    assertObserverModes({ module, seed, depth })
  }
})

Deno.test("observer rejects invalid seeds and depths", async () => {
  const module = await load()
  module._engine_set_mode(2)
  assertEquals(module._engine_generate(0, 0, 1), 0)
  assertEquals(module._engine_generate(0, 1, 0), 0)
  assertEquals(module._engine_generate(0, 1, 27), 0)
})

Deno.test("native rollback reports the C restoration writes", async () => {
  const module = await load()
  const dump = generate({ module, mode: 2, seed: 1n, depth: 13 })
  const rollbackIndex = dump.events.findIndex((event) =>
    event.kind === "rollback"
  )
  assert(rollbackIndex >= 1, "seed 1 depth 13 did not exercise rollback")
  const rollback = dump.events[rollbackIndex]
  assertEquals(rollback.reason, "feature-instance-shortfall")
  assertEquals(rollback.details.actualRestoration, true)
  assert(
    rollback.writes.some(([plane, , , before, after]) =>
      plane >= 0 && plane <= 3 && before !== after
    ),
    "rollback did not expose restored C map writes",
  )
  assertReverseReplay(dump)
})

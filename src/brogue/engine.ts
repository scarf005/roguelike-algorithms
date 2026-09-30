import { validateDepth, validateSeed } from "./config.ts"
import { type BrogueModule, loadBrogueModule } from "./load.ts"
import { applyTraceEvent, replayTrace } from "./trace.ts"
import {
  BROGUE_CELL_COUNT,
  BROGUE_HEIGHT,
  BROGUE_WIDTH,
  type Checkpoint,
  type CheckpointState,
  type EngineResult,
  type OverlayKind,
  TERRAIN_ORDER,
  type TileCatalogEntry,
  type TraceEvent,
  type TraceOverlay,
  type TracePhase,
  UPSTREAM_COMMIT,
} from "./types.ts"

export { TERRAIN_ORDER, UPSTREAM_COMMIT, validateDepth, validateSeed }

export type GenerateOptions = {
  seed: string
  depth: number
  mode?: "full" | "phase" | "off"
  assetBase?: string
}

export type RngVector = {
  seed: string
  stream: 0 | 1
  values: number[]
  state: number[]
}

type SerializedOverlay = Omit<TraceOverlay, "kind" | "indices" | "values"> & {
  kind: string
  indices: number[]
  values?: number[]
}
type SerializedState =
  & Omit<
    CheckpointState,
    "terrain" | "volume" | "flags" | "machine" | "roomGrid" | "activeOverlay"
  >
  & {
    terrain: number[][]
    volume: number[]
    flags: number[]
    machine: number[]
    roomGrid?: number[]
    activeOverlay?: SerializedOverlay
  }
type SerializedEvent = Omit<TraceEvent, "overlay" | "previousOverlay"> & {
  overlay?: SerializedOverlay
  previousOverlay?: SerializedOverlay
}
type WasmCatalog = {
  id: number
  codePoint: number
  foreground: [number, number, number]
  background: [number, number, number]
  priority: number
}
type WasmResult = EngineResult["header"] & {
  events: SerializedEvent[]
  checkpoints: { id: number; state: SerializedState }[]
  final: SerializedState
  tileCatalog: WasmCatalog[]
  rngState: number[]
}

const OVERLAY_KINDS: Record<string, OverlayKind> = {
  scratchroomgrid: "room",
  roomCandidate: "room",
  doorSites: "doors",
  loopDoorSites: "loop",
  lakeFootprint: "lake",
  lakeFloodMap: "lake",
  wreath: "lake",
  chokeGrid: "choke",
  machineInterior: "machine",
  bridgeSpan: "bridge",
}
const witnessIndex = (witness: unknown): number | undefined => {
  if (Array.isArray(witness) && witness.length === 2) {
    const [x, y] = witness
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 &&
        x < BROGUE_WIDTH &&
        y >= 0 && y < BROGUE_HEIGHT
      ? y * BROGUE_WIDTH + x
      : undefined
  }
  return Number.isInteger(witness) && (witness as number) >= 0 &&
      (witness as number) < BROGUE_CELL_COUNT
    ? witness as number
    : undefined
}
const toOverlay = (
  overlay?: SerializedOverlay,
  witness?: unknown,
): TraceOverlay | undefined => {
  if (!overlay) return undefined
  const kind = OVERLAY_KINDS[overlay.kind]
  if (!kind) {
    throw new Error(`Unknown Brogue diagnostic buffer: ${overlay.kind}`)
  }
  return {
    ...overlay,
    kind,
    sourceKind: overlay.kind,
    indices: Uint16Array.from(overlay.indices),
    values: overlay.values && Int16Array.from(overlay.values),
    witness: witnessIndex(overlay.witness ?? witness),
  }
}
const toState = (state: SerializedState): CheckpointState => {
  const planes = [...state.terrain, state.volume, state.flags, state.machine]
  if (
    state.terrain.length !== 4 ||
    planes.some((plane) => plane.length !== BROGUE_CELL_COUNT)
  ) {
    throw new Error("Brogue engine returned invalid board dimensions.")
  }
  return {
    terrain: [
      Uint16Array.from(state.terrain[0]),
      Uint16Array.from(state.terrain[1]),
      Uint16Array.from(state.terrain[2]),
      Uint16Array.from(state.terrain[3]),
    ],
    volume: Uint16Array.from(state.volume),
    flags: Uint32Array.from(state.flags),
    machine: Int16Array.from(state.machine),
    roomGrid: state.roomGrid && Int16Array.from(state.roomGrid),
    markers: { ...state.markers },
    activeOverlay: toOverlay(state.activeOverlay),
    phase: state.phase,
    sequence: state.sequence,
  }
}
const catalogEntry = (entry: WasmCatalog): TileCatalogEntry => ({
  id: entry.id,
  character: String.fromCodePoint(entry.codePoint),
  glyphName: `glyph-${entry.codePoint}`,
  foreground: entry.foreground,
  background: entry.background,
  priority: entry.priority,
})
const resultText = (module: BrogueModule) =>
  module.UTF8ToString(module._engine_result_ptr(), module._engine_result_len())

const parseResult = (
  module: BrogueModule,
  options: GenerateOptions,
): EngineResult => {
  const raw = JSON.parse(resultText(module)) as WasmResult
  if (
    raw.schemaVersion !== 1 || raw.upstreamCommit !== UPSTREAM_COMMIT ||
    raw.variant !== "brogue" || raw.seed !== options.seed ||
    raw.depth !== options.depth ||
    raw.width !== BROGUE_WIDTH || raw.height !== BROGUE_HEIGHT ||
    raw.boundary !== "canonical-first-entry" ||
    raw.terrainOrder.join(",") !== TERRAIN_ORDER.join(",")
  ) {
    throw new Error(
      "Brogue engine metadata does not match the requested pinned release.",
    )
  }
  let previousOverlay: TraceOverlay | undefined
  let previousPhase: TracePhase = "clearLevel"
  const events: TraceEvent[] = raw.events.map((entry, sequence) => {
    if (entry.sequence !== sequence) {
      throw new Error("Brogue trace sequence is not contiguous.")
    }
    const overlay = toOverlay(entry.overlay, entry.details?.witness)
    const event = { ...entry, overlay, previousOverlay, previousPhase }
    previousOverlay = overlay
    previousPhase = entry.phase
    return event
  })
  const initial = raw.checkpoints.find((checkpoint) =>
    checkpoint.state.sequence === -1
  )
  if (!initial) throw new Error("Brogue engine returned no initial checkpoint.")
  const initialState = toState(initial.state)
  const checkpoints: Checkpoint[] = [{ id: 0, state: initialState }]
  const state = replayTrace(initialState, { events: [] })
  // Materialize only phase boundaries, not a board-sized copy per candidate.
  for (let index = 0; index < events.length; index++) {
    applyTraceEvent(state, events[index])
    if (
      index === 0 || events[index].kind === "phase" ||
      events[index].phase !== events[index - 1].phase
    ) {
      checkpoints.push({
        id: checkpoints.length,
        state: replayTrace(state, { events: [] }),
      })
    }
  }
  const final: Checkpoint = {
    id: checkpoints.length,
    state: toState(raw.final),
  }
  if (events.length && final.state.sequence !== events.length - 1) {
    throw new Error(
      "Brogue final checkpoint sequence does not match its events.",
    )
  }
  checkpoints.push(final)
  return {
    header: {
      schemaVersion: 1,
      upstreamCommit: UPSTREAM_COMMIT,
      variant: "brogue",
      seed: options.seed,
      depth: options.depth,
      width: BROGUE_WIDTH,
      height: BROGUE_HEIGHT,
      terrainOrder: TERRAIN_ORDER,
      boundary: "canonical-first-entry",
    },
    events,
    checkpoints,
    final,
    tileCatalog: raw.tileCatalog.map(catalogEntry),
    rngState: raw.rngState,
  }
}

export const rngVectors = async (
  seedInput: string,
  stream: 0 | 1,
  count = 16,
): Promise<RngVector> => {
  const seed = validateSeed(seedInput)
  if (
    (stream !== 0 && stream !== 1) || !Number.isInteger(count) || count < 0 ||
    count > 256
  ) {
    throw new Error(
      "RNG request must use stream 0 or 1 and a count from 0 to 256.",
    )
  }
  const value = BigInt(seed)
  const module = await loadBrogueModule()
  if (
    !module._engine_rng_vectors(
      Number(value >> 32n),
      Number(value & 0xffff_ffffn),
      stream,
      count,
    )
  ) {
    throw new Error("Brogue engine rejected the RNG vector request.")
  }
  return JSON.parse(resultText(module)) as RngVector
}

export const generateLevel = async (
  options: GenerateOptions,
): Promise<EngineResult> => {
  const seed = validateSeed(options.seed)
  const depth = validateDepth(options.depth)
  const value = BigInt(seed)
  const module = await loadBrogueModule(options.assetBase)
  module._engine_set_mode(
    options.mode === "off" ? 0 : options.mode === "phase" ? 1 : 2,
  )
  if (
    !module._engine_generate(
      Number(value >> 32n),
      Number(value & 0xffff_ffffn),
      depth,
    )
  ) {
    throw new Error("Brogue engine rejected the seed or depth.")
  }
  return parseResult(module, { ...options, seed, depth })
}

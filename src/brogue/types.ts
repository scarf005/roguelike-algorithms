export const BROGUE_WIDTH = 79
export const BROGUE_HEIGHT = 29
export const BROGUE_CELL_COUNT = BROGUE_WIDTH * BROGUE_HEIGHT
export const UPSTREAM_COMMIT = "1ba4240b7a928ddf0ffb772717bf1d433cd63804"

export const TERRAIN_ORDER = [
  "DUNGEON",
  "LIQUID",
  "GAS",
  "SURFACE",
] as const

export type TerrainName = typeof TERRAIN_ORDER[number]
export type BrogueSeed = string
export type BrogueDepth = number
export type TracePhase =
  | "clearLevel"
  | "rooms"
  | "loops"
  | "terrain"
  | "lakes"
  | "decoration"
  | "machines"
  | "finalArchitecture"
  | "stairsPopulation"
  | "firstEntry"

export type TraceHeader = {
  schemaVersion: 1
  upstreamCommit: string
  variant: "brogue"
  seed: BrogueSeed
  depth: BrogueDepth
  width: 79
  height: 29
  terrainOrder: typeof TERRAIN_ORDER
  boundary: "canonical-first-entry"
}

/** Packed reversible delta: [plane, layer, index, before, after]. */
export type Write = readonly [
  plane: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  layer: number,
  index: number,
  before: number,
  after: number,
]

export type OverlayKind =
  | "room"
  | "doors"
  | "loop"
  | "lake"
  | "choke"
  | "machine"
  | "bridge"

export type TraceOverlay = {
  kind: OverlayKind
  /** Original C diagnostic buffer, retained for value-specific rendering. */
  sourceKind?: string
  indices: Uint16Array
  values?: Int16Array
  witness?: number
}

export type TraceDetails = {
  roomType?: string
  hallway?: boolean
  blueprint?: number
  origin?: number | readonly [number, number]
  translation?: readonly [number, number]
  endpoints?:
    | readonly [number, number]
    | readonly [readonly [number, number], readonly [number, number]]
  pathDistance?: number
  iteration?: number
  liquid?: number
  reasonCode?: string
  witness?: number | readonly [number, number]
  recursionId?: number
  [key: string]: unknown
}

export type TraceEvent = {
  sequence: number
  generationAttempt: number
  phase: TracePhase
  sourceFunction: string
  kind:
    | "phase"
    | "candidate"
    | "result"
    | "mutation"
    | "checkpoint"
    | "choke-analysis"
    | "interior"
    | "rollback"
    | "blueprint-attempt"
    | "placement"
    | "flood-witness"
    | "wreath"
    | "environment-step"
    | "machine-before-attempt"
    | "machine-before-rollback"
  previousPhase?: TracePhase
  attemptId?: number
  parentAttemptId?: number
  outcome?: "accepted" | "rejected" | "rolled-back" | "exhausted"
  reason?: string
  details?: TraceDetails
  writes: readonly Write[]
  overlay?: TraceOverlay
  /** Overlay active immediately before this event, for reversible playback. */
  previousOverlay?: TraceOverlay
  markers?: { up: number; down: number; player: number }
  checkpointId?: number
  rngState?: readonly number[]
}

export type CheckpointState = {
  terrain: readonly [Uint16Array, Uint16Array, Uint16Array, Uint16Array]
  volume: Uint16Array
  flags: Uint32Array
  machine: Int16Array
  roomGrid?: Int16Array
  markers: { up: number; down: number; player: number }
  activeOverlay?: TraceOverlay
  phase: TracePhase
  /** Highest event sequence already applied; initial state is -1. */
  sequence: number
}

export type Checkpoint = {
  id: number
  state: CheckpointState
}

export type TileCatalogEntry = {
  id: number
  character: string
  /** RGB channels in the 0..255 display range. */
  foreground: readonly [number, number, number]
  background: readonly [number, number, number]
  priority: number
  glyphName: string
}

export type EngineResult = {
  header: TraceHeader
  events: readonly TraceEvent[]
  checkpoints: readonly Checkpoint[]
  final: Checkpoint
  tileCatalog: readonly TileCatalogEntry[]
  rngState: readonly number[]
}

export type WorkerGenerate = {
  type: "generate"
  requestId: string
  seed: string
  depth: number
  mode?: "full" | "phase"
}
export type WorkerCancel = { type: "cancel"; requestId: string }
export type WorkerRequest = WorkerGenerate | WorkerCancel | { type: "ping" }
export type WorkerResponse =
  | { type: "ready"; requestId?: string }
  | {
    type: "progress"
    requestId: string
    phase: TracePhase
    completed: number
    total?: number
  }
  | { type: "result"; requestId: string; result: EngineResult }
  | { type: "error"; requestId: string; code: string; message: string }
  | { type: "pong" }

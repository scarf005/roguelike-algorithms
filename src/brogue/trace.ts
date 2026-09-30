import type {
  Checkpoint,
  CheckpointState,
  TraceEvent,
  TraceOverlay,
  TracePhase,
  Write,
} from "./types.ts"

const cloneOverlay = (overlay?: TraceOverlay): TraceOverlay | undefined =>
  overlay && {
    ...overlay,
    indices: overlay.indices.slice(),
    values: overlay.values?.slice(),
    witness: overlay.witness,
  }

const cloneState = (state: CheckpointState): CheckpointState => ({
  terrain: [
    state.terrain[0].slice(),
    state.terrain[1].slice(),
    state.terrain[2].slice(),
    state.terrain[3].slice(),
  ],
  volume: state.volume.slice(),
  flags: state.flags.slice(),
  machine: state.machine.slice(),
  roomGrid: state.roomGrid?.slice(),
  markers: { ...state.markers },
  activeOverlay: cloneOverlay(state.activeOverlay),
  phase: state.phase,
  sequence: state.sequence,
})

const applyWrite = (
  state: CheckpointState,
  { write, reverse }: { write: Write; reverse: boolean },
) => {
  const [plane, layer, index, before, after] = write
  const expected = reverse ? after : before
  if (plane === 5) {
    if (layer !== 0 || !Number.isInteger(index) || index < 0 || index > 2) {
      throw new Error("Trace write references an invalid marker")
    }
    const key = (["up", "down", "player"] as const)[index]
    if (state.markers[key] !== expected) {
      throw new Error("Trace marker delta does not match board state")
    }
    const marker = reverse ? before : after
    if (index === 0) state.markers = { ...state.markers, up: marker }
    if (index === 1) state.markers = { ...state.markers, down: marker }
    if (index === 2) state.markers = { ...state.markers, player: marker }
    return
  }
  if (plane === 6) {
    throw new Error("Trace overlays must be carried as event overlay fields")
  }
  if (plane === 4 && !state.roomGrid) {
    state.roomGrid = new Int16Array(state.terrain[0].length)
  }
  const target = plane === 0
    ? state.terrain[layer]
    : plane === 1
    ? state.volume
    : plane === 2
    ? state.flags
    : plane === 3
    ? state.machine
    : state.roomGrid
  if (
    !target || !Number.isInteger(index) || index < 0 || index >= target.length
  ) {
    throw new Error("Trace write references an invalid board coordinate")
  }
  if (target[index] !== expected) {
    throw new Error(
      `Trace delta does not match board state: plane ${plane}, layer ${layer}, cell ${index}`,
    )
  }
  target[index] = reverse ? before : after
}

const applyEvent = (
  state: CheckpointState,
  { event, reverse }: { event: TraceEvent; reverse: boolean },
) => {
  for (const write of reverse ? [...event.writes].reverse() : event.writes) {
    applyWrite(state, { write, reverse })
  }
  if (reverse) {
    state.activeOverlay = cloneOverlay(event.previousOverlay)
    state.sequence = event.sequence - 1
  } else {
    state.activeOverlay = cloneOverlay(event.overlay)
    if (
      event.markers &&
      ["up", "down", "player"].some((key) =>
        event.markers![key as keyof typeof event.markers] !==
          state.markers[key as keyof typeof state.markers]
      )
    ) throw new Error("Trace markers do not match their deltas")
    state.sequence = event.sequence
  }
  state.phase = reverse
    ? event.previousPhase ?? (event.sequence === 0 ? "clearLevel" : state.phase)
    : event.phase
}

/** Mutates an owned working board; callers snapshot it only at phase boundaries. */
export const applyTraceEvent = (state: CheckpointState, event: TraceEvent) =>
  applyEvent(state, { event, reverse: false })

/** Apply at most `through` events. `through` is a count, not a sequence. */
export const replayTrace = (
  initial: CheckpointState,
  { events, through = events.length }: {
    events: readonly TraceEvent[]
    through?: number
  },
): CheckpointState => {
  const state = cloneState(initial)
  for (const event of events.slice(0, through)) {
    applyEvent(state, { event, reverse: false })
  }
  return state
}

/** Reverse events from a state that has all `from` events applied. */
export const reverseTrace = (
  state: CheckpointState,
  { events, from = events.length }: {
    events: readonly TraceEvent[]
    from?: number
  },
): CheckpointState => {
  const result = cloneState(state)
  for (const event of events.slice(0, from).reverse()) {
    applyEvent(result, { event, reverse: true })
  }
  return result
}

export const checkpointAtPhase = (
  checkpoints: readonly Checkpoint[],
  phase: TracePhase,
): Checkpoint | undefined =>
  checkpoints.find((checkpoint) => checkpoint.state.phase === phase)

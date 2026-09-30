import { replayTrace } from "./trace.ts"
import type { EngineResult } from "./types.ts"

/** Stores only imperative board planes; UI observes the cursor, not cells. */
export const createPlayback = (result: EngineResult) => {
  const initial = result.checkpoints.find((checkpoint) =>
    checkpoint.state.sequence === -1
  )
  if (!initial) throw new Error("Generation trace has no initial checkpoint.")
  let cursor = 0
  let state = replayTrace(initial.state, { events: [] })
  const checkpoints = result.checkpoints.map((checkpoint) => ({
    position: checkpoint.state.sequence + 1,
    state: checkpoint.state,
  })).sort((a, b) => a.position - b.position)
  return {
    cursor: () => cursor,
    state: () => state,
    seek: (position: number) => {
      if (
        !Number.isInteger(position) || position < 0 ||
        position > result.events.length
      ) {
        throw new Error(
          `Step must be an integer from 0 to ${result.events.length}.`,
        )
      }
      if (position < cursor) {
        const checkpoint = checkpoints.findLast((entry) =>
          entry.position <= position
        )!
        state = replayTrace(
          checkpoint.state,
          { events: result.events.slice(checkpoint.position, position) },
        )
      } else {
        state = replayTrace(state, {
          events: result.events.slice(cursor, position),
        })
      }
      cursor = position
      return state
    },
  }
}

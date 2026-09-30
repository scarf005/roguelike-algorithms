import { createGrid, Grid, Mark } from "./grid.ts"

export const Layer = { Cells: 0, Overlay: 1, Dist: 2 } as const
export type LayerId = typeof Layer[keyof typeof Layer]

export const DIST_UNSET = 0xffff

/** Sets `value` on `layer` for every listed cell index. */
export type Change = {
  layer: LayerId
  value: number
  indices: ArrayLike<number>
}
export type Phase = { phase: string }
/** One yield of a generator: one unit of visual progress. */
export type Step = Change | Phase | readonly (Change | Phase)[]

/** All mutable state an algorithm reads and a renderer draws. */
export type Board = {
  grid: Grid
  overlay: Uint8Array
  dist: Uint16Array
  start: number
  goal: number
  maxDist: number
  phase: string
}

export const createBoard = (width: number, height: number): Board => {
  const grid = createGrid(width, height)
  return {
    grid,
    overlay: new Uint8Array(grid.cells.length),
    dist: new Uint16Array(grid.cells.length).fill(DIST_UNSET),
    start: -1,
    goal: -1,
    maxDist: 0,
    phase: "",
  }
}

export const clearOverlay = (board: Board) => {
  board.overlay.fill(Mark.None)
  board.dist.fill(DIST_UNSET)
  board.maxDist = 0
  board.phase = ""
}

const applyChange = (board: Board, { layer, value, indices }: Change) => {
  if (layer === Layer.Cells) {
    for (let k = 0; k < indices.length; k++) {
      board.grid.cells[indices[k]] = value
    }
  } else if (layer === Layer.Overlay) {
    for (let k = 0; k < indices.length; k++) board.overlay[indices[k]] = value
  } else {
    for (let k = 0; k < indices.length; k++) board.dist[indices[k]] = value
    if (value !== DIST_UNSET && value > board.maxDist) board.maxDist = value
  }
}

/** Applies a step in place; generators read the board after each yield. */
export const applyStep = (board: Board, step: Step) => {
  if (Array.isArray(step)) {
    for (const s of step as readonly (Change | Phase)[]) applyStep(board, s)
  } else if ("phase" in step) board.phase = step.phase
  else applyChange(board, step as Change)
}

export const change = (
  layer: LayerId,
  value: number,
  indices: ArrayLike<number>,
): Change => ({ layer, value, indices })

/** Runs a generator to completion, applying every step; returns its result. */
export const drain = <R>(board: Board, gen: Generator<Step, R>) => {
  for (;;) {
    const r = gen.next()
    if (r.done) return r.value
    applyStep(board, r.value)
  }
}

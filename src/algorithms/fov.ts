import { type Change, change, Layer } from "./board.ts"
import { type Grid, inBounds, index, Mark, Tile } from "./grid.ts"

export type FovOptions = { origin: number; radius: number }

const quadrant =
  (q: number, ox: number, oy: number) => (depth: number, col: number) =>
    q === 0
      ? [ox + col, oy - depth] as const
      : q === 1
      ? [ox + col, oy + depth] as const
      : q === 2
      ? [ox + depth, oy + col] as const
      : [ox - depth, oy + col] as const

/**
 * Albert Ford's symmetric shadowcasting. Slopes are exact fractions (num/den,
 * den > 0) so the symmetry checks never suffer float error. Yields one batch
 * of newly visible cells per scanned row.
 */
export function* shadowcast(
  grid: Grid,
  { origin, radius }: FovOptions,
): Generator<Change> {
  const ox = origin % grid.width
  const oy = (origin - ox) / grid.width
  if (!inBounds(grid, ox, oy)) return
  const r2 = radius * radius
  yield change(Layer.Overlay, Mark.Visible, [origin])

  function* scan(
    transform: ReturnType<typeof quadrant>,
    depth: number,
    startNum: number,
    startDen: number,
    endNum: number,
    endDen: number,
  ): Generator<Change> {
    if (depth > radius) return
    // round ties up / round ties down of depth * slope
    const minCol = Math.floor(
      (2 * depth * startNum + startDen) / (2 * startDen),
    )
    const maxCol = Math.ceil((2 * depth * endNum - endDen) / (2 * endDen))
    const revealed: number[] = []
    const next: [number, number, number, number][] = []
    let prevWall: boolean | undefined
    for (let col = minCol; col <= maxCol; col++) {
      const [x, y] = transform(depth, col)
      const visible = inBounds(grid, x, y)
      const i = visible ? index(grid, x, y) : -1
      const wall = !visible || grid.cells[i] === Tile.Wall
      const symmetric = col * startDen >= depth * startNum &&
        col * endDen <= depth * endNum
      if (visible && (wall || symmetric) && col * col + depth * depth <= r2) {
        revealed.push(i)
      }
      if (prevWall === true && !wall) {
        startNum = 2 * col - 1
        startDen = 2 * depth
      }
      if (prevWall === false && wall) {
        next.push([startNum, startDen, 2 * col - 1, 2 * depth])
      }
      prevWall = wall
    }
    if (revealed.length) yield change(Layer.Overlay, Mark.Visible, revealed)
    for (const [sn, sd, en, ed] of next) {
      yield* scan(transform, depth + 1, sn, sd, en, ed)
    }
    if (prevWall === false) {
      yield* scan(transform, depth + 1, startNum, startDen, endNum, endDen)
    }
  }

  for (let q = 0; q < 4; q++) {
    yield* scan(quadrant(q, ox, oy), 1, -1, 1, 1, 1)
  }
}

/** Cells visible from `origin` as a 0/1 mask. */
export const visibleMask = (grid: Grid, options: FovOptions) => {
  const mask = new Uint8Array(grid.cells.length)
  for (const { indices } of shadowcast(grid, options)) {
    for (let k = 0; k < indices.length; k++) mask[indices[k]] = 1
  }
  return mask
}

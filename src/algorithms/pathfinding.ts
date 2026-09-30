import { type Change, change, DIST_UNSET, Layer, type Step } from "./board.ts"
import { type Grid, Mark, Tile } from "./grid.ts"
import { createHeap } from "./heap.ts"

export type PathOptions = {
  start: number
  /** -1 explores everything reachable and finds no path. */
  goal: number
}

/** Cell indices from start to goal inclusive, or undefined when unreachable. */
export type Path = number[] | undefined

const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

/**
 * Fills `out` with passable 8-way neighbours of `i`; diagonal moves may not
 * cut wall corners. Returns the count.
 */
export const neighbors = (grid: Grid, i: number, out: Int32Array) => {
  const { width, height, cells } = grid
  const x = i % width
  const y = (i - x) / width
  let n = 0
  for (const [dx, dy] of DIRS) {
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
    if (cells[ny * width + nx] === Tile.Wall) continue
    if (
      dx !== 0 && dy !== 0 &&
      (cells[y * width + nx] === Tile.Wall ||
        cells[ny * width + x] === Tile.Wall)
    ) continue
    out[n++] = ny * width + nx
  }
  return n
}

const walkBack = (parent: Int32Array, start: number, goal: number) => {
  const path = [goal]
  for (let i = goal; i !== start; i = parent[i]) path.push(parent[i])
  return path.reverse()
}

const valid = (grid: Grid, { start, goal }: PathOptions) =>
  start >= 0 && start < grid.cells.length && grid.cells[start] !== Tile.Wall &&
  (goal === -1 ||
    (goal < grid.cells.length && grid.cells[goal] !== Tile.Wall))

const finish = function* (
  parent: Int32Array,
  { start, goal }: PathOptions,
  reached: boolean,
): Generator<Step, Path> {
  if (!reached) {
    yield { phase: "No path" }
    return undefined
  }
  const path = walkBack(parent, start, goal)
  yield [{ phase: "Path found" }, change(Layer.Overlay, Mark.Path, path)]
  return path
}

const settle = (i: number, d: number): Change[] => [
  change(Layer.Overlay, Mark.Visited, [i]),
  change(Layer.Dist, Math.min(d, DIST_MAX), [i]),
]

const DIST_MAX = DIST_UNSET - 1

/** Breadth-first search: expands rings of equal step count from the start. */
export function* bfs(grid: Grid, options: PathOptions): Generator<Step, Path> {
  const { start, goal } = options
  if (!valid(grid, options)) return undefined
  const parent = new Int32Array(grid.cells.length).fill(-1)
  const dist = new Int32Array(grid.cells.length)
  const queue = new Int32Array(grid.cells.length)
  const out = new Int32Array(8)
  let head = 0
  let tail = 0
  queue[tail++] = start
  parent[start] = start
  yield { phase: "Search" }
  const reached = () => goal !== -1 && parent[goal] !== -1
  while (head < tail && !reached()) {
    const cur = queue[head++]
    const found: number[] = []
    const n = neighbors(grid, cur, out)
    for (let k = 0; k < n; k++) {
      const next = out[k]
      if (parent[next] !== -1) continue
      parent[next] = cur
      dist[next] = dist[cur] + 1
      queue[tail++] = next
      found.push(next)
    }
    yield [
      ...settle(cur, dist[cur]),
      change(Layer.Overlay, Mark.Frontier, found),
    ]
  }
  return yield* finish(parent, options, reached())
}

/** Cost of stepping onto a tile; must be positive. */
export type CostFn = (tile: number) => number

/**
 * Dijkstra map: settles every reachable cell in order of cost from the start
 * (the goal only selects the path afterwards), so `dist` becomes a gradient.
 */
export function* dijkstra(
  grid: Grid,
  options: PathOptions,
  cost: CostFn = () => 1,
): Generator<Step, Path> {
  const { start, goal } = options
  if (!valid(grid, options)) return undefined
  const size = grid.cells.length
  const dist = new Float64Array(size).fill(Infinity)
  const parent = new Int32Array(size).fill(-1)
  const done = new Uint8Array(size)
  const heap = createHeap()
  const out = new Int32Array(8)
  dist[start] = 0
  parent[start] = start
  heap.push(0, start)
  yield { phase: "Flood" }
  while (heap.size) {
    const cur = heap.pop()
    if (done[cur]) continue
    done[cur] = 1
    const found: number[] = []
    const n = neighbors(grid, cur, out)
    for (let k = 0; k < n; k++) {
      const next = out[k]
      const d = dist[cur] + cost(grid.cells[next])
      if (d >= dist[next]) continue
      if (dist[next] === Infinity) found.push(next)
      dist[next] = d
      parent[next] = cur
      heap.push(d, next)
    }
    yield [
      ...settle(cur, dist[cur]),
      change(Layer.Overlay, Mark.Frontier, found),
    ]
  }
  return yield* finish(parent, options, goal !== -1 && done[goal] === 1)
}

/** A*: best-first on cost so far plus Chebyshev distance to the goal. */
export function* astar(
  grid: Grid,
  options: PathOptions,
): Generator<Step, Path> {
  const { start, goal } = options
  if (!valid(grid, options) || goal === -1) return undefined
  const { width } = grid
  const gx = goal % width
  const gy = (goal - gx) / width
  const h = (i: number) => {
    const x = i % width
    return Math.max(Math.abs(x - gx), Math.abs((i - x) / width - gy))
  }
  const size = grid.cells.length
  const g = new Int32Array(size).fill(-1)
  const parent = new Int32Array(size).fill(-1)
  const closed = new Uint8Array(size)
  const heap = createHeap()
  const out = new Int32Array(8)
  g[start] = 0
  parent[start] = start
  // Ties prefer deeper nodes, which keeps the search narrow on open floors.
  const push = (i: number) => heap.push((g[i] + h(i)) * 65536 - g[i], i)
  push(start)
  yield { phase: "Search" }
  while (heap.size) {
    const cur = heap.pop()
    if (closed[cur]) continue
    closed[cur] = 1
    const found: number[] = []
    const n = neighbors(grid, cur, out)
    if (cur !== goal) {
      for (let k = 0; k < n; k++) {
        const next = out[k]
        if (g[next] !== -1 && g[next] <= g[cur] + 1) continue
        if (g[next] === -1) found.push(next)
        g[next] = g[cur] + 1
        parent[next] = cur
        push(next)
      }
    }
    yield [
      change(Layer.Overlay, Mark.Visited, [cur]),
      change(Layer.Overlay, Mark.Frontier, found),
    ]
    if (cur === goal) break
  }
  return yield* finish(parent, options, closed[goal] === 1)
}

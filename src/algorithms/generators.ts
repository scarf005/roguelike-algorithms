import { change, Layer, type Step } from "./board.ts"
import { type Grid, index, labelRegions, Mark, Tile } from "./grid.ts"
import { pick, randInt, type Rng, shuffle } from "./rng.ts"

/** Generators start from an all-wall board and only read what earlier steps wrote. */
export type MapGenerator<R = void> = (
  grid: Grid,
  rng: Rng,
) => Generator<Step, R>

export type Room = { x: number; y: number; w: number; h: number }

const center = (r: Room) => [r.x + (r.w >> 1), r.y + (r.h >> 1)] as const

const roomIndices = (grid: Grid, r: Room) => {
  const out: number[] = []
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) out.push(index(grid, x, y))
  }
  return out
}

/** Wall cells on an L-shaped path (horizontal first) between two points. */
const corridorIndices = (
  grid: Grid,
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
) => {
  const out: number[] = []
  const visit = (x: number, y: number) => {
    const i = index(grid, x, y)
    if (grid.cells[i] === Tile.Wall) out.push(i)
  }
  const sx = Math.sign(bx - ax)
  for (let x = ax; x !== bx; x += sx) visit(x, ay)
  const sy = Math.sign(by - ay)
  for (let y = ay; y !== by; y += sy) visit(bx, y)
  visit(bx, by)
  return out
}

const MIN_ROOM = 4

type Leaf = { x: number; y: number; w: number; h: number }
type Node = { leaf: Leaf; children?: [Node, Node]; room?: Room }

const split = (node: Node, rng: Rng, minLeaf: number): Node[] => {
  const { x, y, w, h } = node.leaf
  const canW = w >= 2 * minLeaf
  const canH = h >= 2 * minLeaf
  if (!canW && !canH) return []
  const vertical = canW && canH ? (w === h ? rng() < 0.5 : w > h) : canW
  const cut = randInt(rng, minLeaf, (vertical ? w : h) - minLeaf)
  const a = vertical ? { x, y, w: cut, h } : { x, y, w, h: cut }
  const b = vertical
    ? { x: x + cut, y, w: w - cut, h }
    : { x, y: y + cut, w, h: h - cut }
  node.children = [{ leaf: a }, { leaf: b }]
  return node.children
}

/** Binary space partitioning: split, place a room per leaf, join siblings. */
export function* bspDungeon(grid: Grid, rng: Rng): Generator<Step, Room[]> {
  const root: Node = {
    leaf: { x: 1, y: 1, w: grid.width - 2, h: grid.height - 2 },
  }
  yield { phase: "Split space" }
  const leaves: Node[] = []
  const queue = [root]
  while (queue.length) {
    const node = queue.shift()!
    const kids = split(node, rng, MIN_ROOM + 2)
    if (kids.length) queue.push(...kids)
    else leaves.push(node)
  }
  yield { phase: "Place rooms" }
  const rooms: Room[] = []
  for (const node of leaves) {
    const { x, y, w, h } = node.leaf
    const rw = randInt(rng, MIN_ROOM, w - 2)
    const rh = randInt(rng, MIN_ROOM, h - 2)
    const room = {
      x: x + randInt(rng, 1, w - 1 - rw),
      y: y + randInt(rng, 1, h - 1 - rh),
      w: rw,
      h: rh,
    }
    node.room = room
    rooms.push(room)
    yield change(Layer.Cells, Tile.Floor, roomIndices(grid, room))
  }
  yield { phase: "Connect siblings" }
  // Post-order: each subtree is connected, so joining one room of each child suffices.
  const connect = function* (node: Node): Generator<Step, Room> {
    if (!node.children) return node.room!
    const [a, b] = node.children
    const ra = yield* connect(a)
    const rb = yield* connect(b)
    yield change(
      Layer.Cells,
      Tile.Corridor,
      corridorIndices(grid, center(ra), center(rb)),
    )
    return pick(rng, [ra, rb])
  }
  yield* connect(root)
  return rooms
}

const overlaps = (a: Room, b: Room, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap &&
  a.y < b.y + b.h + gap && b.y < a.y + a.h + gap

/** Random non-overlapping rooms, chained together in placement order. */
export function* randomRooms(grid: Grid, rng: Rng): Generator<Step, Room[]> {
  const rooms: Room[] = []
  const target = Math.max(2, Math.floor(grid.width * grid.height / 120))
  yield { phase: "Place rooms" }
  for (
    let attempt = 0;
    attempt < target * 12 && rooms.length < target;
    attempt++
  ) {
    const w = randInt(rng, MIN_ROOM, 12)
    const h = randInt(rng, MIN_ROOM, 8)
    if (w > grid.width - 2 || h > grid.height - 2) continue
    const room = {
      x: randInt(rng, 1, grid.width - 1 - w),
      y: randInt(rng, 1, grid.height - 1 - h),
      w,
      h,
    }
    if (rooms.some((r) => overlaps(r, room, 2))) continue
    rooms.push(room)
    yield change(Layer.Cells, Tile.Floor, roomIndices(grid, room))
  }
  yield { phase: "Dig corridors" }
  for (let i = 1; i < rooms.length; i++) {
    yield change(
      Layer.Cells,
      Tile.Corridor,
      corridorIndices(grid, center(rooms[i - 1]), center(rooms[i])),
    )
  }
  return rooms
}

const STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/** A single random walker carving floor until a target coverage is reached. */
export function* drunkardsWalk(grid: Grid, rng: Rng): Generator<Step> {
  const interior = (grid.width - 2) * (grid.height - 2)
  const target = Math.floor(interior * 0.4)
  let x = grid.width >> 1
  let y = grid.height >> 1
  let carved = 0
  yield { phase: "Walk" }
  for (let n = 0; carved < target && n < interior * 200; n++) {
    const i = index(grid, x, y)
    if (grid.cells[i] === Tile.Wall) {
      carved++
      yield change(Layer.Cells, Tile.Floor, [i])
    }
    const [dx, dy] = pick(rng, STEPS)
    x = Math.min(grid.width - 2, Math.max(1, x + dx))
    y = Math.min(grid.height - 2, Math.max(1, y + dy))
  }
}

/** Walls in the 3x3 block around a cell, itself included; outside counts as wall. */
const wallsAround = (grid: Grid, x: number, y: number) => {
  let n = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx
      const ny = y + dy
      const out = nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height
      if (out || grid.cells[ny * grid.width + nx] === Tile.Wall) n++
    }
  }
  return n
}

/** Noise, smoothing generations, then discard every region but the largest. */
export function* cellularCaves(grid: Grid, rng: Rng): Generator<Step> {
  const { width, height, cells } = grid
  yield { phase: "Random noise" }
  const noise: number[] = []
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (rng() >= 0.5) noise.push(index(grid, x, y))
    }
  }
  yield change(Layer.Cells, Tile.Floor, noise)
  for (let gen = 1; gen <= 5; gen++) {
    yield { phase: `Smooth ${gen}/5` }
    const toFloor: number[] = []
    const toWall: number[] = []
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = index(grid, x, y)
        const wall = wallsAround(grid, x, y) >= 5
        if (wall && cells[i] !== Tile.Wall) toWall.push(i)
        else if (!wall && cells[i] === Tile.Wall) toFloor.push(i)
      }
    }
    yield [
      change(Layer.Cells, Tile.Wall, toWall),
      change(Layer.Cells, Tile.Floor, toFloor),
    ]
  }
  yield { phase: "Keep largest region" }
  const { labels, sizes } = labelRegions(grid)
  const largest = sizes.indexOf(Math.max(0, ...sizes))
  const others: number[] = []
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== -1 && labels[i] !== largest) others.push(i)
  }
  yield change(Layer.Cells, Tile.Wall, others)
}

/** Depth-first carving with an explicit stack; stack cells glow as frontier. */
export function* recursiveBacktracker(grid: Grid, rng: Rng): Generator<Step> {
  const cw = (grid.width - 1) >> 1
  const ch = (grid.height - 1) >> 1
  if (cw === 0 || ch === 0) return
  const cell = (cx: number, cy: number) => index(grid, 2 * cx + 1, 2 * cy + 1)
  const seen = new Uint8Array(cw * ch)
  const stack = [[randInt(rng, 0, cw - 1), randInt(rng, 0, ch - 1)]]
  seen[stack[0][1] * cw + stack[0][0]] = 1
  yield [
    { phase: "Carve" },
    change(Layer.Cells, Tile.Floor, [cell(stack[0][0], stack[0][1])]),
    change(Layer.Overlay, Mark.Frontier, [cell(stack[0][0], stack[0][1])]),
  ]
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1]
    const options = shuffle(rng, STEPS).filter(([dx, dy]) => {
      const nx = cx + dx
      const ny = cy + dy
      return nx >= 0 && ny >= 0 && nx < cw && ny < ch && !seen[ny * cw + nx]
    })
    if (!options.length) {
      stack.pop()
      yield change(Layer.Overlay, Mark.None, [cell(cx, cy)])
      continue
    }
    const [dx, dy] = options[0]
    const nx = cx + dx
    const ny = cy + dy
    seen[ny * cw + nx] = 1
    stack.push([nx, ny])
    const next = cell(nx, ny)
    yield [
      change(Layer.Cells, Tile.Floor, [
        next,
        cell(cx, cy) + dx + dy * grid.width,
      ]),
      change(Layer.Overlay, Mark.Frontier, [next]),
    ]
  }
}

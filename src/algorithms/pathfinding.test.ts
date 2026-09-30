import { assert, assertEquals } from "@std/assert"
import { DIST_UNSET, drain } from "./board.ts"
import { cellularCaves, randomRooms } from "./generators.ts"
import { Tile } from "./grid.ts"
import { astar, bfs, dijkstra, neighbors, type Path } from "./pathfinding.ts"
import { createRng } from "./rng.ts"
import { freeCells, fromAscii, generate } from "./test-util.ts"

const validPath = (grid: ReturnType<typeof fromAscii>["grid"], p: number[]) => {
  const out = new Int32Array(8)
  return p.every((c, k) => {
    if (grid.cells[c] === Tile.Wall) return false
    if (k === 0) return true
    return Array.from(out.subarray(0, neighbors(grid, p[k - 1], out))).includes(
      c,
    )
  })
}

const run = (
  algo: typeof bfs,
  rows: string[],
  start: [number, number],
  goal: [number, number],
) => {
  const board = fromAscii(rows)
  const w = board.grid.width
  const path = drain(
    board,
    algo(board.grid, {
      start: start[1] * w + start[0],
      goal: goal[1] * w + goal[0],
    }),
  )
  return { board, path }
}

const algos = { bfs, dijkstra, astar }

for (const [name, algo] of Object.entries(algos)) {
  Deno.test(`${name}: start == goal is a zero-length path`, () => {
    const { path } = run(algo, ["...", "..."], [1, 1], [1, 1])
    assertEquals(path, [4])
  })

  Deno.test(`${name}: no path when the goal is walled off`, () => {
    const { path, board } = run(algo, [".#.", ".#.", ".#."], [0, 1], [2, 1])
    assertEquals(path, undefined)
    assertEquals(board.phase, "No path")
    assert(!board.overlay.includes(3)) // Mark.Path never drawn
  })

  Deno.test(`${name}: start or goal inside a wall yields nothing`, () => {
    assertEquals(run(algo, ["#..", "..."], [0, 0], [2, 1]).path, undefined)
    assertEquals(run(algo, ["...", "..#"], [0, 0], [2, 1]).path, undefined)
  })

  Deno.test(`${name}: routes around walls and never cuts corners`, () => {
    // the diagonal gap between the two walls is not passable
    const { path } = run(
      algo,
      [
        ".#..",
        "#...",
        "....",
      ],
      [0, 0],
      [3, 0],
    )
    assertEquals(path, undefined)
    const open = run(algo, ["....", ".#..", "...."], [0, 1], [3, 1])
    assertEquals(open.path!.length - 1, 4) // the wall forces a detour over the top
    assert(validPath(open.board.grid, open.path!))
  })
}

Deno.test("astar length equals bfs length on random unweighted maps", () => {
  let compared = 0
  for (
    const [gen, seed] of [[cellularCaves, "p1"], [randomRooms, "p2"], [
      cellularCaves,
      "p3",
    ]] as const
  ) {
    const { board } = generate(gen, 60, 40, seed)
    const floors = freeCells(board.grid)
    const rng = createRng(seed)
    for (let n = 0; n < 25; n++) {
      const start = floors[Math.floor(rng() * floors.length)]
      const goal = floors[Math.floor(rng() * floors.length)]
      const a = drain(board, astar(board.grid, { start, goal })) as Path
      const b = drain(board, bfs(board.grid, { start, goal })) as Path
      assertEquals(a?.length, b?.length)
      assert(a && validPath(board.grid, a) && a[0] === start)
      assertEquals(a.at(-1), goal)
      compared++
    }
  }
  assertEquals(compared, 75)
})

Deno.test("dijkstra distances match bfs distances on the whole map", () => {
  const { board } = generate(cellularCaves, 60, 40, "dist")
  const start = freeCells(board.grid)[0]
  const b1 = structuredClone(board)
  const b2 = structuredClone(board)
  drain(b1, bfs(b1.grid, { start, goal: -1 }))
  drain(b2, dijkstra(b2.grid, { start, goal: -1 }))
  assertEquals(b1.dist, b2.dist)
  assertEquals(b2.dist[start], 0)
  // walls are never reached, every floor cell of the region is
  b2.dist.forEach((v, i) => {
    if (b2.grid.cells[i] === Tile.Wall) assertEquals(v, DIST_UNSET)
  })
  assert(b2.maxDist > 10)
})

Deno.test("dijkstra: costly tiles are avoided when a cheaper detour exists", () => {
  const board = fromAscii(["....", "....", "...."])
  board.grid.cells[5] = Tile.Door // (1,1) costs 10
  board.grid.cells[6] = Tile.Door
  const cost = (t: number) => t === Tile.Door ? 10 : 1
  const path = drain(
    board,
    dijkstra(board.grid, { start: 4, goal: 7 }, cost),
  ) as Path
  assert(path && !path.includes(5) && !path.includes(6))
  assertEquals(path.length - 1, 3)
})

Deno.test("astar explores fewer cells than bfs on an open field", () => {
  const rows = Array.from({ length: 40 }, () => ".".repeat(60))
  const visited = (algo: typeof bfs) => {
    const b = fromAscii(rows)
    drain(b, algo(b.grid, { start: 20 * 60 + 5, goal: 20 * 60 + 50 }))
    return b.overlay.filter((v) => v === 1).length
  }
  const [a, b] = [visited(astar), visited(bfs)]
  assert(a < b / 4, `astar ${a} vs bfs ${b}`)
})

Deno.test("astar: start == goal works and a missing goal finds nothing", () => {
  const { path } = run(astar, ["..."], [0, 0], [0, 0])
  assertEquals(path, [0])
  const b = fromAscii(["..."])
  assertEquals(drain(b, astar(b.grid, { start: 0, goal: -1 })), undefined)
})

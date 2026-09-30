import { assert, assertEquals, assertNotEquals } from "@std/assert"
import { applyStep, createBoard } from "./board.ts"
import {
  bspDungeon,
  cellularCaves,
  drunkardsWalk,
  type MapGenerator,
  randomRooms,
  recursiveBacktracker,
  type Room,
} from "./generators.ts"
import { countTiles, regionCount, Tile } from "./grid.ts"
import { createRng } from "./rng.ts"
import { borderIsWall, equalCells, generate } from "./test-util.ts"

const generators: Record<string, MapGenerator<unknown>> = {
  bsp: bspDungeon,
  caves: cellularCaves,
  drunkard: drunkardsWalk,
  rooms: randomRooms,
  maze: recursiveBacktracker,
}

const sizes = [[80, 50], [160, 100], [41, 25], [40, 24]] as const

for (const [name, gen] of Object.entries(generators)) {
  Deno.test(`${name}: same seed reproduces, different seed differs`, () => {
    const a = generate(gen, 80, 50, "seed-a").grid
    assert(equalCells(a, generate(gen, 80, 50, "seed-a").grid))
    assert(!equalCells(a, generate(gen, 80, 50, "seed-b").grid))
  })

  Deno.test(`${name}: border stays wall and map is not empty`, () => {
    for (const [w, h] of sizes) {
      for (const seed of ["1", "2", "3"]) {
        const { grid } = generate(gen, w, h, seed)
        assert(borderIsWall(grid), `${name} ${w}x${h} seed ${seed}`)
        assert(countTiles(grid, Tile.Wall) < w * h)
      }
    }
  })

  Deno.test(`${name}: steps describe the result without full grid copies`, () => {
    const board = createBoard(80, 50)
    const gen2 = gen(board.grid, createRng("steps"))
    let steps = 0
    for (let r = gen2.next(); !r.done; r = gen2.next()) {
      applyStep(board, r.value)
      steps++
    }
    assert(steps > 1)
    assertEquals(
      board.grid.cells,
      generate(gen, 80, 50, "steps").grid.cells,
    )
  })
}

Deno.test("caves: keep-largest leaves exactly one connected region", () => {
  for (let s = 0; s < 20; s++) {
    const { grid } = generate(cellularCaves, 120, 75, `cave-${s}`)
    assertEquals(regionCount(grid), 1, `seed cave-${s}`)
    assert(countTiles(grid, Tile.Floor) > 100)
  }
})

Deno.test("drunkard: one region covering about 40% of the interior", () => {
  const { grid } = generate(drunkardsWalk, 80, 50, "walk")
  assertEquals(regionCount(grid), 1)
  assertEquals(countTiles(grid, Tile.Floor), Math.floor(78 * 48 * 0.4))
})

Deno.test("maze: perfect maze, connected with 2N-1 floor cells", () => {
  for (const [w, h] of sizes) {
    const { grid } = generate(recursiveBacktracker, w, h, "maze")
    const n = ((w - 1) >> 1) * ((h - 1) >> 1)
    assertEquals(regionCount(grid), 1)
    assertEquals(countTiles(grid, Tile.Floor), 2 * n - 1)
    // every maze cell (odd, odd) is open; every (even, even) pillar is wall
    for (let cy = 0; cy < (h - 1) >> 1; cy++) {
      for (let cx = 0; cx < (w - 1) >> 1; cx++) {
        assertEquals(grid.cells[(2 * cy + 1) * w + 2 * cx + 1], Tile.Floor)
        assertEquals(grid.cells[(2 * cy + 2) * w + 2 * cx + 2], Tile.Wall)
      }
    }
  }
})

Deno.test("maze: grid too small for a cell stays solid", () => {
  const { grid } = generate(recursiveBacktracker, 2, 2, "tiny")
  assertEquals(countTiles(grid, Tile.Wall), 4)
})

const separate = (a: Room, b: Room) =>
  a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y

for (
  const [name, gen] of [["bsp", bspDungeon], ["rooms", randomRooms]] as const
) {
  Deno.test(`${name}: rooms are disjoint, inside the border and floored`, () => {
    for (let s = 0; s < 10; s++) {
      const { grid, result: rooms } = generate(gen, 100, 60, `r-${s}`)
      assert(rooms.length >= 2)
      rooms.forEach((a, i) => {
        assert(a.x >= 1 && a.y >= 1)
        assert(a.x + a.w <= grid.width - 1 && a.y + a.h <= grid.height - 1)
        for (let y = a.y; y < a.y + a.h; y++) {
          for (let x = a.x; x < a.x + a.w; x++) {
            assertEquals(grid.cells[y * grid.width + x], Tile.Floor)
          }
        }
        for (const b of rooms.slice(i + 1)) assert(separate(a, b))
      })
    }
  })

  Deno.test(`${name}: all rooms are connected`, () => {
    for (let s = 0; s < 10; s++) {
      const { grid } = generate(gen, 100, 60, `c-${s}`)
      assertEquals(regionCount(grid), 1, `seed c-${s}`)
    }
  })
}

Deno.test("bsp: a grid too small to split yields a single room", () => {
  const { result: rooms } = generate(bspDungeon, 12, 12, "small")
  assertEquals(rooms.length, 1)
  assertNotEquals(rooms[0].w, 0)
})

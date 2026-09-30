import { assert, assertEquals } from "@std/assert"
import { visibleMask } from "./fov.ts"
import { cellularCaves, randomRooms } from "./generators.ts"
import { Tile } from "./grid.ts"
import { createRng } from "./rng.ts"
import { freeCells, fromAscii, generate } from "./test-util.ts"

const see = (rows: string[], at: [number, number], radius: number) => {
  const { grid } = fromAscii(rows)
  const mask = visibleMask(grid, { origin: at[1] * grid.width + at[0], radius })
  return rows.map((row, y) =>
    [...row].map((_, x) => mask[y * grid.width + x] ? "x" : ".").join("")
  )
}

Deno.test("fov: origin is always visible, even boxed in", () => {
  // the enclosing walls are seen too
  assertEquals(see(["###", "#.#", "###"], [1, 1], 5), ["xxx", "xxx", "xxx"])
  assertEquals(see(["..."], [1, 0], 0), [".x."])
})

Deno.test("fov: open room is fully visible, walls block what lies behind", () => {
  assertEquals(see([".....", ".....", "....."], [2, 1], 9), [
    "xxxxx",
    "xxxxx",
    "xxxxx",
  ])
  // the wall is seen, the cell behind it is not
  assertEquals(see([".#."], [0, 0], 9), ["xx."])
  assertEquals(see(["..#..", "..#..", "..#.."], [0, 1], 9), [
    "xxx..",
    "xxx..",
    "xxx..",
  ])
})

Deno.test("fov: radius is respected (Euclidean)", () => {
  const rows = Array.from({ length: 11 }, () => ".".repeat(11))
  const { grid } = fromAscii(rows)
  const mask = visibleMask(grid, { origin: 5 * 11 + 5, radius: 3 })
  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < 11; x++) {
      const inside = (x - 5) ** 2 + (y - 5) ** 2 <= 9
      assertEquals(mask[y * 11 + x] === 1, inside, `${x},${y}`)
    }
  }
})

Deno.test("fov: viewer on every edge and corner does not throw", () => {
  const { grid } = fromAscii(Array.from({ length: 6 }, () => ".".repeat(8)))
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 8; x++) {
      if (x % 7 && y % 5) continue
      const mask = visibleMask(grid, { origin: y * 8 + x, radius: 20 })
      assertEquals(mask.reduce((a, b) => a + b, 0), 48)
    }
  }
})

Deno.test("fov: out-of-range origin sees nothing", () => {
  const { grid } = fromAscii(["...", "..."])
  for (const origin of [-1, 6, 100]) {
    assertEquals(visibleMask(grid, { origin, radius: 5 }).some(Boolean), false)
  }
})

Deno.test("fov: symmetric on random caves and room maps", () => {
  for (
    const [gen, seed] of [[cellularCaves, "a"], [randomRooms, "b"], [
      cellularCaves,
      "c",
    ]] as const
  ) {
    const { grid } = generate(gen, 48, 32, `fov-${seed}`)
    const rng = createRng(seed)
    const floors = freeCells(grid)
    for (let n = 0; n < 12; n++) {
      const a = floors[Math.floor(rng() * floors.length)]
      const radius = 4 + Math.floor(rng() * 20)
      const fromA = visibleMask(grid, { origin: a, radius })
      for (const b of floors) {
        if (!fromA[b] || grid.cells[b] === Tile.Wall) continue
        const fromB = visibleMask(grid, { origin: b, radius })
        assert(fromB[a], `${a} sees ${b} but not the reverse (r=${radius})`)
      }
    }
  }
})

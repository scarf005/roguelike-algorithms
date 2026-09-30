import { type Board, createBoard, drain } from "./board.ts"
import type { MapGenerator } from "./generators.ts"
import { type Grid, Tile } from "./grid.ts"
import { createRng } from "./rng.ts"

export const generate = <R>(
  gen: MapGenerator<R>,
  width: number,
  height: number,
  seed: string,
) => {
  const board = createBoard(width, height)
  const result = drain(board, gen(board.grid, createRng(seed)))
  return { board, grid: board.grid, result }
}

/** `#` wall, anything else floor. */
export const fromAscii = (rows: readonly string[]): Board => {
  const board = createBoard(rows[0].length, rows.length)
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      board.grid.cells[y * row.length + x] = c === "#" ? Tile.Wall : Tile.Floor
    })
  )
  return board
}

export const borderIsWall = ({ width, height, cells }: Grid) =>
  Array.from({ length: width }, (_, x) => [x, 0, x, height - 1]).every(
    ([x, y0, , y1]) =>
      cells[y0 * width + x] === Tile.Wall &&
      cells[y1 * width + x] === Tile.Wall,
  ) &&
  Array.from({ length: height }, (_, y) => y).every((y) =>
    cells[y * width] === Tile.Wall && cells[y * width + width - 1] === Tile.Wall
  )

export const equalCells = (a: Grid, b: Grid) =>
  a.cells.length === b.cells.length && a.cells.every((v, i) => v === b.cells[i])

export const freeCells = ({ cells }: Grid) => {
  const out: number[] = []
  cells.forEach((c, i) => c !== Tile.Wall && out.push(i))
  return out
}

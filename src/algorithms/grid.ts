export const Tile = { Wall: 0, Floor: 1, Corridor: 2, Door: 3 } as const

/** Visualization state drawn on top of tiles. */
export const Mark = {
  None: 0,
  Visited: 1,
  Frontier: 2,
  Path: 3,
  Visible: 4,
  Seen: 5,
} as const

export type Grid = { width: number; height: number; cells: Uint8Array }

export const createGrid = (width: number, height: number): Grid => ({
  width,
  height,
  cells: new Uint8Array(width * height),
})

export const index = (grid: Grid, x: number, y: number) => y * grid.width + x

export const inBounds = (grid: Grid, x: number, y: number) =>
  x >= 0 && y >= 0 && x < grid.width && y < grid.height

export const isPassable = (grid: Grid, i: number) => grid.cells[i] !== Tile.Wall

export const countTiles = (grid: Grid, tile: number) => {
  let n = 0
  for (const c of grid.cells) if (c === tile) n++
  return n
}

/** Cells belonging to any non-wall tile. */
export const passableIndices = (grid: Grid) => {
  const out: number[] = []
  for (let i = 0; i < grid.cells.length; i++) {
    if (grid.cells[i] !== Tile.Wall) out.push(i)
  }
  return out
}

/** 4-connected regions of passable cells: labels (-1 for walls) and sizes. */
export const labelRegions = (grid: Grid) => {
  const { width, height, cells } = grid
  const labels = new Int32Array(cells.length).fill(-1)
  const sizes: number[] = []
  const stack = new Int32Array(cells.length)
  for (let s = 0; s < cells.length; s++) {
    if (cells[s] === Tile.Wall || labels[s] !== -1) continue
    const label = sizes.length
    let size = 0
    let top = 0
    stack[top++] = s
    labels[s] = label
    while (top > 0) {
      const i = stack[--top]
      size++
      const x = i % width
      const y = (i - x) / width
      const push = (j: number) => {
        if (cells[j] === Tile.Wall || labels[j] !== -1) return
        labels[j] = label
        stack[top++] = j
      }
      if (x > 0) push(i - 1)
      if (x < width - 1) push(i + 1)
      if (y > 0) push(i - width)
      if (y < height - 1) push(i + width)
    }
    sizes.push(size)
  }
  return { labels, sizes }
}

export const regionCount = (grid: Grid) => labelRegions(grid).sizes.length

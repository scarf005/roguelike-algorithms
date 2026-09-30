import { type Board, DIST_UNSET } from "./algorithms/board.ts"
import { Mark, Tile } from "./algorithms/grid.ts"

/** How the board is drawn: plain tiles, fogged field of view, or distance gradient. */
export type RenderMode = "tiles" | "fov" | "gradient"

/** Packs 0xRRGGBB into the little-endian RGBA layout of ImageData. */
const px = (rgb: number) =>
  (0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | (rgb >> 16)) >>> 0

const mix = (a: number, b: number, t: number) => {
  const ch = (s: number) =>
    Math.round(((a >> s) & 0xff) * (1 - t) + ((b >> s) & 0xff) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

const GRADIENT_STOPS = [0xfcd34d, 0x34d399, 0x3b82f6, 0x6d28d9]

const gradient = (): Uint32Array => {
  const segments = GRADIENT_STOPS.length - 1
  return Uint32Array.from({ length: 256 }, (_, i) => {
    const t = (i / 255) * segments
    const s = Math.min(segments - 1, Math.floor(t))
    return px(mix(GRADIENT_STOPS[s], GRADIENT_STOPS[s + 1], t - s))
  })
}

const makePalette = (dark: boolean) => {
  // indexed by Tile
  const tiles = dark
    ? [0x1f232b, 0x8a93a3, 0x737c8c, 0xc99a4b]
    : [0xc4c9d3, 0xfbfbf8, 0xe6e5da, 0xc48a2a]
  const unknown = dark ? 0x0f1114 : 0x8f939d
  const lit = dark
    ? [0x7a6a3c, 0xf1dc95, 0xe0c878, 0xf0b458]
    : [0x9d8e5e, 0xffeaa6, 0xffdf85, 0xe6a23c]
  return {
    tiles: tiles.map(px),
    unknown: px(unknown),
    dim: tiles.map((t) => px(mix(t, unknown, 0.65))),
    lit: lit.map(px),
    visited: px(dark ? 0x2f6f8f : 0x9fc9e6),
    frontier: px(dark ? 0xd9a441 : 0xf2b84b),
    path: px(dark ? 0x4fd18b : 0x1fa463),
    start: px(0xff5c7a),
    goal: px(0x4fa3ff),
    gradient: gradient(),
  }
}

const PALETTES = { dark: makePalette(true), light: makePalette(false) }

export const paletteFor = (dark: boolean) =>
  dark ? PALETTES.dark : PALETTES.light

export type Palette = ReturnType<typeof paletteFor>

/** Fills `buf` (one pixel per cell) from the board; no allocation per call. */
export const renderBoard = (
  board: Board,
  buf: Uint32Array,
  mode: RenderMode,
  p: Palette,
) => {
  const { cells, width, height } = board.grid
  const { overlay, dist, maxDist } = board
  const scale = maxDist > 0 ? 255 / maxDist : 0
  for (let i = 0; i < cells.length; i++) {
    const tile = cells[i]
    const mark = overlay[i]
    if (mode === "fov") {
      buf[i] = mark === Mark.Visible
        ? p.lit[tile]
        : mark === Mark.Seen
        ? p.dim[tile]
        : p.unknown
      continue
    }
    let c = p.tiles[tile]
    if (mode === "gradient" && dist[i] !== DIST_UNSET && tile !== Tile.Wall) {
      c = p.gradient[Math.min(255, Math.round(dist[i] * scale))]
    } else if (mark === Mark.Visited && mode !== "gradient") c = p.visited
    if (mark === Mark.Frontier) c = p.frontier
    else if (mark === Mark.Path) c = p.path
    buf[i] = c
  }
  const dot = (i: number, color: number) => {
    if (i < 0) return
    const x = i % width
    const y = (i - x) / width
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (x + dx >= 0 && y + dy >= 0 && x + dx < width && y + dy < height) {
          buf[(y + dy) * width + x + dx] = color
        }
      }
    }
  }
  if (mode !== "fov") dot(board.goal, p.goal)
  dot(board.start, p.start)
}

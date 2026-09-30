import type { CheckpointState, TileCatalogEntry, TraceEvent } from "./types.ts"

export const OVERLAY_COLORS = {
  room: "#68afc9",
  doors: "#d9b85c",
  loop: "#b39ddb",
  lake: "#5d91db",
  choke: "#da9b54",
  machine: "#cd8fbc",
  bridge: "#80b58d",
} as const
export const REJECTION_COLOR = "#cf7770"
export const WITNESS_COLOR = "#ffffff"
const CELL_WIDTH = 10
const CELL_HEIGHT = 16
const WIDTH = 79
const HEIGHT = 29
const rgb = (channels: readonly number[]) => `rgb(${channels.join(",")})`

/** The renderer reads imperative board arrays; no per-cell reactive state. */
export const createBrogueRenderer = (canvas: HTMLCanvasElement) => {
  canvas.width = WIDTH * CELL_WIDTH
  canvas.height = HEIGHT * CELL_HEIGHT
  const ctx = canvas.getContext("2d", { alpha: false })!
  const atlas = new Map<number, HTMLCanvasElement>()
  let catalog: readonly TileCatalogEntry[] = []
  let tiles = new Map<number, TileCatalogEntry>()
  let roomFloor: TileCatalogEntry | undefined
  let roomDoor: TileCatalogEntry | undefined
  const glyph = (tile: TileCatalogEntry) => {
    let cached = atlas.get(tile.id)
    if (!cached) {
      cached = document.createElement("canvas")
      cached.width = CELL_WIDTH
      cached.height = CELL_HEIGHT
      const cell = cached.getContext("2d")!
      cell.fillStyle = rgb(tile.foreground)
      cell.font = "14px monospace"
      cell.textAlign = "center"
      cell.textBaseline = "middle"
      // Request text presentation; color-emoji fonts must not override the C palette.
      cell.fillText(
        tile.character + "\uFE0E",
        CELL_WIDTH / 2,
        CELL_HEIGHT / 2,
        CELL_WIDTH,
      )
      cell.globalCompositeOperation = "source-in"
      cell.fillRect(0, 0, CELL_WIDTH, CELL_HEIGHT)
      cell.globalCompositeOperation = "destination-over"
      cell.fillStyle = rgb(tile.background)
      cell.fillRect(0, 0, CELL_WIDTH, CELL_HEIGHT)
      atlas.set(tile.id, cached)
    }
    return cached
  }
  const at = (state: CheckpointState, index: number) => {
    if (
      (state.phase === "rooms" || state.phase === "loops") && state.roomGrid
    ) {
      const value = state.roomGrid[index]
      if (value > 0) {
        return value === 2 ? roomDoor : roomFloor
      }
    }
    let best: TileCatalogEntry | undefined
    for (const plane of state.terrain) {
      const tile = tiles.get(plane[index])
      if (tile && tile.id !== 0 && (!best || tile.priority < best.priority)) {
        best = tile
      }
    }
    return best
  }
  const position = (index: number) =>
    [
      (index % WIDTH) * CELL_WIDTH,
      Math.floor(index / WIDTH) * CELL_HEIGHT,
    ] as const
  const drawCell = (state: CheckpointState, index: number) => {
    const tile = at(state, index)
    const [x, y] = position(index)
    if (tile) ctx.drawImage(glyph(tile), x, y)
    else {
      ctx.fillStyle = "#080808"
      ctx.fillRect(x, y, CELL_WIDTH, CELL_HEIGHT)
    }
  }
  const marker = (
    state: CheckpointState,
    { index, character }: { index: number; character?: string },
  ) => {
    if (index < 0 || index >= WIDTH * HEIGHT) return
    drawCell(state, index)
    const [x, y] = position(index)
    if (!character) {
      const tile = tiles.get(state.terrain[0][index])
      if (tile) ctx.drawImage(glyph(tile), x, y)
      return
    }
    ctx.fillStyle = "#ffffff"
    ctx.font = "bold 14px monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(character, x + CELL_WIDTH / 2, y + CELL_HEIGHT / 2, CELL_WIDTH)
  }
  return {
    setCatalog: (next: readonly TileCatalogEntry[]) => {
      catalog = next
      tiles = new Map(next.map((tile) => [tile.id, tile]))
      roomFloor = catalog.find((tile) => tile.character === "·")
      roomDoor = catalog.find((tile) => tile.character === "+")
      atlas.clear()
    },
    draw: (
      state: CheckpointState,
      { event, overlays = true }: { event?: TraceEvent; overlays?: boolean } =
        {},
    ) => {
      for (let i = 0; i < WIDTH * HEIGHT; i++) drawCell(state, i)
      const overlay = state.activeOverlay ?? event?.overlay
      if (overlays && overlay) {
        const color =
          event?.outcome === "rejected" || event?.outcome === "rolled-back"
            ? REJECTION_COLOR
            : OVERLAY_COLORS[overlay.kind]
        const chokeMaximum = overlay.kind === "choke" && overlay.values
          ? Math.max(
            1,
            ...Array.from(overlay.values).filter((value) => value < 30000),
          )
          : 1
        for (let i = 0; i < overlay.indices.length; i++) {
          const index = overlay.indices[i]
          const value = overlay.values?.[i]
          if (
            index >= WIDTH * HEIGHT ||
            (overlay.kind === "choke" && value === 30000)
          ) continue
          const [x, y] = position(index)
          if (
            overlay.sourceKind === "roomCandidate" && value !== undefined &&
            value > 0
          ) {
            const tile = value === 2 ? roomDoor : roomFloor
            if (tile) {
              ctx.globalAlpha = 1
              ctx.drawImage(glyph(tile), x, y)
            }
          }
          ctx.fillStyle = overlay.kind === "room" && value === 2
            ? OVERLAY_COLORS.doors
            : overlay.sourceKind === "lakeFloodMap"
            ? value === 0 ? REJECTION_COLOR : OVERLAY_COLORS.lake
            : color
          ctx.globalAlpha = overlay.kind === "choke" && value !== undefined
            ? 0.2 + 0.55 * Math.max(0, value) / chokeMaximum
            : 0.45
          ctx.fillRect(x, y, CELL_WIDTH, CELL_HEIGHT)
        }
        ctx.globalAlpha = 1
        const witness = overlay.witness
        if (witness !== undefined && witness >= 0 && witness < WIDTH * HEIGHT) {
          const [x, y] = position(witness)
          ctx.strokeStyle = WITNESS_COLOR
          ctx.strokeRect(x + 0.5, y + 0.5, CELL_WIDTH - 1, CELL_HEIGHT - 1)
        }
      }
      marker(state, { index: state.markers.up })
      marker(state, { index: state.markers.down })
      marker(state, { index: state.markers.player, character: "@" })
    },
  }
}

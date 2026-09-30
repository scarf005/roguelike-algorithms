import {
  applyStep,
  type Board,
  clearOverlay,
  createBoard,
  drain,
  type Step,
} from "./algorithms/board.ts"
import { Mark, passableIndices, Tile } from "./algorithms/grid.ts"
import { type Algo, findAlgo } from "./algorithms/registry.ts"
import { createRng } from "./algorithms/rng.ts"
import { type Config, sizeLabel } from "./config.ts"
import { paletteFor, renderBoard, type RenderMode } from "./render.ts"

export const SPEEDS = [
  1,
  2,
  4,
  8,
  16,
  32,
  64,
  128,
  256,
  512,
  1024,
  4096,
  Infinity,
]

export type SimState = {
  playing: boolean
  done: boolean
  steps: number
  phase: string
}

export type Sim = ReturnType<typeof createSim>

const MODES = { generate: "tiles", fov: "fov", path: "tiles" } as const

/** Owns the board, the running generator and the canvas; no Solid inside. */
export const createSim = (
  canvas: HTMLCanvasElement,
  onState: (state: SimState) => void,
) => {
  const ctx = canvas.getContext("2d", { alpha: false })!
  const darkQuery = matchMedia("(prefers-color-scheme: dark)")
  let config: Config
  let algo: Algo
  let mapKey = ""
  let board: Board
  let image: ImageData
  let buf: Uint32Array
  let gen: Generator<Step, unknown> | undefined
  let speed = 16
  let steps = 0
  let playing = false
  let done = false
  let dirty = true
  let raf = 0
  let shown = ""

  const mode = (): RenderMode =>
    algo.id === "dijkstra" ? "gradient" : MODES[algo.kind]

  const publish = () => {
    const key = `${playing}|${done}|${steps}|${board.phase}`
    if (key === shown) return
    shown = key
    onState({ playing, done, steps, phase: board.phase })
  }

  const frame = () => {
    raf = 0
    if (playing && gen) {
      for (let i = 0; i < speed; i++) {
        const r = gen.next()
        if (r.done) {
          gen = undefined
          done = true
          playing = false
          break
        }
        applyStep(board, r.value)
        steps++
      }
      dirty = true
    }
    if (dirty) {
      dirty = false
      renderBoard(board, buf, mode(), paletteFor(darkQuery.matches))
      ctx.putImageData(image, 0, 0)
    }
    publish()
    if (playing) schedule()
  }

  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(frame)
  }

  const invalidate = () => {
    dirty = true
    schedule()
  }
  darkQuery.addEventListener("change", invalidate)

  const start = () => {
    clearOverlay(board)
    steps = 0
    done = false
    gen = algo.run({
      board,
      rng: createRng(config.seed),
      radius: config.radius,
    })
    playing = true
    invalidate()
  }

  const drainNow = () => {
    for (let r = gen?.next(); r && !r.done; r = gen?.next()) {
      applyStep(board, r.value)
      steps++
    }
    gen = undefined
    done = true
    playing = false
    invalidate()
  }

  const buildMap = () => {
    const { width, height } = config.size
    board = createBoard(width, height)
    canvas.width = width
    canvas.height = height
    image = ctx.createImageData(width, height)
    buf = new Uint32Array(image.data.buffer)
    if (algo.kind === "generate") return
    const map = findAlgo(config.map)!
    drain(
      board,
      map.run({
        board,
        rng: createRng(`${config.seed}/map`),
        radius: config.radius,
      }),
    )
    const open = passableIndices(board.grid)
    const rng = createRng(`${config.seed}/pick`)
    const pick = () => open[Math.floor(rng() * open.length)] ?? -1
    board.start = pick()
    board.goal = pick()
  }

  /** Applies a new config, reusing the map when only the algorithm changed. */
  const configure = (next: Config) => {
    algo = findAlgo(next.alg)!
    const key = algo.kind === "generate"
      ? ""
      : `${next.seed}|${sizeLabel(next.size)}|${next.map}`
    config = next
    if (!key || key !== mapKey) buildMap()
    mapKey = key
    start()
    if (speed === Infinity) drainNow()
  }

  /** Moves the start (or goal) marker; field of view recomputes at once. */
  const place = (which: "start" | "goal", index: number) => {
    if (
      algo.kind === "generate" || index < 0 ||
      board.grid.cells[index] === Tile.Wall
    ) return
    if (algo.kind === "fov") {
      board.start = index
      for (let i = 0; i < board.overlay.length; i++) {
        if (board.overlay[i] === Mark.Visible) board.overlay[i] = Mark.Seen
      }
      steps = 0
      gen = algo.run({
        board,
        rng: createRng(config.seed),
        radius: config.radius,
      })
      drainNow()
      return
    }
    board[which] = index
    start()
    if (speed === Infinity) drainNow()
  }

  return {
    configure,
    place,
    reset: () => {
      if (algo.kind === "generate") buildMap()
      start()
      if (speed === Infinity) drainNow()
    },
    play: () => {
      if (!gen) start()
      playing = true
      schedule()
      if (speed === Infinity) drainNow()
    },
    pause: () => {
      playing = false
      invalidate()
    },
    step: () => {
      if (!gen) start()
      playing = false
      const r = gen!.next()
      if (r.done) {
        gen = undefined
        done = true
      } else {
        applyStep(board, r.value)
        steps++
      }
      invalidate()
    },
    setSpeed: (next: number) => {
      speed = next
      if (next === Infinity && playing) drainNow()
    },
    /** Cell index under a client-space point, or -1 when outside the grid. */
    cellAt: (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect()
      const x = Math.floor(((clientX - r.left) / r.width) * board.grid.width)
      const y = Math.floor(((clientY - r.top) / r.height) * board.grid.height)
      const { width, height } = board.grid
      return x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x
    },
    dispose: () => {
      cancelAnimationFrame(raf)
      darkQuery.removeEventListener("change", invalidate)
    },
  }
}

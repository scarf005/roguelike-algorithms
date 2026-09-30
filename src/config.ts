import { findAlgo, GENERATORS } from "./algorithms/registry.ts"

export const SIZES = [
  { width: 40, height: 25 },
  { width: 80, height: 50 },
  { width: 120, height: 75 },
  { width: 160, height: 100 },
  { width: 240, height: 150 },
] as const

export type Size = typeof SIZES[number]

export const sizeLabel = ({ width, height }: Size) => `${width}x${height}`

export const RADIUS = { min: 2, max: 40 }

export type Config = {
  alg: string
  seed: string
  size: Size
  /** Generator that builds the map for field of view and pathfinding. */
  map: string
  radius: number
}

export const DEFAULT_CONFIG: Config = {
  alg: "bsp",
  seed: "dungeon",
  size: SIZES[3],
  map: "bsp",
  radius: 12,
}

export const parseConfig = (hash: string): Config => {
  const params = new URLSearchParams(hash.replace(/^#/, ""))
  const alg = params.get("alg") ?? ""
  const map = params.get("map") ?? ""
  const radius = Number(params.get("radius"))
  return {
    alg: findAlgo(alg) ? alg : DEFAULT_CONFIG.alg,
    seed: params.get("seed") || DEFAULT_CONFIG.seed,
    size: SIZES.find((s) => sizeLabel(s) === params.get("size")) ??
      DEFAULT_CONFIG.size,
    map: GENERATORS.some((g) => g.id === map) ? map : DEFAULT_CONFIG.map,
    radius: Number.isInteger(radius) && radius >= RADIUS.min &&
        radius <= RADIUS.max
      ? radius
      : DEFAULT_CONFIG.radius,
  }
}

export const formatConfig = (c: Config) =>
  "#" + new URLSearchParams({
    alg: c.alg,
    seed: c.seed,
    size: sizeLabel(c.size),
    map: c.map,
    radius: String(c.radius),
  })

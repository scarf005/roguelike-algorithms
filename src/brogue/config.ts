import type { BrogueDepth, BrogueSeed } from "./types.ts"

export type BrogueConfig = {
  seed: BrogueSeed
  depth: BrogueDepth
  error?: string
}

export const DEFAULT_BROGUE_CONFIG: BrogueConfig = { seed: "1", depth: 1 }
const seedPattern = /^[1-9][0-9]*$/

export const validateSeed = (value: string): BrogueSeed => {
  if (!seedPattern.test(value)) {
    throw new Error(
      "Seed must be an unsigned decimal integer from 1 to 18446744073709551615.",
    )
  }
  if (value.length > 20 || BigInt(value) > 0xffff_ffff_ffff_ffffn) {
    throw new Error("Seed must be at most 18446744073709551615.")
  }
  return value
}

export const validateDepth = (value: number): BrogueDepth => {
  if (!Number.isInteger(value) || value < 1 || value > 26) {
    throw new Error("Depth must be an integer from 1 to 26.")
  }
  return value
}

export const parseBrogueConfig = (hash: string): BrogueConfig => {
  const params = new URLSearchParams(hash.replace(/^#/, ""))
  const providedSeed = params.get("seed")
  const providedDepth = params.get("depth")
  const errors: string[] = []
  let seed = DEFAULT_BROGUE_CONFIG.seed
  let depth = DEFAULT_BROGUE_CONFIG.depth
  if (providedSeed !== null) {
    try {
      seed = validateSeed(providedSeed)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  if (providedDepth !== null) {
    const parsed = Number(providedDepth)
    try {
      depth = validateDepth(parsed)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  return errors.length
    ? { seed, depth, error: errors.join(" ") }
    : { seed, depth }
}

export const formatBrogueConfig = ({ seed, depth }: BrogueConfig) =>
  "#" + new URLSearchParams({
    view: "brogue",
    seed: validateSeed(seed),
    depth: String(validateDepth(depth)),
  })

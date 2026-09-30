export type Rng = () => number

/** FNV-1a: any seed string becomes a stable 32-bit state. */
export const hashSeed = (seed: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: returns floats in [0, 1). */
export const createRng = (seed: string): Rng => {
  let a = hashSeed(seed)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Inclusive integer in [min, max]. */
export const randInt = (rng: Rng, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1))

export const pick = <T>(rng: Rng, items: readonly T[]) =>
  items[Math.floor(rng() * items.length)]

export const shuffle = <T>(rng: Rng, items: readonly T[]) => {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export const randomSeed = () => Math.random().toString(36).slice(2, 8)

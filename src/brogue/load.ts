export type BrogueModule = {
  _engine_generate: (hi: number, lo: number, depth: number) => number
  _engine_set_mode: (mode: number) => void
  _engine_result_ptr: () => number
  _engine_result_len: () => number
  _engine_rng_vectors: (
    hi: number,
    lo: number,
    stream: number,
    count: number,
  ) => number
  UTF8ToString: (pointer: number, length: number) => string
}

type Factory = (options: { wasmBinary: Uint8Array }) => Promise<BrogueModule>

/** Factory imports may be cached, but engine memory/state must be fresh each call. */
export const loadBrogueModule = async (
  assetBase?: string,
): Promise<BrogueModule> => {
  const local = typeof Deno !== "undefined"
  const root = local
    ? new URL(/* @vite-ignore */ "../../public/brogue/", import.meta.url)
    : new URL(assetBase ?? "brogue/", globalThis.location.href)
  const imported = await import(
    /* @vite-ignore */ new URL("brogue.js", root).href
  ) as {
    default: Factory
  }
  const binaryUrl = new URL("brogue.wasm", root)
  let wasmBinary: Uint8Array
  if (local) wasmBinary = await Deno.readFile(binaryUrl)
  else {
    const response = await fetch(binaryUrl)
    if (!response.ok) {
      throw new Error(`Brogue WASM download failed (${response.status}).`)
    }
    wasmBinary = new Uint8Array(await response.arrayBuffer())
  }
  return imported.default({ wasmBinary })
}

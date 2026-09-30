type WasmModule = {
  _engine_generate: (high: number, low: number, depth: number) => number
  _engine_result_ptr: () => number
  _engine_result_len: () => number
  UTF8ToString: (pointer: number, length: number) => string
}

type Dump = {
  final?: { terrain: number[][] }
  snapshots?: Array<{ terrain: number[][] }>
}

const seeds = [
  "1",
  "12345",
  "4294967295",
  "4294967296",
  "18446744073709551614",
  "18446744073709551615",
]
const depths = [1, 13, 26]

const loadWasm = async (): Promise<WasmModule> => {
  const imported = await import(
    new URL("../../public/brogue/brogue.js", import.meta.url).href
  ) as {
    default: (options: { wasmBinary: ArrayBuffer }) => Promise<WasmModule>
  }
  const bytes = await Deno.readFile(
    new URL("../../public/brogue/brogue.wasm", import.meta.url),
  )
  return await imported.default({ wasmBinary: bytes.buffer as ArrayBuffer })
}

const terrain = (dump: Dump): number[][] => {
  const final = dump.final ?? dump.snapshots?.at(-1)
  if (!final) throw new Error("WASM output has no final state")
  return final.terrain
}

const wasm = await loadWasm()
for (const seed of seeds) {
  for (const depth of depths) {
    const value = BigInt(seed)
    if (
      !wasm._engine_generate(
        Number(value >> 32n),
        Number(value & 0xffff_ffffn),
        depth,
      )
    ) throw new Error(`WASM failed for ${seed}/${depth}`)
    const actual = terrain(
      JSON.parse(
        wasm.UTF8ToString(wasm._engine_result_ptr(), wasm._engine_result_len()),
      ) as Dump,
    )
    const fixture = JSON.parse(
      await Deno.readTextFile(`src/brogue/fixtures/${seed}-${depth}.json`),
    ) as { terrain: number[][] }
    if (JSON.stringify(actual) !== JSON.stringify(fixture.terrain)) {
      throw new Error(`terrain mismatch for ${seed}/${depth}`)
    }
    console.log(`${seed}/${depth}: parity OK`)
  }
}

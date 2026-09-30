const [seed, depth, output] = Deno.args
if (!seed || !depth || !output) {
  throw new Error("usage: wasm.ts SEED DEPTH OUTPUT")
}
const value = BigInt(seed)
const modulePath = new URL("../../public/brogue/brogue.js", import.meta.url)
const imported = await import(modulePath.href) as {
  default: (options: { wasmBinary: ArrayBuffer }) => Promise<{
    _engine_generate: (hi: number, lo: number, depth: number) => number
    _engine_result_ptr: () => number
    _engine_result_len: () => number
    UTF8ToString: (ptr: number, len: number) => string
  }>
}
const wasmBinary = await Deno.readFile(
  new URL("../../public/brogue/brogue.wasm", import.meta.url),
)
const module = await imported.default({ wasmBinary: wasmBinary.buffer })
if (
  !module._engine_generate(
    Number(value >> 32n),
    Number(value & 0xffff_ffffn),
    Number(depth),
  )
) {
  throw new Error("WASM rejected seed/depth")
}
await Deno.writeTextFile(
  output,
  module.UTF8ToString(module._engine_result_ptr(), module._engine_result_len()),
)

type WasmModule = {
  _engine_generate: (high: number, low: number, depth: number) => number
  _engine_set_mode: (mode: number) => void
  _engine_result_ptr: () => number
  _engine_result_len: () => number
  UTF8ToString: (pointer: number, length: number) => string
}

type NativeDump = {
  final?: { terrain: number[][] }
  snapshots?: Array<{ terrain: number[][] }>
}

type Baseline = {
  seed: string
  depth: number
  hash: string
}

type VerifyArguments = {
  binary?: string
  buildRepo?: string
}

const decoder = new TextDecoder()

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

const readBaselines = async (): Promise<Baseline[]> => {
  const csv = await Deno.readTextFile(
    new URL("../../docs/phase1-evidence/comparisons.csv", import.meta.url),
  )
  const rows = csv.trim().split(/\r?\n/).slice(1)
  const baselines = rows.map((row) => ({ row, columns: row.split(",") }))
    .filter(({ columns }) => columns[2] === "baseline").map(
      ({ row, columns }): Baseline => {
        const [seed, depth, , , , , , , hash] = columns
        if (!seed || !depth || !hash || hash === "?") {
          throw new Error(`baseline row has no hash: ${row}`)
        }
        return { seed, depth: Number(depth), hash }
      },
    )
  if (baselines.length !== 15) {
    throw new Error(`expected 15 baseline comparisons, got ${baselines.length}`)
  }
  return baselines
}

const hashTerrain = async (terrain: number[][]): Promise<string> => {
  const lines: string[] = []
  const height = 29
  const width = 79
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      lines.push(
        `${terrain[0][y * width + x]} ${terrain[1][y * width + x]} ${
          terrain[2][y * width + x]
        } ${terrain[3][y * width + x]} \n`,
      )
    }
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(lines.join("")),
  )
  return [...new Uint8Array(digest)].map((value) =>
    value.toString(16).padStart(2, "0")
  ).join("")
}

const finalTerrain = (dump: NativeDump): number[][] => {
  const final = dump.final ?? dump.snapshots?.at(-1)
  if (!final) throw new Error("native dump has no final state")
  return final.terrain
}

const parseArguments = (args: string[]): VerifyArguments => {
  const result: VerifyArguments = {}
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === "--binary") {
      result.binary = args[++index]
    } else if (argument === "--build-repo") {
      result.buildRepo = args[++index]
    } else {
      throw new Error(`unknown argument: ${argument}`)
    }
  }
  if ((result.binary ? 1 : 0) + (result.buildRepo ? 1 : 0) !== 1) {
    throw new Error(
      "usage: deno run -A scripts/brogue/verify-native.ts --binary PATH | --build-repo PATH",
    )
  }
  return result
}

const runNative = async (
  binary: string,
  baseline: Baseline,
): Promise<NativeDump> => {
  const result = await new Deno.Command(binary, {
    args: [baseline.seed, String(baseline.depth)],
    stdout: "piped",
    stderr: "piped",
  }).output()
  if (!result.success) {
    throw new Error(
      `native dump failed for ${baseline.seed}/${baseline.depth}: ${
        decoder.decode(result.stderr)
      }`,
    )
  }
  return JSON.parse(decoder.decode(result.stdout)) as NativeDump
}

const compare = async (
  { binary, wasm, baseline }: {
    binary: string
    wasm: WasmModule
    baseline: Baseline
  },
): Promise<void> => {
  const native = await runNative(binary, baseline)
  const nativeTerrain = finalTerrain(native)
  const nativeHash = await hashTerrain(nativeTerrain)
  if (nativeHash !== baseline.hash) {
    throw new Error(
      `${baseline.seed}/${baseline.depth} changed Phase 1 baseline: ${nativeHash}`,
    )
  }

  const seed = BigInt(baseline.seed)
  wasm._engine_set_mode(0)
  if (
    !wasm._engine_generate(
      Number(seed >> 32n),
      Number(seed & 0xffff_ffffn),
      baseline.depth,
    )
  ) throw new Error(`WASM rejected ${baseline.seed}/${baseline.depth}`)
  const wasmDump = JSON.parse(
    wasm.UTF8ToString(wasm._engine_result_ptr(), wasm._engine_result_len()),
  ) as NativeDump
  if (
    JSON.stringify(finalTerrain(wasmDump)) !== JSON.stringify(nativeTerrain)
  ) {
    throw new Error(
      `${baseline.seed}/${baseline.depth} native/WASM terrain mismatch`,
    )
  }
}

export const main = async (args = Deno.args): Promise<void> => {
  const options = parseArguments(args)
  let binary = options.binary
  let temporaryBinary: string | undefined
  if (options.buildRepo) {
    const { buildNative } = await import("./native-build.ts")
    temporaryBinary = await Deno.makeTempFile({ prefix: "brogue-native-" })
    await buildNative({ repo: options.buildRepo, output: temporaryBinary })
    binary = temporaryBinary
  }
  try {
    if (!binary) throw new Error("native binary is missing")
    const baselines = await readBaselines()
    const wasm = await loadWasm()
    for (const baseline of baselines) {
      await compare({ binary, wasm, baseline })
      console.log(`${baseline.seed}/${baseline.depth}: native/WASM/baseline OK`)
    }
  } finally {
    if (temporaryBinary) await Deno.remove(temporaryBinary).catch(() => {})
  }
}

if (import.meta.main) await main()

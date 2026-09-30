import { resolve } from "@std/path"
import { UPSTREAM_COMMIT } from "../../src/brogue/types.ts"
import type { RngVector } from "../../src/brogue/engine.ts"

const seeds = [
  "1",
  "12345",
  "4294967295",
  "4294967296",
  "18446744073709551614",
  "18446744073709551615",
]
const [binaryInput, outputDirectory = "src/brogue/fixtures"] = Deno.args
if (!binaryInput || Deno.args.length > 2) {
  throw new Error(
    "usage: deno task brogue:fixtures NATIVE_BINARY [OUTPUT_DIRECTORY]",
  )
}
const binary = resolve(binaryInput)
const runNative = async (args: string[]) => {
  const result = await new Deno.Command(binary, {
    args,
    stdout: "piped",
    stderr: "inherit",
  }).output()
  if (!result.success) throw new Error(`native dump failed: ${args.join(" ")}`)
  return new TextDecoder().decode(result.stdout)
}

type NativeDump = {
  upstreamCommit: string
  variant: string
  boundary: string
  width: number
  height: number
  terrainOrder: string[]
  final: { terrain: number[][] }
}
await Deno.mkdir(outputDirectory, { recursive: true })
for (const seed of seeds) {
  for (const depth of [1, 13, 26]) {
    const dump = JSON.parse(
      await runNative([seed, String(depth)]),
    ) as NativeDump
    if (dump.upstreamCommit !== UPSTREAM_COMMIT || dump.variant !== "brogue") {
      throw new Error(
        "Native fixture binary is not the pinned standard Brogue CE wrapper.",
      )
    }
    await Deno.writeTextFile(
      `${outputDirectory}/${seed}-${depth}.json`,
      JSON.stringify({
        schemaVersion: 1,
        upstreamCommit: dump.upstreamCommit,
        variant: dump.variant,
        boundary: dump.boundary,
        seed,
        depth,
        width: dump.width,
        height: dump.height,
        terrainOrder: dump.terrainOrder,
        terrain: dump.final.terrain,
        source: "independent native dump-only Brogue CE wrapper",
      }) + "\n",
    )
  }
}

const vectors: RngVector[] = []
for (const seed of seeds.filter((seed) => seed !== "18446744073709551614")) {
  for (const stream of [0, 1]) {
    vectors.push(
      JSON.parse(
        await runNative(["--rng", seed, String(stream), "32"]),
      ) as RngVector,
    )
  }
}
await Deno.writeTextFile(
  `${outputDirectory}/rng-vectors.json`,
  JSON.stringify({
    schemaVersion: 1,
    upstreamCommit: UPSTREAM_COMMIT,
    source: {
      path: "src/brogue/Math.c",
      functions: ["seedRandomGenerator", "rand_range", "range"],
      boundedRange: [0, 2147483646],
    },
    count: 32,
    vectors,
  }) + "\n",
)

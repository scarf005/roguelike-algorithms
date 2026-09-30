const emcc = Deno.env.get("EMCC")
if (!emcc) throw new Error("set EMCC to the Emscripten compiler path")
const version = await new Deno.Command(emcc, { args: ["--version"] }).output()
const versionText = new TextDecoder().decode(version.stdout)
if (!version.success || !versionText.includes("4.0.10")) {
  throw new Error(`Expected Emscripten 4.0.10 at ${emcc}; got ${versionText}`)
}

await Deno.mkdir("public/brogue", { recursive: true })
const sourceRoot = "vendor/brogue-ce/src"
const sources = [
  ...[...Deno.readDirSync(`${sourceRoot}/brogue`)]
    .filter((entry) => entry.name.endsWith(".c"))
    .map((entry) => `${sourceRoot}/brogue/${entry.name}`).sort(),
  `${sourceRoot}/variants/GlobalsBrogue.c`,
  `${sourceRoot}/variants/GlobalsBulletBrogue.c`,
  `${sourceRoot}/variants/GlobalsRapidBrogue.c`,
  `${sourceRoot}/platform/main.c`,
  `${sourceRoot}/platform/platformdependent.c`,
  `${sourceRoot}/platform/null-platform.c`,
  `${sourceRoot}/platform/engine_wrapper.c`,
]
const command = new Deno.Command(emcc, {
  args: [
    "-DDATADIR=.",
    '-DBROGUE_EXTRA_VERSION=""',
    `-I${sourceRoot}/brogue`,
    `-I${sourceRoot}/platform`,
    `-I${sourceRoot}/variants`,
    "-std=c99",
    "-O2",
    ...sources,
    "-lm",
    "-sMODULARIZE=1",
    "-sEXPORT_ES6=1",
    "-sEMIT_EMSCRIPTEN_LICENSE=1",
    "-sENVIRONMENT=web,worker,node",
    "-sSTACK_SIZE=8388608",
    "-sINITIAL_MEMORY=33554432",
    "-sALLOW_MEMORY_GROWTH=1",
    '-sEXPORTED_FUNCTIONS=["_engine_generate","_engine_set_mode","_engine_result_ptr","_engine_result_len","_engine_rng_vectors"]',
    '-sEXPORTED_RUNTIME_METHODS=["UTF8ToString"]',
    "-o",
    "public/brogue/brogue.js",
  ],
  stdout: "inherit",
  stderr: "inherit",
  env: { PATH: Deno.env.get("PATH") ?? "" },
})
const result = await command.output()
if (!result.success) {
  throw new Error(`Emscripten failed with status ${result.code}`)
}
const provenance =
  "Generated from modified Brogue CE src/brogue/Architect.c, src/brogue/RogueMain.c, src/brogue/Math.c and src/platform/engine_wrapper.c; upstream commit 1ba4240b7a928ddf0ffb772717bf1d433cd63804; Copyright 2012 Brian Walker; AGPL-3.0-or-later; Emscripten 4.0.10."
const generated = await Deno.readTextFile("public/brogue/brogue.js")
await Deno.writeTextFile(
  "public/brogue/brogue.js",
  `/* ${provenance} */\n${generated}`,
)
await Deno.writeTextFile(
  "public/brogue/PROVENANCE.md",
  `${provenance}\n`,
)

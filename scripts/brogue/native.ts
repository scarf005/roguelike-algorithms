const [seed, depth, output, binary] = Deno.args
if (!seed || !depth || !output || !binary || Deno.args.length > 4) {
  throw new Error(
    "usage: deno run -A scripts/brogue/native.ts SEED DEPTH OUTPUT NATIVE_BINARY",
  )
}
const command = new Deno.Command(binary, {
  args: [seed, depth],
  stdout: "piped",
  stderr: "inherit",
})
const result = await command.output()
if (!result.success) {
  throw new Error(`native dump failed with status ${result.code}`)
}
await Deno.writeFile(output, result.stdout)

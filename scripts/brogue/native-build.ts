import { dirname, resolve } from "@std/path"

export type NativeBuildOptions = {
  repo: string
  output: string
}

const run = async (
  { command, args, cwd }: { command: string; args: string[]; cwd: string },
): Promise<void> => {
  const result = await new Deno.Command(command, {
    cwd,
    args,
    stdout: "inherit",
    stderr: "inherit",
  }).output()
  if (!result.success) {
    throw new Error(`${command} failed with status ${result.code}`)
  }
}

export const buildNative = async (
  { repo: repoInput, output: outputInput }: NativeBuildOptions,
): Promise<void> => {
  const repo = resolve(repoInput)
  const output = resolve(outputInput)
  await Deno.mkdir(dirname(output), { recursive: true })
  await Deno.mkdir(`${repo}/bin`, { recursive: true })
  const temporaryDirectory = await Deno.makeTempDir({
    dir: dirname(output),
    prefix: "brogue-native-build-",
  })
  try {
    await run({
      command: "make",
      args: ["GRAPHICS=NO", "TERMINAL=NO", "RELEASE=YES", "-j4"],
      cwd: repo,
    })
    await run({
      command: "cc",
      args: [
        "-DDATADIR=.",
        "-Isrc/brogue",
        "-Isrc/platform",
        "-Isrc/variants",
        "-std=c99",
        "-O2",
        "-c",
        "src/platform/native_dump.c",
        "-o",
        `${temporaryDirectory}/native_dump.o`,
      ],
      cwd: repo,
    })
    await run({
      command: "cc",
      args: [
        "-DENGINE_DUMP_ONLY",
        "-DDATADIR=.",
        "-Isrc/brogue",
        "-Isrc/platform",
        "-Isrc/variants",
        "-std=c99",
        "-O2",
        "-c",
        "src/platform/engine_wrapper.c",
        "-o",
        `${temporaryDirectory}/engine_wrapper.o`,
      ],
      cwd: repo,
    })

    const objects = [...Deno.readDirSync(`${repo}/src/brogue`)]
      .filter((entry) => entry.name.endsWith(".o"))
      .map((entry) => `src/brogue/${entry.name}`)
    const variants = [...Deno.readDirSync(`${repo}/src/variants`)]
      .filter((entry) => entry.name.endsWith(".o"))
      .map((entry) => `src/variants/${entry.name}`)
    await run({
      command: "cc",
      args: [
        "-O2",
        "-o",
        output,
        ...objects,
        ...variants,
        "src/platform/platformdependent.o",
        "src/platform/null-platform.o",
        `${temporaryDirectory}/engine_wrapper.o`,
        `${temporaryDirectory}/native_dump.o`,
        "-lm",
      ],
      cwd: repo,
    })
  } finally {
    await Deno.remove(temporaryDirectory, { recursive: true }).catch(() => {})
  }
}

export const main = async (args = Deno.args): Promise<void> => {
  const [output, repo = "vendor/brogue-ce"] = args
  if (!output || args.length > 2) {
    throw new Error(
      "usage: deno task brogue:native OUTPUT [BROGUE_REPO]",
    )
  }
  await buildNative({ repo, output })
}

if (import.meta.main) await main()

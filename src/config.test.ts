import { assertEquals } from "@std/assert"
import {
  Config,
  DEFAULT_CONFIG,
  formatConfig,
  parseConfig,
  SIZES,
} from "./config.ts"

Deno.test("config: format and parse round-trip", () => {
  const c: Config = {
    alg: "astar",
    seed: "a b&c=d/é",
    size: SIZES[1],
    map: "caves",
    radius: 30,
  }
  assertEquals(parseConfig(formatConfig(c)), c)
})

Deno.test("config: empty or garbage hashes fall back to defaults", () => {
  assertEquals(parseConfig(""), DEFAULT_CONFIG)
  assertEquals(parseConfig("#"), DEFAULT_CONFIG)
  assertEquals(
    parseConfig("#alg=nope&seed=&size=1x1&map=fov&radius=999"),
    DEFAULT_CONFIG,
  )
  assertEquals(parseConfig("#radius=2.5&map=astar"), DEFAULT_CONFIG)
})

Deno.test("config: valid fields survive next to invalid ones", () => {
  assertEquals(parseConfig("#alg=maze&seed=x&radius=1").alg, "maze")
  assertEquals(parseConfig("#alg=maze&seed=x&radius=1").seed, "x")
  assertEquals(parseConfig("#alg=maze&seed=x&radius=1").radius, 12)
})

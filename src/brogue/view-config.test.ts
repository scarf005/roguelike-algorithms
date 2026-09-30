import { assertEquals, assertMatch, assertThrows } from "@std/assert"
import {
  formatBrogueConfig,
  parseBrogueConfig,
  validateDepth,
  validateSeed,
} from "./config.ts"

Deno.test("Brogue inputs: preserve exact legacy and uint64 decimal seeds", () => {
  for (
    const seed of [
      "1",
      "4294967295",
      "4294967296",
      "9007199254740993",
      "18446744073709551615",
    ]
  ) {
    assertEquals(validateSeed(seed), seed)
    for (const depth of [1, 13, 26]) {
      const config = { seed, depth }
      assertEquals(parseBrogueConfig(formatBrogueConfig(config)), config)
    }
  }
})

Deno.test("Brogue inputs: reject malformed/out-of-range seeds clearly", () => {
  for (
    const seed of [
      "",
      "0",
      "-1",
      "+1",
      "01",
      " 1",
      "1 ",
      "1.5",
      "1e3",
      "0xff",
      "NaN",
      "18446744073709551616",
    ]
  ) {
    assertThrows(() => validateSeed(seed), Error, "Seed must")
    assertMatch(
      parseBrogueConfig("#view=brogue&seed=" + encodeURIComponent(seed)).error!,
      /Seed must/,
    )
  }
})

Deno.test("Brogue inputs: integer depth 1 through 26 only", () => {
  for (const depth of [0, -1, 27, 1.5, NaN, Infinity]) {
    assertThrows(
      () => validateDepth(depth),
      Error,
      "Depth must be an integer from 1 to 26",
    )
  }
  assertEquals(parseBrogueConfig("#view=brogue"), { seed: "1", depth: 1 })
  assertMatch(parseBrogueConfig("#view=brogue&depth=27").error!, /Depth must/)
})

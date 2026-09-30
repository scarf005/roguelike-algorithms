import { assertEquals } from "@std/assert"
import { algorithmRoute } from "./route.ts"

Deno.test("route: Brogue is the default without breaking classic links", () => {
  for (
    const hash of ["", "#view=brogue&seed=1&depth=26", "#garbage", "#seed=1"]
  ) {
    assertEquals(algorithmRoute(hash), false, hash)
  }
  for (
    const hash of [
      "#alg=bsp&seed=dungeon&size=160x100",
      "#alg=shadowcast&map=caves",
      "#size=80x50",
      "#view=algorithms",
    ]
  ) assertEquals(algorithmRoute(hash), true, hash)
  assertEquals(algorithmRoute("#view=brogue&alg=bsp"), false)
})

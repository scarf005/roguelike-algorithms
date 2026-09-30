import { generateLevel } from "./engine.ts"
import { validateDepth, validateSeed } from "./config.ts"
import type { WorkerRequest, WorkerResponse } from "./types.ts"

const post = (message: WorkerResponse) => self.postMessage(message)

self.onmessage = async (
  event: MessageEvent<WorkerRequest & { assetBase?: string }>,
) => {
  const request = event.data
  if (request.type === "ping") {
    post({ type: "pong" })
    return
  }
  if (request.type === "cancel") return
  try {
    const seed = validateSeed(request.seed)
    const depth = validateDepth(request.depth)
    post({
      type: "result",
      requestId: request.requestId,
      result: await generateLevel({
        seed,
        depth,
        mode: request.mode,
        assetBase: request.assetBase,
      }),
    })
  } catch (error) {
    post({
      type: "error",
      requestId: request.requestId,
      code: "ENGINE_ERROR",
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

post({ type: "ready" })

import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js"
import { validateDepth, validateSeed } from "./config.ts"
import { PHASE_EXPLANATIONS, phaseTitle } from "./phases.ts"
import { createPlayback } from "./playback.ts"
import {
  createBrogueRenderer,
  OVERLAY_COLORS,
  REJECTION_COLOR,
  WITNESS_COLOR,
} from "./render.ts"
import type { EngineResult, WorkerResponse } from "./types.ts"

const SPEEDS = [1, 4, 16, 64, 256, 1024]
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error)
const hashInputs = () => {
  const params = new URLSearchParams(location.hash.slice(1))
  return {
    seed: params.get("seed") ?? "1",
    depth: params.get("depth") ?? "1",
    step: params.get("step") ?? "0",
  }
}

export const BrogueView = () => {
  const input = hashInputs()
  const [seed, setSeed] = createSignal(input.seed)
  const [depth, setDepth] = createSignal(input.depth)
  const [result, setResult] = createSignal<EngineResult>()
  const [cursor, setCursor] = createSignal(0)
  const [playing, setPlaying] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [status, setStatus] = createSignal("")
  const [error, setError] = createSignal("")
  const [speed, setSpeed] = createSignal(2)
  const [overlays, setOverlays] = createSignal(true)
  let canvas!: HTMLCanvasElement
  let renderer: ReturnType<typeof createBrogueRenderer>
  let playback: ReturnType<typeof createPlayback> | undefined
  let worker: Worker | undefined
  let requestId = 0
  let raf = 0
  let generatedKey = ""
  const event = createMemo(() => result()?.events[cursor() - 1])
  const phase = () => {
    cursor()
    return playback?.state().phase ?? "clearLevel"
  }
  const phases = createMemo(() => {
    const events = result()?.events ?? []
    return events.flatMap((entry, index) =>
      index === 0 || entry.phase !== events[index - 1].phase
        ? [{
          position: index + 1,
          phase: entry.phase,
          attempt: entry.generationAttempt,
        }]
        : []
    )
  })
  const draw = () => {
    if (playback) {
      renderer.draw(playback.state(), { event: event(), overlays: overlays() })
    }
  }
  const pause = () => {
    cancelAnimationFrame(raf)
    raf = 0
    setPlaying(false)
  }
  const updateHash = () => {
    const header = result()?.header
    if (!header) return
    history.replaceState(
      null,
      "",
      "#" + new URLSearchParams({
        view: "brogue",
        seed: header.seed,
        depth: String(header.depth),
        step: String(cursor()),
      }),
    )
  }
  const seek = (position: number, writeHash = true) => {
    if (!playback) return
    try {
      playback.seek(position)
      setCursor(position)
      draw()
      if (writeHash) updateHash()
    } catch (cause) {
      setError(message(cause))
      pause()
    }
  }
  const tick = () => {
    const end = result()!.events.length
    seek(Math.min(end, cursor() + SPEEDS[speed()]))
    if (cursor() >= end) pause()
    else raf = requestAnimationFrame(tick)
  }
  const togglePlay = () => {
    if (!playback || loading()) return
    if (playing()) pause()
    else {
      if (cursor() === result()!.events.length) seek(0)
      setPlaying(true)
      raf = requestAnimationFrame(tick)
    }
  }
  const step = (direction: number) => {
    pause()
    seek(Math.max(0, Math.min(result()!.events.length, cursor() + direction)))
  }
  const jump = (direction: number) => {
    pause()
    const entries = phases()
    const entry = direction > 0
      ? entries.find((entry) => entry.position > cursor())
      : entries.findLast((entry) => entry.position < cursor())
    seek(entry?.position ?? (direction > 0 ? result()!.events.length : 0))
  }
  const stopGeneration = () => {
    requestId++
    worker?.terminate()
    worker = undefined
    setLoading(false)
  }
  const generate = (requestedStep = 0) => {
    pause()
    let gameSeed: string
    let gameDepth: number
    try {
      gameSeed = validateSeed(seed())
      gameDepth = validateDepth(Number(depth()))
      if (!Number.isInteger(requestedStep) || requestedStep < 0) {
        throw new Error("Step must be a nonnegative integer.")
      }
    } catch (cause) {
      setError(message(cause))
      return
    }
    stopGeneration()
    setError("")
    setResult(undefined)
    playback = undefined
    setCursor(0)
    renderer.setCatalog([])
    const context = canvas.getContext("2d")!
    context.fillStyle = "#080808"
    context.fillRect(0, 0, canvas.width, canvas.height)
    setLoading(true)
    setStatus(
      "Generating depths 1 through " + gameDepth + " with Brogue CE v1.15.1…",
    )
    generatedKey = `${gameSeed}/${gameDepth}`
    const id = String(++requestId)
    try {
      worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      })
      worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (
          !("requestId" in data) || data.requestId !== id ||
          id !== String(requestId)
        ) return
        if (data.type === "progress") {
          setStatus(
            `${phaseTitle(data.phase)} (${data.completed}${
              data.total ? "/" + data.total : ""
            })`,
          )
        } else if (data.type === "result") {
          try {
            playback = createPlayback(data.result)
            setResult(data.result)
            renderer.setCatalog(data.result.tileCatalog)
            stopGeneration()
            setStatus("")
            seek(requestedStep)
          } catch (cause) {
            setError(message(cause))
            stopGeneration()
          }
        } else if (data.type === "error") {
          setError(data.message)
          stopGeneration()
        }
      }
      worker.onerror = (failure) => {
        if (id !== String(requestId)) return
        setError(failure.message || "Brogue generation worker failed.")
        stopGeneration()
      }
      worker.postMessage({
        type: "generate",
        requestId: id,
        seed: gameSeed,
        depth: gameDepth,
        assetBase: new URL("brogue/", document.baseURI).href,
      })
    } catch (cause) {
      setError(message(cause))
      stopGeneration()
    }
  }
  const onHash = () => {
    const next = hashInputs()
    setSeed(next.seed)
    setDepth(next.depth)
    const requestedStep = Number(next.step)
    if (generatedKey === `${next.seed}/${next.depth}` && playback) {
      pause()
      seek(requestedStep, false)
    } else generate(requestedStep)
  }
  const onKey = (keyboard: KeyboardEvent) => {
    const target = keyboard.target
    if (
      target instanceof HTMLElement &&
      (target.closest("input, select, textarea, button, a") ||
        target.isContentEditable)
    ) return
    if (
      keyboard.altKey || keyboard.ctrlKey || keyboard.metaKey || !playback ||
      loading()
    ) return
    if (keyboard.code === "Space") togglePlay()
    else if (keyboard.code === "ArrowRight") {
      keyboard.shiftKey ? jump(1) : step(1)
    } else if (keyboard.code === "ArrowLeft") {
      keyboard.shiftKey ? jump(-1) : step(-1)
    } else return
    keyboard.preventDefault()
  }
  onMount(() => {
    renderer = createBrogueRenderer(canvas)
    addEventListener("hashchange", onHash)
    addEventListener("keydown", onKey)
    generate(Number(input.step))
  })
  onCleanup(() => {
    pause()
    stopGeneration()
    removeEventListener("hashchange", onHash)
    removeEventListener("keydown", onKey)
  })
  const diagnostic = () => {
    const entry = event()
    if (!entry) return ""
    return [
      entry.outcome,
      entry.reason,
      entry.details?.roomType,
      entry.details?.blueprint !== undefined &&
      `blueprint ${entry.details.blueprint}`,
      entry.details?.pathDistance !== undefined &&
      `path distance ${entry.details.pathDistance}`,
      entry.details?.iteration !== undefined &&
      `environment update ${entry.details.iteration}`,
    ].filter((value) => typeof value === "string").join(" · ")
  }
  return (
    <main class="brogue-tool">
      <h1>Brogue CE level generation, visualized (unofficial)</h1>
      <form
        class="brogue-inputs"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          generate()
        }}
      >
        <label class="brogue-seed">
          Game seed
          <input
            type="text"
            inputmode="numeric"
            spellcheck={false}
            value={seed()}
            onInput={(e) => setSeed(e.currentTarget.value)}
          />
        </label>
        <label class="brogue-depth">
          Depth
          <input
            type="number"
            min="1"
            max="26"
            step="1"
            value={depth()}
            onInput={(e) => setDepth(e.currentTarget.value)}
          />
        </label>
        <button type="submit">Generate</button>
        <Show when={loading()}>
          <button
            type="button"
            onClick={() => {
              stopGeneration()
              setStatus("Generation cancelled.")
            }}
          >
            Cancel
          </button>
        </Show>
      </form>
      <Show when={error()}>
        <p class="brogue-error" role="alert">{error()}</p>
      </Show>
      <Show when={status()}>
        <p class="brogue-status" role="status">{status()}</p>
      </Show>
      <Show when={result()}>
        <p class="brogue-status">
          Seed {result()!.header.seed} · depth {result()!.header.depth}{" "}
          · standard CE v1.15.1
        </p>
      </Show>
      <div class="brogue-map" aria-busy={loading()}>
        <canvas
          ref={canvas}
          aria-label="Brogue dungeon terrain and generation diagnostics"
        />
      </div>
      <p class="brogue-status" aria-live="off">
        {phaseTitle(phase())} · {cursor()} / {result()?.events.length ?? 0}{" "}
        steps
        {event() ? ` · ${event()!.sourceFunction}()` : ""}
      </p>
      <div class="brogue-playback">
        <button
          type="button"
          disabled={!result() || loading()}
          onClick={togglePlay}
        >
          {playing()
            ? "Pause"
            : cursor() === result()?.events.length
            ? "Replay"
            : "Play"}
        </button>
        <button
          type="button"
          disabled={!result() || cursor() === 0}
          onClick={() => step(-1)}
        >
          Back
        </button>
        <button
          type="button"
          disabled={!result() || cursor() === result()?.events.length}
          onClick={() => step(1)}
        >
          Step
        </button>
        <label class="brogue-scrub">
          Scrub
          <input
            type="range"
            min="0"
            max={result()?.events.length ?? 0}
            value={cursor()}
            disabled={!result()}
            onInput={(e) => {
              pause()
              seek(Number(e.currentTarget.value))
            }}
          />
        </label>
        <label>
          Speed: {SPEEDS[speed()]} steps/frame
          <input
            type="range"
            min="0"
            max={SPEEDS.length - 1}
            value={speed()}
            onInput={(e) => setSpeed(Number(e.currentTarget.value))}
          />
        </label>
        <label class="brogue-phase-select">
          Jump to phase
          <select
            disabled={!result()}
            value={phases().findLast((entry) => entry.position <= cursor())
              ?.position ?? 0}
            onChange={(e) => {
              pause()
              seek(Number(e.currentTarget.value))
            }}
          >
            <option value="0">Start</option>
            <For each={phases()}>
              {(entry) => (
                <option value={entry.position}>
                  {phaseTitle(entry.phase)}
                  {entry.attempt > 1 ? ` (attempt ${entry.attempt})` : ""}
                </option>
              )}
            </For>
          </select>
        </label>
      </div>
      <p class="brogue-shortcuts">
        Space: play/pause · Left/Right: back/step · Shift + Left/Right:
        previous/next phase. Shortcuts apply outside controls. On narrow
        screens, swipe the map sideways to keep glyphs readable.
      </p>
      <div class="brogue-info">
        <section class="brogue-explanation" aria-label="Phase explanation">
          <h2>{phaseTitle(phase())}</h2>
          <p>{PHASE_EXPLANATIONS[phase()]?.text}</p>
          <Show when={diagnostic()}>
            <p class="brogue-diagnostic">{diagnostic()}</p>
          </Show>
          <p class="brogue-status">
            Earlier depths are generated in full. Final terrain represents
            canonical fresh sequential first entry, not later changes in a
            played save.
          </p>
        </section>
        <section class="brogue-legend" aria-label="Overlay legend">
          <h2>Generation overlays</h2>
          <label>
            <span>
              <input
                type="checkbox"
                checked={overlays()}
                onChange={(e) => {
                  setOverlays(e.currentTarget.checked)
                  draw()
                }}
              />{" "}
              Show diagnostics
            </span>
          </label>
          <ul>
            <For each={Object.entries(OVERLAY_COLORS)}>
              {([kind, color]) => (
                <li>
                  <span class="brogue-swatch" style={{ background: color }} />
                  {kind === "doors"
                    ? "Door sites"
                    : kind === "lake"
                    ? "Lake / flood-reached floor"
                    : kind === "choke"
                    ? "Choke area (brighter = more cells behind exit)"
                    : kind[0].toUpperCase() + kind.slice(1)}
                </li>
              )}
            </For>
            <li>
              <span
                class="brogue-swatch"
                style={{ background: REJECTION_COLOR }}
              />Rejected / rolled back / not flood-reached
            </li>
            <li>
              <span
                class="brogue-swatch"
                style={{ border: `1px solid ${WITNESS_COLOR}` }}
              />Rejection witness
            </li>
            <li>
              <span aria-hidden="true">&lt; &gt; Ω @</span>Stairs / player
              (above overlays)
            </li>
          </ul>
        </section>
      </div>
      <footer class="brogue-footer">
        Unofficial visualization of{" "}
        <a href="https://github.com/tmewett/BrogueCE">
          Brogue: Community Edition
        </a>{" "}
        v1.15.1.{" "}
        Brogue by Brian Walker; Community Edition maintained by the Brogue CE
        contributors.{" "}
        <a href="https://github.com/scarf005/roguelike-algorithms">
          Source and build instructions
        </a>{" "}
        · AGPL-3.0.
      </footer>
    </main>
  )
}

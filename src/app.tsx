import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js"
import {
  type AlgoKind,
  ALGOS,
  findAlgo,
  GENERATORS,
} from "./algorithms/registry.ts"
import { randomSeed } from "./algorithms/rng.ts"
import {
  type Config,
  formatConfig,
  parseConfig,
  RADIUS,
  sizeLabel,
  SIZES,
} from "./config.ts"
import { createSim, type Sim, type SimState, SPEEDS } from "./sim.ts"

const GROUPS: readonly [AlgoKind, string][] = [
  ["generate", "Map generation"],
  ["fov", "Field of view"],
  ["path", "Pathfinding"],
]

const HINTS: Record<AlgoKind, string> = {
  generate: "",
  fov: "Click or drag on the map to move the viewer.",
  path:
    "Click or drag to set the start. Shift-click, right-click or the Goal toggle sets the goal.",
}

const speedLabel = (i: number) =>
  SPEEDS[i] === Infinity ? "instant" : `${SPEEDS[i]} per frame`

export const App = () => {
  const [config, setConfig] = createSignal(parseConfig(location.hash))
  const [state, setState] = createSignal<SimState>({
    playing: false,
    done: false,
    steps: 0,
    phase: "",
  })
  const [speed, setSpeed] = createSignal(5)
  const [target, setTarget] = createSignal<"start" | "goal">("start")
  const algo = createMemo(() => findAlgo(config().alg)!)
  const update = (patch: Partial<Config>) =>
    setConfig({ ...config(), ...patch })
  let canvas!: HTMLCanvasElement
  let wrap!: HTMLDivElement
  let sim!: Sim

  /** Integer scale keeps pixelated cells even; fall back to fluid width. */
  const fit = () => {
    const { width, height } = config().size
    const scale = Math.floor(wrap.clientWidth / width)
    canvas.style.width = scale >= 1 ? `${width * scale}px` : "100%"
    canvas.style.height = scale >= 1 ? `${height * scale}px` : "auto"
  }

  onMount(() => {
    sim = createSim(canvas, setState)
    sim.setSpeed(SPEEDS[speed()])
    const onHash = () => setConfig(parseConfig(location.hash))
    const observer = new ResizeObserver(fit)
    observer.observe(wrap)
    addEventListener("hashchange", onHash)
    createEffect(() => {
      const c = config()
      sim.configure(c)
      fit()
      history.replaceState(null, "", formatConfig(c))
    })
    createEffect(() => sim.setSpeed(SPEEDS[speed()]))
    onCleanup(() => {
      observer.disconnect()
      removeEventListener("hashchange", onHash)
      sim.dispose()
    })
  })

  const interactive = () => algo().kind !== "generate"

  const pointer = (e: PointerEvent, which: "start" | "goal") => {
    if (!interactive()) return
    const i = sim.cellAt(e.clientX, e.clientY)
    if (i >= 0) sim.place(which, i)
  }
  let dragging: "start" | "goal" | undefined
  const onDown = (e: PointerEvent) => {
    if (!interactive()) return
    dragging = e.button === 2 || e.shiftKey ? "goal" : target()
    canvas.setPointerCapture(e.pointerId)
    pointer(e, dragging)
  }
  const onMove = (e: PointerEvent) => dragging && pointer(e, dragging)

  return (
    <main>
      <h1>Roguelike Algorithms</h1>
      <section class="controls">
        <label>
          Algorithm
          <select
            value={config().alg}
            onChange={(e) => update({ alg: e.currentTarget.value })}
          >
            <For each={GROUPS}>
              {([kind, label]) => (
                <optgroup label={label}>
                  <For each={ALGOS.filter((a) => a.kind === kind)}>
                    {(a) => (
                      <option value={a.id} selected={a.id === config().alg}>
                        {a.name}
                      </option>
                    )}
                  </For>
                </optgroup>
              )}
            </For>
          </select>
        </label>
        <label>
          Seed
          <input
            value={config().seed}
            spellcheck={false}
            onChange={(e) => {
              const seed = e.currentTarget.value.trim()
              if (seed) update({ seed })
              else e.currentTarget.value = config().seed
            }}
          />
        </label>
        <button type="button" onClick={() => update({ seed: randomSeed() })}>
          Random seed
        </button>
        <label>
          Size
          <select
            value={sizeLabel(config().size)}
            onChange={(e) =>
              update({
                size: SIZES.find((s) => sizeLabel(s) === e.currentTarget.value),
              })}
          >
            <For each={SIZES}>
              {(s) => (
                <option
                  value={sizeLabel(s)}
                  selected={s === config().size}
                >
                  {sizeLabel(s)}
                </option>
              )}
            </For>
          </select>
        </label>
        <Show when={interactive()}>
          <label>
            Map
            <select
              value={config().map}
              onChange={(e) => update({ map: e.currentTarget.value })}
            >
              <For each={GENERATORS}>
                {(g) => (
                  <option value={g.id} selected={g.id === config().map}>
                    {g.name}
                  </option>
                )}
              </For>
            </select>
          </label>
        </Show>
        <Show when={algo().kind === "fov"}>
          <label>
            Radius {config().radius}
            <input
              type="range"
              min={RADIUS.min}
              max={RADIUS.max}
              value={config().radius}
              onInput={(e) => update({ radius: Number(e.currentTarget.value) })}
            />
          </label>
        </Show>
        <Show when={algo().kind === "path"}>
          <fieldset class="toggle">
            <legend>Click sets</legend>
            <For each={["start", "goal"] as const}>
              {(t) => (
                <label>
                  <input
                    type="radio"
                    name="target"
                    checked={target() === t}
                    onChange={() => setTarget(t)}
                  />
                  {t}
                </label>
              )}
            </For>
          </fieldset>
        </Show>
        <label>
          Speed: {speedLabel(speed())}
          <input
            type="range"
            min={0}
            max={SPEEDS.length - 1}
            value={speed()}
            onInput={(e) => setSpeed(Number(e.currentTarget.value))}
          />
        </label>
        <div class="buttons">
          <button
            type="button"
            onClick={() => state().playing ? sim.pause() : sim.play()}
          >
            {state().playing ? "Pause" : state().done ? "Replay" : "Play"}
          </button>
          <button type="button" onClick={() => sim.step()}>Step</button>
          <button type="button" onClick={() => sim.reset()}>Reset</button>
        </div>
      </section>
      <div class="stage" ref={wrap}>
        <canvas
          ref={canvas}
          classList={{ interactive: interactive() }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => dragging = undefined}
          onPointerCancel={() => dragging = undefined}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
      <p class="status">
        {[
          state().phase,
          `${state().steps} steps`,
          state().done && "done",
        ].filter(Boolean).join(" · ")}
      </p>
      <section class="about">
        <h2>{algo().name}</h2>
        <p>{algo().description}</p>
        <Show when={HINTS[algo().kind]}>
          <p class="hint">{HINTS[algo().kind]}</p>
        </Show>
      </section>
    </main>
  )
}

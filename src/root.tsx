import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { App } from "./app.tsx"
import { BrogueView } from "./brogue/view.tsx"
import { DEFAULT_CONFIG, formatConfig } from "./config.ts"
import { algorithmRoute } from "./route.ts"
import "./brogue/styles.css"

export const Root = () => {
  const [algorithms, setAlgorithms] = createSignal(
    algorithmRoute(location.hash),
  )
  let algorithmHash = formatConfig(DEFAULT_CONFIG)
  let brogueHash = "#view=brogue&seed=1&depth=1"
  const onHash = () => setAlgorithms(algorithmRoute(location.hash))
  addEventListener("hashchange", onHash)
  createEffect(() => {
    document.body.classList.toggle("brogue-page", !algorithms())
    document.title = algorithms()
      ? "Roguelike Algorithms"
      : "Brogue CE level generation, visualized (unofficial)"
  })
  onCleanup(() => removeEventListener("hashchange", onHash))
  const changeView = (toAlgorithms: boolean) => {
    if (algorithms()) algorithmHash = location.hash
    else brogueHash = location.hash
    location.hash = toAlgorithms ? algorithmHash : brogueHash
  }
  return (
    <>
      <nav class="view-navigation" aria-label="Visualizer">
        <button
          type="button"
          aria-current={!algorithms() ? "page" : undefined}
          onClick={() => changeView(false)}
        >
          Brogue CE
        </button>
        <button
          type="button"
          aria-current={algorithms() ? "page" : undefined}
          onClick={() => changeView(true)}
        >
          Classic algorithms
        </button>
      </nav>
      <Show when={algorithms()} fallback={<BrogueView />}>
        <App />
      </Show>
    </>
  )
}

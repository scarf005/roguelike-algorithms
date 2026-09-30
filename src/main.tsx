import { render } from "solid-js/web"
import { Root } from "./root.tsx"
import "./styles.css"

render(() => <Root />, document.getElementById("app") as HTMLElement)

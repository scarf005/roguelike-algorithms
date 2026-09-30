import type { Board, Step } from "./board.ts"
import { shadowcast } from "./fov.ts"
import {
  bspDungeon,
  cellularCaves,
  drunkardsWalk,
  randomRooms,
  recursiveBacktracker,
} from "./generators.ts"
import { astar, bfs, dijkstra } from "./pathfinding.ts"
import type { Rng } from "./rng.ts"

export type AlgoKind = "generate" | "fov" | "path"

export type AlgoContext = { board: Board; rng: Rng; radius: number }

export type Algo = {
  id: string
  name: string
  kind: AlgoKind
  description: string
  run: (ctx: AlgoContext) => Generator<Step, unknown>
}

export const ALGOS: readonly Algo[] = [
  {
    id: "bsp",
    name: "BSP dungeon",
    kind: "generate",
    description:
      "Recursively splits the map into two halves until the pieces are small, puts one room inside every leaf, then walks back up the tree and joins the two halves of each split with an L-shaped corridor. Rooms never overlap and every room ends up reachable.",
    run: ({ board, rng }) => bspDungeon(board.grid, rng),
  },
  {
    id: "caves",
    name: "Cellular automata caves",
    kind: "generate",
    description:
      "Fills the map with random noise, then repeatedly turns a cell into wall when at least five of the nine cells around it (itself included) are walls. A flood fill finally keeps only the largest connected cave and turns every other pocket back into rock.",
    run: ({ board, rng }) => cellularCaves(board.grid, rng),
  },
  {
    id: "drunkard",
    name: "Drunkard's walk",
    kind: "generate",
    description:
      "A single walker starts in the middle and staggers one random step at a time, carving floor wherever it goes, until about 40% of the map is open. The result is one organic, always connected cavern.",
    run: ({ board, rng }) => drunkardsWalk(board.grid, rng),
  },
  {
    id: "rooms",
    name: "Random rooms and corridors",
    kind: "generate",
    description:
      "Repeatedly tries to drop a room of random size at a random place and discards it when it would touch an existing room. Each room is then joined to the previously placed one by an L-shaped corridor.",
    run: ({ board, rng }) => randomRooms(board.grid, rng),
  },
  {
    id: "maze",
    name: "Recursive backtracker maze",
    kind: "generate",
    description:
      "Depth-first search that carves a passage to a random unvisited neighbour cell and backtracks when it is boxed in. The glowing cells are the search stack. The result is a perfect maze: exactly one route between any two cells.",
    run: ({ board, rng }) => recursiveBacktracker(board.grid, rng),
  },
  {
    id: "fov",
    name: "Symmetric shadowcasting",
    kind: "fov",
    description:
      "Albert Ford's symmetric shadowcasting scans the map row by row in four quadrants, narrowing a range of slopes whenever a wall blocks part of it. A floor cell counts as seen only if its centre lies inside the slopes, which makes visibility symmetric: if A sees B then B sees A. Drag on the map to move the viewer.",
    run: ({ board, radius }) =>
      shadowcast(board.grid, { origin: board.start, radius }),
  },
  {
    id: "bfs",
    name: "Breadth-first search",
    kind: "path",
    description:
      "Expands outward from the start in rings of equal step count using a queue. It finds a shortest route when every step costs the same, but it explores in all directions regardless of where the goal is.",
    run: ({ board }) =>
      bfs(board.grid, { start: board.start, goal: board.goal }),
  },
  {
    id: "dijkstra",
    name: "Dijkstra map",
    kind: "path",
    description:
      "Like breadth-first search but ordered by accumulated cost with a priority queue, so terrain can have different costs. It floods the whole map, and the colour gradient shows each cell's distance from the start. Roguelikes reuse such a map to let many monsters chase one target.",
    run: ({ board }) =>
      dijkstra(board.grid, { start: board.start, goal: board.goal }),
  },
  {
    id: "astar",
    name: "A*",
    kind: "path",
    description:
      "Best-first search that expands the cell with the lowest cost so far plus a heuristic estimate of the distance left to the goal. With a heuristic that never overestimates it still finds a shortest path while exploring far fewer cells than breadth-first search.",
    run: ({ board }) =>
      astar(board.grid, { start: board.start, goal: board.goal }),
  },
]

export const findAlgo = (id: string) => ALGOS.find((a) => a.id === id)

export const GENERATORS = ALGOS.filter((a) => a.kind === "generate")

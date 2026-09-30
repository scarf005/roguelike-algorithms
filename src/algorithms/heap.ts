/** Binary min-heap of (key, value) pairs; duplicates allowed (lazy deletion). */
export const createHeap = () => {
  const keys: number[] = []
  const vals: number[] = []
  const swap = (a: number, b: number) => {
    ;[keys[a], keys[b]] = [keys[b], keys[a]]
    ;[vals[a], vals[b]] = [vals[b], vals[a]]
  }
  return {
    get size() {
      return keys.length
    },
    push: (key: number, val: number) => {
      let i = keys.push(key) - 1
      vals.push(val)
      while (i > 0) {
        const p = (i - 1) >> 1
        if (keys[p] <= keys[i]) break
        swap(p, i)
        i = p
      }
    },
    /** Removes and returns the value with the smallest key. */
    pop: () => {
      const top = vals[0]
      const lastKey = keys.pop()!
      const lastVal = vals.pop()!
      if (keys.length) {
        keys[0] = lastKey
        vals[0] = lastVal
        let i = 0
        for (;;) {
          const l = 2 * i + 1
          const r = l + 1
          let m = i
          if (l < keys.length && keys[l] < keys[m]) m = l
          if (r < keys.length && keys[r] < keys[m]) m = r
          if (m === i) break
          swap(m, i)
          i = m
        }
      }
      return top
    },
  }
}

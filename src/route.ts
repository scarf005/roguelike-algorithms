export const algorithmRoute = (hash: string) => {
  const params = new URLSearchParams(hash.replace(/^#/, ""))
  return params.get("view") === "algorithms" ||
    (params.get("view") !== "brogue" &&
      ["alg", "map", "size", "radius"].some((key) => params.has(key)))
}

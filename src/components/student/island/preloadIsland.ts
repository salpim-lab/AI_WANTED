let preparation: Promise<void> | null = null;

/** Download code and load the cached background geometries without mounting a canvas. */
export function preloadIsland() {
  if (!preparation) {
    preparation = Promise.all([
      import("./IslandScene"),
      import("./islandAssets").then(module => module.loadIslandPropLibrary()),
    ]).then(() => undefined).catch(error => { preparation = null; throw error; });
  }
  return preparation;
}

import type { AssembledItemSpec } from "@/lib/items/assembledItem";
import { createLabItem } from "@/lib/items/assembledItem";
import { createGiftModel } from "./islandModel";
import type { GiftKind, IslandGift } from "./types";

/** Chooses the database asset format without changing legacy preset gifts. */
export function createAssetModel(asset: Pick<IslandGift, "kind" | "assetFormat" | "geometrySpec">) {
  if (asset.assetFormat === "procedural" && asset.geometrySpec) {
    try {
      return createLabItem(asset.geometrySpec as AssembledItemSpec);
    } catch {
      // A malformed or stale asset must not prevent the island from rendering.
    }
  }
  return createGiftModel(asset.kind as GiftKind);
}

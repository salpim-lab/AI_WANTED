import type { AssembledItemSpec } from "@/lib/items/assembledItem";
import { createLabItem, ITEM_SIZE_SCALE } from "@/lib/items/assembledItem";
import { createGiftModel } from "./islandModel";
import type { GiftKind, IslandGift } from "./types";

/** Island size multiplier of an asset; preset gifts and unsized specs are medium. */
export function assetSizeScale(asset: Pick<IslandGift, "assetFormat" | "geometrySpec">) {
  const sizeClass = asset.assetFormat === "procedural" ? (asset.geometrySpec as { sizeClass?: unknown } | undefined)?.sizeClass : undefined;
  return typeof sizeClass === "string" && sizeClass in ITEM_SIZE_SCALE ? ITEM_SIZE_SCALE[sizeClass as keyof typeof ITEM_SIZE_SCALE] : 1;
}

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

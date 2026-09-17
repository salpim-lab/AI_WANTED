import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AssembledItemSpec } from "./assembledItem";
import { FALLBACK_ITEM_SPEC } from "./fallbackItem";
import { ITEM_CATALOG, type CatalogItem } from "./itemCatalog";

export const STYLE_VERSION = "procedural-v2";
export const FALLBACK_KEY = `fallback:gift-box:${STYLE_VERSION}`;
export const catalogAssetKey = (item: CatalogItem) => `item:catalog:${item.id}:${STYLE_VERSION}`;

// Specs owned by code. Their asset_catalog rows are shared by every student who
// received them, so the rows must always equal the code, never a stale copy.
const PRESET_SPECS = new Map<string, AssembledItemSpec>([
  [FALLBACK_KEY, FALLBACK_ITEM_SPEC],
  ...ITEM_CATALOG.map(item => [catalogAssetKey(item), item.spec] as const),
]);

// jsonb does not keep key order, so compare with sorted keys.
const stable = (value: unknown) => JSON.stringify(value, (_, v) =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v);

async function syncPresetAssets() {
  // database.types.ts is regenerated after the procedural-asset migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.from("asset_catalog")
    .select("id, dedup_key, name, geometry_spec")
    .eq("style_version", STYLE_VERSION)
    .in("dedup_key", [...PRESET_SPECS.keys()]);
  if (error) throw error;
  for (const row of (data ?? []) as { id: string; dedup_key: string; name: string; geometry_spec: unknown }[]) {
    const spec = PRESET_SPECS.get(row.dedup_key)!;
    if (row.name === spec.name && stable(row.geometry_spec) === stable(spec)) continue;
    const { error: updateError } = await db.from("asset_catalog")
      .update({ name: spec.name, geometry_spec: spec, asset_format: "procedural", source: "preset" })
      .eq("id", row.id);
    if (updateError) throw updateError;
  }
}

let synced: Promise<void> | null = null;

/** Brings stored preset assets up to date with the code, once per server process. */
export function ensurePresetAssetsSynced() {
  synced ??= syncPresetAssets().catch(error => { synced = null; throw error; });
  return synced;
}

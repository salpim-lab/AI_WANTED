// 담당: 이지현 (제안) — 3D 섬의 공용 데모 배치 + 방문자 개인 배치(서버 전용).
//
// 모델(1094 마이그레이션): 공용 섬(is_public_demo, 모든 방문자에게 동일·수정 불가) + 방문자 개인 섬(demo_owner_id = auth.uid()).
// 부모(checkin_sessions·conversation_messages·item_generation_jobs)는 응답에 싣지 않는다 — 아이템 이름·형식·모양·좌표만 내려준다.
// 방문자 화면의 섬 = 공용 배치 ∪ 내 배치. 체크인 세션이 아니라 uid로 조회하므로 여러 체크인에서 만든 아이템이 누적된다.
//
// 이 파일은 service_role(admin)로 읽는다 → RLS가 안 막는다(docs §-1). 그래서 소유권 검사는 여기서 한다:
//   - 읽기: 공용 섬 + demo_owner_id = viewerId 인 섬만 조회하고, 행마다 아이템 소유자를 한 번 더 확인한다.
//   - 쓰기: 아이템이 "내 것"인지 확인 → 좌표 검증(공용+내 배치와 겹침) → RPC(place_demo_item)가 DB 안에서 소유자를 다시 검증하고
//           개인 섬 생성 + 배치 저장을 한 트랜잭션으로 처리한다(동시 요청은 섬 행 잠금으로 직렬화되고 겹침을 다시 검사한다).
import "server-only";

import { getPlacementRules, type PlacedGift } from "@/components/student/island/placementRules";
import type { IslandGift } from "@/components/student/island/types";
import { createAdminClient } from "@/lib/supabase/admin";

// MVP: 방문자 전원이 시드 학생(민준) 한 명을 공유한다(/api/ai/item-generation의 MINJUN_ENROLLMENT_ID와 같은 값).
export const DEMO_ENROLLMENT_ID = "40000000-0000-4000-8000-000000000001";

// database.types.ts는 1094 적용 후 재생성한다(새 컬럼·RPC가 아직 타입에 없다).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any;

export class IslandError extends Error {
  constructor(readonly code: string, readonly httpStatus: number, message: string) {
    super(message);
  }
}

/** 화면에 내려주는 배치. id는 student_item_id. locked는 공용 배치(이동·삭제 불가). */
export type IslandGiftDto = IslandGift & { locked: boolean };

type IslandRow = { id: string; demo_owner_id: string | null; is_public_demo: boolean };
type PlacementRow = { island_id: string; student_item_id: string; position_x: number; position_z: number; current_asset_id: string | null };
type ItemRow = { id: string; asset_id: string; demo_owner_id: string | null; is_public_demo: boolean; earned_at: string };
type AssetRow = { id: string; name: string; asset_format: "procedural"; geometry_spec: unknown };

const unique = <T,>(values: T[]) => [...new Set(values)];

/** 공용 배치 + (viewerId가 있으면) 그 방문자의 배치. viewerId는 getDemoScope()가 UUID로 검증한 값이다. */
export async function loadIslandGifts(viewerId: string | null): Promise<IslandGiftDto[]> {
  const client = db();
  let islandQuery = client.from("islands").select("id, demo_owner_id, is_public_demo").eq("enrollment_id", DEMO_ENROLLMENT_ID);
  islandQuery = viewerId ? islandQuery.or(`is_public_demo.eq.true,demo_owner_id.eq.${viewerId}`) : islandQuery.eq("is_public_demo", true);
  const { data: islands, error: islandError } = await islandQuery as { data: IslandRow[] | null; error: Error | null };
  if (islandError) throw new IslandError("DATABASE_ERROR", 500, "섬을 조회하지 못했습니다.");
  if (!islands?.length) return [];
  const islandById = new Map(islands.map((island) => [island.id, island]));

  const { data: placements, error: placementError } = await client.from("island_placements")
    .select("island_id, student_item_id, position_x, position_z, current_asset_id")
    .in("island_id", islands.map((island) => island.id)) as { data: PlacementRow[] | null; error: Error | null };
  if (placementError) throw new IslandError("DATABASE_ERROR", 500, "배치를 조회하지 못했습니다.");
  if (!placements?.length) return [];

  const { data: items, error: itemError } = await client.from("student_items")
    .select("id, asset_id, demo_owner_id, is_public_demo, earned_at")
    .in("id", placements.map((placement) => placement.student_item_id)) as { data: ItemRow[] | null; error: Error | null };
  if (itemError) throw new IslandError("DATABASE_ERROR", 500, "아이템을 조회하지 못했습니다.");
  const itemById = new Map((items ?? []).map((item) => [item.id, item]));

  // 행마다 한 번 더 확인(방어): 공용 섬에는 공용 아이템만, 개인 섬에는 그 방문자 아이템만.
  const visible = placements.flatMap((placement) => {
    const island = islandById.get(placement.island_id);
    const item = itemById.get(placement.student_item_id);
    if (!island || !item) return [];
    const okPublic = island.is_public_demo && item.is_public_demo;
    const okOwn = !island.is_public_demo && viewerId !== null && island.demo_owner_id === viewerId && !item.is_public_demo && item.demo_owner_id === viewerId;
    return okPublic || okOwn ? [{ placement, item, locked: island.is_public_demo }] : [];
  });
  if (!visible.length) return [];

  const assetIds = unique(visible.map(({ placement, item }) => placement.current_asset_id ?? item.asset_id));
  const { data: assets, error: assetError } = await client.from("asset_catalog")
    .select("id, name, asset_format, geometry_spec").in("id", assetIds).eq("status", "ready") as { data: AssetRow[] | null; error: Error | null };
  if (assetError) throw new IslandError("DATABASE_ERROR", 500, "아이템 모양을 조회하지 못했습니다.");
  const assetById = new Map((assets ?? []).map((asset) => [asset.id, asset]));

  return visible
    .sort((a, b) => Number(b.locked) - Number(a.locked) || a.item.earned_at.localeCompare(b.item.earned_at))
    .flatMap(({ placement, item, locked }) => {
      const asset = assetById.get(placement.current_asset_id ?? item.asset_id);
      if (!asset) return [];
      return [{ id: item.id, kind: "star" as const, name: asset.name, x: placement.position_x, z: placement.position_z, assetFormat: asset.asset_format, geometrySpec: asset.geometry_spec, locked }];
    });
}

async function requireOwnItem(viewerId: string, itemId: string) {
  const { data: item, error } = await db().from("student_items").select("id, asset_id, demo_owner_id, is_public_demo")
    .eq("id", itemId).maybeSingle() as { data: Pick<ItemRow, "id" | "asset_id" | "demo_owner_id" | "is_public_demo"> | null; error: Error | null };
  if (error) throw new IslandError("DATABASE_ERROR", 500, "아이템을 조회하지 못했습니다.");
  if (item?.is_public_demo) throw new IslandError("PUBLIC_ITEM_IMMUTABLE", 403, "공용 아이템은 옮기거나 지울 수 없어요.");
  // 없는 아이템과 남의 아이템을 구분하지 않는다(존재 여부를 알려주지 않는다).
  if (!item || item.demo_owner_id !== viewerId) throw new IslandError("ITEM_NOT_FOUND", 404, "아이템을 찾을 수 없어요.");
  return item;
}

function mapRpcError(error: { message?: string; code?: string }): IslandError {
  const message = error.message ?? "";
  if (message.includes("PLACEMENT_OVERLAP")) return new IslandError("PLACEMENT_BLOCKED", 409, "그 자리에는 놓을 수 없어요.");
  if (message.includes("PUBLIC_ITEM_IMMUTABLE")) return new IslandError("PUBLIC_ITEM_IMMUTABLE", 403, "공용 아이템은 옮기거나 지울 수 없어요.");
  if (/ITEM_NOT_OWNED|ITEM_NOT_FOUND|ITEM_.*MISMATCH|PLACEMENT_ISLAND_MISMATCH/.test(message)) return new IslandError("ITEM_NOT_FOUND", 404, "아이템을 찾을 수 없어요.");
  if (message.includes("INVALID_PLACEMENT_ARGUMENT")) return new IslandError("INVALID_REQUEST", 400, "좌표가 올바르지 않아요.");
  console.error("[island] RPC 실패", message);
  return new IslandError("DATABASE_ERROR", 500, "배치를 저장하지 못했어요.");
}

/** 내 아이템을 x,z에 놓는다(이미 놓았다면 이동). 좌표는 서버가 씬과 같은 규칙으로 검증한다. */
export async function placeItem(viewerId: string, itemId: string, x: number, z: number) {
  const item = await requireOwnItem(viewerId, itemId);
  const client = db();
  // 화면에 쓸 자산: 재시도로 교체된 생성 자산이 있으면 그것(RPC가 저장하는 current_asset_id와 같은 규칙)
  const { data: job } = await client.from("item_generation_jobs").select("generated_asset_id").eq("student_item_id", itemId).maybeSingle();
  const assetId = (job?.generated_asset_id as string | null | undefined) ?? item.asset_id;
  const { data: asset, error: assetError } = await client.from("asset_catalog").select("asset_format, geometry_spec").eq("id", assetId).maybeSingle() as { data: Pick<AssetRow, "asset_format" | "geometry_spec"> | null; error: Error | null };
  if (assetError || !asset) throw new IslandError("DATABASE_ERROR", 500, "아이템 모양을 조회하지 못했습니다.");
  const placing = { assetFormat: asset.asset_format, geometrySpec: asset.geometry_spec };

  // 공용 배치 ∪ 내 배치(자기 자신은 이동일 수 있으므로 제외)와의 좌표 충돌·지형 검증
  const others: PlacedGift[] = (await loadIslandGifts(viewerId)).filter((gift) => gift.id !== itemId);
  const rules = getPlacementRules();
  if (!rules.canPlace(x, z, placing, others, itemId)) throw new IslandError("PLACEMENT_BLOCKED", 409, "그 자리에는 놓을 수 없어요.");

  const { data, error } = await client.rpc("place_demo_item", { p_owner_id: viewerId, p_item_id: itemId, p_x: x, p_z: z, p_radius: rules.radiusOf(placing) });
  if (error) throw mapRpcError(error);
  return { placementId: data as string };
}

/** 내 배치를 지운다(아이템은 남는다). 공용·타인 아이템은 거부. */
export async function removePlacement(viewerId: string, itemId: string) {
  await requireOwnItem(viewerId, itemId);
  const { data, error } = await db().rpc("remove_demo_placement", { p_owner_id: viewerId, p_item_id: itemId });
  if (error) throw mapRpcError(error);
  return { removed: data === true };
}

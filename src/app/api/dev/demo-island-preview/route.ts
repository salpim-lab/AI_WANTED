// 개발 전용. 공용 데모 섬 좌표(scripts/demo-island-seed/coords.json)를 실제 자산 모양과 합쳐 미리 보기용 배치로 돌려준다.
// DB에서는 asset_catalog만 읽는다(쓰기 없음). 프로덕션에서는 404(DEMO_ISLAND_PREVIEW=1 이 아니면). /api/dev/* 를 지울 때 함께 지울 것.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type CoordsFile = { placements: { dedupKey: string; name: string; x: number; z: number; radius: number }[] };

export async function GET() {
  // 프로덕션 빌드는 기본 404. 로컬에서 프로덕션 빌드로 미리 볼 때만 DEMO_ISLAND_PREVIEW=1 로 연다(Vercel에는 설정하지 않는다).
  if (process.env.NODE_ENV === "production" && process.env.DEMO_ISLAND_PREVIEW !== "1") return new NextResponse("Not Found", { status: 404 });
  const coords = JSON.parse(await readFile(path.join(process.cwd(), "scripts/demo-island-seed/coords.json"), "utf8")) as CoordsFile;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { data: assets, error } = await client.from("asset_catalog").select("dedup_key, name, asset_format, geometry_spec").in("dedup_key", coords.placements.map((placement) => placement.dedupKey)).eq("status", "ready");
  if (error) return NextResponse.json({ error: "자산을 읽지 못했습니다." }, { status: 500 });
  const byKey = new Map((assets ?? []).map((asset: { dedup_key: string }) => [asset.dedup_key, asset]));
  const missing = coords.placements.filter((placement) => !byKey.has(placement.dedupKey)).map((placement) => placement.dedupKey);
  const gifts = coords.placements.flatMap((placement) => {
    const asset = byKey.get(placement.dedupKey) as { name: string; asset_format: "procedural"; geometry_spec: unknown } | undefined;
    return asset ? [{ id: `preview-${placement.dedupKey}`, kind: "star" as const, name: asset.name, x: placement.x, z: placement.z, assetFormat: asset.asset_format, geometrySpec: asset.geometry_spec, locked: true }] : [];
  });
  return NextResponse.json({ gifts, missing });
}

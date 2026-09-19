// 개발 전용. /item-lab/minjun-island에서 정한 민준 섬 데모 배치를 JSON 파일로 저장한다.
// 프로덕션에서는 404. /api/dev/* 를 지울 때 함께 지울 것.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { MINJUN_DEMO_ITEMS } from "@/lib/items/minjunDemoIsland";

export const runtime = "nodejs";

const FILE = path.join(process.cwd(), "src/lib/items/minjunDemoPlacements.json");
const IDS: readonly string[] = MINJUN_DEMO_ITEMS.map(item => item.itemId);

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new NextResponse("Not Found", { status: 404 });
  const body: unknown = await request.json().catch(() => null);
  const ok = Array.isArray(body) && body.every(p => p && IDS.includes(p.itemId) && Number.isFinite(p.x) && Number.isFinite(p.z));
  if (!ok) return NextResponse.json({ error: "배치 형식이 잘못되었습니다." }, { status: 400 });
  const placements = (body as { itemId: string; x: number; z: number }[]).map(({ itemId, x, z }) => ({ itemId, x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000 }));
  await writeFile(FILE, JSON.stringify(placements, null, 2) + "\n");
  return NextResponse.json({ saved: placements.length });
}

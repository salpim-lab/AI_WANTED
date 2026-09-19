// 담당: 이지현 (제안) — 학생 섬의 배치 조회·저장·삭제.
// 방문자 화면의 섬 = 공용 데모 배치(수정 불가) + 이 방문자의 개인 배치. 소유자는 세션에서만 얻는다(요청 본문의 id는 믿지 않는다).
// 저장 경로: 좌표 검증(서버) → place_demo_item RPC(DB가 소유자 재검증 + 개인 섬 생성·배치 저장을 한 트랜잭션으로).
// DEMO_MODE가 아니면 아무것도 저장·노출하지 않는다(공용 섬은 데모 전용).
import { NextResponse } from "next/server";
import { CheckinAuthError, requireStudent, UUID } from "@/lib/checkins/authorize";
import { isDemoModeEnabled } from "@/lib/demo/scope";
import { IslandError, loadIslandGifts, placeItem, removePlacement } from "@/lib/island/demoIsland";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const fail = (code: string, message: string, status: number) => json({ code, message }, status);

function errorResponse(error: unknown) {
  if (error instanceof IslandError) return fail(error.code, error.message, error.httpStatus);
  if (error instanceof CheckinAuthError) return fail(error.code, error.message, error.httpStatus);
  console.error("[api/island] 처리 실패", error);
  return fail("ISLAND_REQUEST_FAILED", "섬을 처리하지 못했습니다.", 500);
}

/** 이 요청의 소유자(auth.uid). 세션이 없으면 null — GET은 공용 배치만 내려주고, 쓰기는 401. */
async function viewerIdOrNull() {
  try {
    return (await requireStudent()).demoOwnerId ?? null;
  } catch (error) {
    if (error instanceof CheckinAuthError && (error.httpStatus === 401 || error.httpStatus === 403)) return null;
    throw error;
  }
}

const COORD_LIMIT = 500;
async function readBody(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.student_item_id !== "string" || !UUID.test(body.student_item_id)) throw new IslandError("INVALID_REQUEST", 400, "student_item_id가 필요합니다.");
  return body as { student_item_id: string; x?: unknown; z?: unknown };
}

export async function GET() {
  if (!isDemoModeEnabled()) return json({ persisted: false, gifts: [] });
  try {
    return json({ persisted: true, gifts: await loadIslandGifts(await viewerIdOrNull()) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  if (!isDemoModeEnabled()) return json({ persisted: false });
  try {
    const body = await readBody(request);
    const { x, z } = body;
    if (typeof x !== "number" || typeof z !== "number" || !Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > COORD_LIMIT || Math.abs(z) > COORD_LIMIT) {
      throw new IslandError("INVALID_REQUEST", 400, "좌표가 올바르지 않아요.");
    }
    const viewerId = await viewerIdOrNull();
    if (!viewerId) throw new IslandError("UNAUTHORIZED", 401, "방문자 세션이 필요합니다.");
    await placeItem(viewerId, body.student_item_id, x, z);
    return json({ persisted: true });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  if (!isDemoModeEnabled()) return json({ persisted: false });
  try {
    const body = await readBody(request);
    const viewerId = await viewerIdOrNull();
    if (!viewerId) throw new IslandError("UNAUTHORIZED", 401, "방문자 세션이 필요합니다.");
    return json({ persisted: true, ...(await removePlacement(viewerId, body.student_item_id)) });
  } catch (error) { return errorResponse(error); }
}

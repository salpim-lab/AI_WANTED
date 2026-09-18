// 개발 전용: 로그인·DB 없이 상담 전문 → 추론 → 카탈로그 매칭/AI 조립까지 실행해 3D 설계서를 돌려준다.
// 저장·지급은 하지 않는다. 운영 빌드에서는 404.
import { NextResponse } from "next/server";
import { parseTranscript } from "@/lib/supabase/raw/wholeTranscript";
import { inferItem } from "@/lib/openai/inferItem";
import { assembleItem } from "@/lib/openai/assembleItem";
import { ItemAIError } from "@/lib/openai/client";
import { findCatalogItem } from "@/lib/items/itemCatalog";
import { parseLabItem } from "@/lib/items/assembledItem";
export const runtime = "nodejs";
export const maxDuration = 180;
const fail = (code: string, message: string, status: number, extra = {}) => NextResponse.json({ code, message, ...extra }, { status });
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  let messages;
  try { messages = parseTranscript((await request.json()).transcript); }
  catch (e) { return fail("INVALID_REQUEST", e instanceof Error ? e.message : "상담 형식을 확인해 주세요.", 400); }
  let inference;
  try { inference = await inferItem(messages); }
  catch (e) { return e instanceof ItemAIError ? fail(e.code, e.message, e.httpStatus, { detail: e.detail }) : fail("ITEM_INFERENCE_FAILED", String(e), 500); }
  const catalogItem = findCatalogItem(inference.subject);
  if (catalogItem) return NextResponse.json({ inference, source: `catalog: ${catalogItem.displayName}`, spec: catalogItem.spec });
  try {
    const spec = parseLabItem(await assembleItem(inference));
    if ("shape" in spec) throw new Error("ASSEMBLY_NOT_COMPOSITE");
    return NextResponse.json({ inference, source: "AI 조립", spec: { ...spec, sizeClass: inference.sizeClass } });
  } catch (e) {
    // Inference still succeeded, so return it alongside the assembly failure.
    const code = e instanceof ItemAIError ? e.code : e instanceof Error ? e.message : "ASSEMBLY_FAILED";
    return NextResponse.json({ inference, source: `조립 실패: ${code}`, spec: null, detail: e instanceof ItemAIError ? e.detail : undefined });
  }
}

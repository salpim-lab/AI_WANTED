// OpenAI Responses API 호출. 반드시 서버(app/api/**/route.ts, 워커)에서만 import할 것 —
// API 키가 클라이언트 번들에 노출되면 안 되므로 "use client" 파일에서 직접 호출 금지.
import "server-only";

import { EVIDENCE_MISMATCH } from "@/lib/items/itemInference";

export type ItemAIErrorDetail = { raw?: string; error?: string };
export class ItemAIError extends Error {
  constructor(public code: string, public httpStatus: number, message: string, public detail?: ItemAIErrorDetail) { super(message); }
}

type ResponsesBody = { status?: string; incomplete_details?: { reason?: string }; output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[] };
type Messages = { unavailable: string; failed: string; invalid: string };

/**
 * One structured Responses API call. Codes derive from the stage prefix:
 * {P}_UNAVAILABLE, {P}_REQUEST_FAILED, {P}_INCOMPLETE, {P}_REFUSAL, INVALID_{P}_OUTPUT.
 * Each failure keeps the raw model text or API error for the job log.
 */
export async function callModel<T>(prefix: "AI" | "ASSEMBLY", request: object, timeoutMs: number, messages: Messages, parse: (value: unknown) => T): Promise<T> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new ItemAIError("AI_NOT_CONFIGURED", 503, "OPENAI_API_KEY 설정이 필요합니다.");
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(request), signal: AbortSignal.timeout(timeoutMs), cache: "no-store",
    });
  } catch { throw new ItemAIError(`${prefix}_UNAVAILABLE`, 504, messages.unavailable); }
  if (!response.ok) {
    const error = (await response.text().catch(() => "")).slice(0, 2000);
    throw new ItemAIError(`${prefix}_REQUEST_FAILED`, response.status === 429 ? 429 : 502, messages.failed, { error: `HTTP ${response.status} ${error}` });
  }
  const codes = { incomplete: `${prefix}_INCOMPLETE`, refusal: `${prefix}_REFUSAL`, invalid: `INVALID_${prefix}_OUTPUT` };
  const message = messages.invalid;
  const data = await response.json().catch(() => null) as ResponsesBody | null;
  if (data?.status === "incomplete") throw new ItemAIError(codes.incomplete, 502, message, { error: data.incomplete_details?.reason ?? "incomplete" });
  const content = (data?.output ?? []).filter(o => o.type === "message").flatMap(o => o.content ?? []);
  const refusal = content.find(c => c.type === "refusal");
  if (refusal) throw new ItemAIError(codes.refusal, 502, message, { raw: refusal.refusal });
  const raw = content.filter(c => c.type === "output_text").map(c => c.text ?? "").join("");
  try {
    if (data?.status !== "completed") throw new Error(`status: ${data?.status ?? "unreadable body"}`);
    return parse(JSON.parse(raw));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    throw new ItemAIError(error === EVIDENCE_MISMATCH ? "EVIDENCE_MISMATCH" : codes.invalid, 502, message, { raw, error });
  }
}

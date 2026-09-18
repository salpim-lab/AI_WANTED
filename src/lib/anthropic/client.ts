import "server-only";
import { EVIDENCE_MISMATCH } from "@/lib/items/itemInference";
import { ItemAIError } from "../openai/client";

type MessagesBody = { stop_reason?: string; content?: { type: string; text?: string }[] };
type ErrorMessages = { unavailable: string; failed: string; invalid: string };

/** Claude structured output, preserving the item worker's existing error contract. */
export async function callClaude<T>(request: object, timeoutMs: number, messages: ErrorMessages, parse: (value: unknown) => T): Promise<T> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new ItemAIError("AI_NOT_CONFIGURED", 503, "ANTHROPIC_API_KEY 설정이 필요합니다.");
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify(request), signal: AbortSignal.timeout(timeoutMs), cache: "no-store",
    });
  } catch { throw new ItemAIError("AI_UNAVAILABLE", 504, messages.unavailable); }
  if (!response.ok) {
    const error = (await response.text().catch(() => "")).slice(0, 2000);
    throw new ItemAIError("AI_REQUEST_FAILED", response.status === 429 ? 429 : 502, messages.failed, { error: `HTTP ${response.status} ${error}` });
  }
  const data = await response.json().catch(() => null) as MessagesBody | null;
  const raw = (data?.content ?? []).filter(block => block.type === "text").map(block => block.text ?? "").join("");
  if (data?.stop_reason === "max_tokens") throw new ItemAIError("AI_INCOMPLETE", 502, messages.invalid, { raw, error: "max_tokens" });
  if (data?.stop_reason === "refusal") throw new ItemAIError("AI_REFUSAL", 502, messages.invalid, { raw });
  try {
    if (data?.stop_reason !== "end_turn") throw new Error(`stop_reason: ${data?.stop_reason ?? "unreadable body"}`);
    return parse(JSON.parse(raw));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    throw new ItemAIError(error === EVIDENCE_MISMATCH ? "EVIDENCE_MISMATCH" : "INVALID_AI_OUTPUT", 502, messages.invalid, { raw, error });
  }
}

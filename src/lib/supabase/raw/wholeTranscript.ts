import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";

export type TranscriptMessage = {
  speaker: "student" | "assistant" | "system";
  content: string;
  input_method: "voice" | "text" | "fixed";
};

export function parseTranscript(value: unknown): TranscriptMessage[] {
  if (!Array.isArray(value) || value.length > 2000) throw new Error("상담 전문은 최대 2000개의 메시지 배열이어야 합니다.");
  const messages = value.map((raw: unknown): TranscriptMessage => {
    if (!raw || typeof raw !== "object") throw new Error("대화 메시지 형식이 잘못되었습니다.");
    const m = raw as Record<string, unknown>;
    if (!['student', 'assistant', 'system'].includes(String(m.speaker)) || typeof m.content !== "string" || !m.content.trim() || !['voice', 'text', 'fixed'].includes(String(m.input_method))) throw new Error("화자·내용·입력 방식이 잘못되었습니다.");
    return { speaker: m.speaker as TranscriptMessage['speaker'], content: m.content, input_method: m.input_method as TranscriptMessage['input_method'] };
  });
  if (new TextEncoder().encode(JSON.stringify(messages)).length > 400000) throw new Error("상담 전문이 너무 큽니다.");
  return messages;
}

/** Call only after the server verifies session ownership, classroom and consent. */
export async function saveWholeTranscript(
  client: SupabaseClient<Database>,
  sessionId: string,
  transcript: unknown,
  end: { status: "completed" } | { status: "stopped"; reason: string },
) {
  const messages = parseTranscript(transcript);
  if (end.status === "stopped" && !end.reason.trim()) throw new Error("중단 이유가 필요합니다.");
  const { data, error } = await client.from("checkin_sessions").update({
    transcript: messages as Json,
    status: end.status,
    stop_reason: end.status === "stopped" ? end.reason : null,
    completed_at: new Date().toISOString(),
  }).eq("id", sessionId).eq("status", "started").is("transcript", null).select("id").maybeSingle();
  if (error) throw error;
  if (data) return data.id;
  // An identical retry is safe; a different second transcript is rejected.
  const { data: existing, error: readError } = await client.from("checkin_sessions").select("id, transcript, status, stop_reason").eq("id", sessionId).maybeSingle();
  if (readError) throw readError;
  if (existing && existing.status === end.status && existing.stop_reason === (end.status === "stopped" ? end.reason : null) && existing.transcript !== null && JSON.stringify(parseTranscript(existing.transcript)) === JSON.stringify(messages)) return existing.id;
  throw new Error("저장할 상담이 없거나 이미 다른 내용으로 종료되었습니다.");
}

/** Pass a user/RLS client, or an admin client only after authorization. */
export async function readWholeTranscript(client: SupabaseClient<Database>, sessionId: string) {
  const { data, error } = await client.from("checkin_sessions").select("id, status, transcript").eq("id", sessionId).single();
  if (error) throw error;
  if (data.status === "started" || data.transcript === null) throw new Error("상담 전문 저장이 아직 완료되지 않았습니다.");
  return { sessionId: data.id, messages: parseTranscript(data.transcript) };
}

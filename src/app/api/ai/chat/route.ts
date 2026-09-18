// 담당: 이유민
// 역할: 아이 발화 하나를 받아 다음에 할 일을 정한다.
//
// 종료 판단은 LLM 이 하지 않는다(기획안 §8.6). LLM 은 두 가지만 표시한다.
//   risk       위험 신호가 있는가
//   sufficient 충분히 이야기했는가
// 그 뒤 "무엇을 할지"는 gates.decideNext 가 코드로 정한다.
//
// 회피 판정도 코드가 한다(looksAvoidant). LLM 을 부를 필요가 없고,
// 규칙이 명시적이라 교사에게 설명할 수 있다.
import { NextResponse } from "next/server";

import { AI_DISABLED, isAiEnabled } from "@/lib/ai/enabled";
import { CheckinAuthError, requireOwnStartedSession } from "@/lib/checkins/authorize";
import { buildChatTurnRequest, ChatTurnError, parseChatTurn } from "@/lib/chat/chatTurn";
import { CLOSING_MESSAGES, decideNext, HANDOFF_MESSAGE, looksAvoidant } from "@/lib/chat/gates";
import { SIGNAL_COLORS } from "@/lib/constants/colors";
import type { TranscriptMessage } from "@/lib/supabase/raw/wholeTranscript";
import type { SignalColor } from "@/lib/types/signal";

export const runtime = "nodejs";
export const maxDuration = 60;

const TIMEOUT_MS = 20_000;
const fail = (code: string, message: string, status: number) =>
  NextResponse.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });

/** 화면이 보낸 대화 기록을 신뢰하지 않고 형식만 다시 확인한다. */
function parseMessages(value: unknown): TranscriptMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    throw new ChatTurnError("INVALID_REQUEST", 400, "transcript 형식이 올바르지 않습니다.");
  }
  return value.map((raw) => {
    const m = raw as Record<string, unknown>;
    const ok =
      ["student", "assistant", "system"].includes(String(m.speaker)) &&
      typeof m.content === "string" &&
      m.content.trim().length > 0 &&
      m.content.length <= 2000 &&
      ["voice", "text", "fixed"].includes(String(m.input_method));
    if (!ok) throw new ChatTurnError("INVALID_REQUEST", 400, "대화 메시지 형식이 잘못되었습니다.");
    return {
      speaker: m.speaker as TranscriptMessage["speaker"],
      content: m.content as string,
      input_method: m.input_method as TranscriptMessage["input_method"],
    };
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail("INVALID_REQUEST", "유효한 JSON을 보내주세요.", 400);
  }

  const flow = body.flow === "checkin" || body.flow === "checkout" ? body.flow : null;
  if (!flow) return fail("INVALID_REQUEST", "flow는 checkin 또는 checkout이어야 합니다.", 400);
  const color = String(body.color);
  if (!(color in SIGNAL_COLORS)) return fail("INVALID_REQUEST", "color가 올바르지 않습니다.", 400);

  // 스위치가 꺼져 있으면 키를 읽기도 전에 돌려보낸다.
  if (!isAiEnabled()) return fail(AI_DISABLED.code, AI_DISABLED.message, 503);

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return fail("AI_NOT_CONFIGURED", "OPENAI_API_KEY 설정이 필요합니다.", 503);

  try {
    await requireOwnStartedSession(body.session_id);
    const transcript = parseMessages(body.transcript);

    const studentTurns = transcript.filter((m) => m.speaker === "student");
    if (!studentTurns.length) {
      return fail("INVALID_REQUEST", "학생 발화가 없습니다.", 400);
    }
    // 턴 수와 회피 횟수는 화면이 보낸 값을 쓰지 않는다. 기록에서 다시 센다.
    const turnCount = studentTurns.length;
    const avoidanceCount = studentTurns.filter((m) => looksAvoidant(m.content)).length;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(
        buildChatTurnRequest({
          flow,
          color: color as SignalColor,
          transcript,
          turnCount,
          recentContext: typeof body.recent_context === "string" ? body.recent_context : undefined,
        }),
      ),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 500);
      console.error("[chat] upstream", response.status, detail);
      return fail("AI_REQUEST_FAILED", "지금은 대답하기 어려워.", response.status === 429 ? 429 : 502);
    }

    const data = (await response.json()) as {
      status?: string;
      output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
    };
    const content = (data.output ?? [])
      .filter((o) => o.type === "message")
      .flatMap((o) => o.content ?? []);
    // 거부도 위험 신호로 다룬다. 모델이 답하지 않기로 한 발화를 그냥 넘기지 않는다.
    if (content.some((c) => c.type === "refusal") || data.status !== "completed") {
      return NextResponse.json(
        { reply: HANDOFF_MESSAGE, action: "handoff_to_teacher", risk: "flag", turn_count: turnCount },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const raw = content
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "")
      .join("");
    const turn = parseChatTurn(JSON.parse(raw));

    const decision = decideNext({
      turnCount,
      avoidanceCount,
      risk: turn.risk,
      sufficient: turn.sufficient,
    });

    // 아이에게 보여줄 문장은 게이트가 정한다. LLM 문장은 후속 질문일 때만 쓴다.
    // 종료 인사는 여러 줄이라 배열로 내려보낸다.
    const lines =
      decision.action === "handoff_to_teacher"
        ? [HANDOFF_MESSAGE]
        : decision.action === "close"
          ? CLOSING_MESSAGES[decision.reason]
          : turn.reply
            ? [turn.reply]
            : [];

    return NextResponse.json(
      {
        reply: lines[0] ?? "",
        lines,
        action: decision.action,
        reason: decision.action === "close" ? decision.reason : null,
        risk: turn.risk,
        turn_count: turnCount,
        avoidance_count: avoidanceCount,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CheckinAuthError) return fail(error.code, error.message, error.httpStatus);
    if (error instanceof ChatTurnError) return fail(error.code, error.message, error.httpStatus);
    if (error instanceof Error && error.name === "TimeoutError") {
      return fail("AI_TIMEOUT", "대답이 늦어지고 있어. 다시 말해줄래?", 504);
    }
    return fail("AI_FAILED", "지금은 대답하기 어려워.", 500);
  }
}

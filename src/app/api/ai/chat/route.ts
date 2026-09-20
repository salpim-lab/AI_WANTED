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
//
// LLM 은 Claude(Anthropic Messages API)다 — 예전엔 OpenAI 였다(2026-09-20 변경).
// 음성 → 글(STT)은 그대로 OpenAI whisper 다(app/api/ai/transcribe).
import { NextResponse } from "next/server";

import { AI_DISABLED, isAiEnabled } from "@/lib/ai/enabled";
import { CheckinAuthError, requireOwnStartedSession } from "@/lib/checkins/authorize";
import { buildRecentContext } from "@/lib/checkins/recentContext";
import { studentGivenName } from "@/lib/checkins/studentName";
import {
  buildChatTurnRequest,
  buildRiskCheckRequest,
  ChatTurnError,
  parseChatTurn,
  parseRiskCheck,
  readClaudeText,
} from "@/lib/chat/chatTurn";
import { closingLines, decideNext, HANDOFF_MESSAGE, looksAvoidant } from "@/lib/chat/gates";
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

  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return fail("AI_NOT_CONFIGURED", "ANTHROPIC_API_KEY 설정이 필요합니다.", 503);

  try {
    const session = await requireOwnStartedSession(body.session_id);
    const transcript = parseMessages(body.transcript);

    const studentTurns = transcript.filter((m) => m.speaker === "student");
    if (!studentTurns.length) {
      return fail("INVALID_REQUEST", "학생 발화가 없습니다.", 400);
    }
    // 턴 수와 회피 횟수는 화면이 보낸 값을 쓰지 않는다. 기록에서 다시 센다.
    const turnCount = studentTurns.length;
    const avoidanceCount = studentTurns.filter((m) => looksAvoidant(m.content)).length;

    const call = (body: object) =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });

    // 두 호출을 동시에 보낸다.
    //   ① 후속 질문 — 최근 며칠 맥락을 본다
    //   ② 위험 판단 — 오늘 발화만 본다
    // 나눈 이유는 chatTurn.buildRiskCheckRequest 주석에 있다. 요약하면,
    // 며칠치를 합쳐 보면 평범한 친구 다툼이 괴롭힘으로 읽혀 flag 가 남발됐다.
    const [response, riskResponse] = await Promise.all([
      call(
        buildChatTurnRequest({
          flow,
          color: color as SignalColor,
          transcript,
          turnCount,
          // 서버에서 직접 읽는다. 클라이언트가 보낸 값은 쓰지 않는다 —
          // 지난 세션 내용을 브라우저가 정할 수 있으면 안 된다.
          recentContext: await buildRecentContext(session.enrollment_id, session.id),
          studentName: await studentGivenName(session.enrollment_id),
        }),
      ),
      call(buildRiskCheckRequest({ transcript })),
    ]);

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 500);
      console.error("[chat] upstream", response.status, detail);
      return fail("AI_REQUEST_FAILED", "지금은 대답하기 어려워.", response.status === 429 ? 429 : 502);
    }

    const answer = readClaudeText(await response.json());
    // 거부도 위험 신호로 다룬다. 모델이 답하지 않기로 한 발화를 그냥 넘기지 않는다.
    if (answer.refused) {
      return NextResponse.json(
        { reply: HANDOFF_MESSAGE, action: "handoff_to_teacher", risk: "flag", turn_count: turnCount },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    // 글자 수 상한에 걸려 JSON 이 잘렸다. 위험 신호가 아니므로 교사에게 넘기지 않고 오류로 돌려 다시 하게 한다.
    if (answer.truncated) {
      console.error("[chat] 응답이 max_tokens 에서 잘렸습니다");
      return fail("AI_INCOMPLETE", "지금은 대답하기 어려워.", 502);
    }
    const raw = answer.text;
    // 바로 앞 살핌의 말 — 같은 어미("~구나")가 잇달아 오지 않게 받아주기를 다듬는 데 쓴다
    const previousAssistant = [...transcript].reverse().find((m) => m.speaker === "assistant")?.content;
    const turn = parseChatTurn(JSON.parse(raw), previousAssistant);

    // 위험은 오직 ② 호출이 정한다. ① 이 낸 risk 는 쓰지 않는다 —
    // 거기엔 며칠치 맥락이 들어가 있어서 판단이 부풀려진다.
    let risk = turn.risk;
    try {
      const riskRaw = readClaudeText(await riskResponse.json()).text;
      risk = riskResponse.ok && riskRaw ? parseRiskCheck(JSON.parse(riskRaw)) : turn.risk;
    } catch (error) {
      // 위험 판단만 실패하면 ① 의 값을 쓴다. 대화를 끊지는 않는다.
      console.warn("[chat] 위험 판단 호출 실패, 후속 질문 호출의 값을 사용합니다", error);
    }

    const decision = decideNext({
      turnCount,
      avoidanceCount,
      risk,
      sufficient: turn.sufficient,
    });

    // 아이에게 보여줄 문장은 게이트가 정한다. LLM 문장은 후속 질문일 때만 쓴다.
    // 종료 인사는 여러 줄이라 배열로 내려보낸다.
    const lines =
      decision.action === "handoff_to_teacher"
        ? [HANDOFF_MESSAGE]
        : decision.action === "close"
          ? closingLines(decision.reason, flow)
          : turn.reply
            ? [turn.reply]
            : [];

    return NextResponse.json(
      {
        reply: lines[0] ?? "",
        lines,
        action: decision.action,
        reason: decision.action === "close" ? decision.reason : null,
        risk,
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

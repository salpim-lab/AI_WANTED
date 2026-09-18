// 담당: 이유민
// 화면에서 부르는 서버 라우트 래퍼. 브라우저에서 실행된다 — 키를 다루지 않는다.
//
// 로그인 없이 보는 데모에서도 화면이 죽지 않아야 한다.
// 세션을 만들지 못하면 sessionId 가 null 이 되고, 화면은 기존 목업 흐름으로 돌아간다.
import type { TranscriptMessage } from "@/lib/supabase/raw/wholeTranscript";
import type { UtteranceProsody } from "./prosody";
import type { SignalColor } from "@/lib/types/signal";

export type Flow = "checkin" | "checkout";
export type GateAction = "ask_followup" | "close" | "handoff_to_teacher";

export type ChatTurnResult = {
  reply: string;
  action: GateAction;
  reason: "sufficient" | "max_turns" | "avoidance" | null;
  risk: "none" | "flag";
  turn_count: number;
};

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new LiveChatError(data.code ?? "REQUEST_FAILED", data.message ?? "요청에 실패했습니다.");
  return data;
}

export class LiveChatError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
  /** 서버가 AI 를 끈 상태. 오류로 보여주지 않고 칩으로 되돌린다 */
  get isDisabled() {
    return this.code === "AI_DISABLED";
  }
}

/** 색을 고른 직후. 실패하면 null 을 돌려주고 화면은 목업으로 계속 간다. */
export async function startSession(flow: Flow, color: SignalColor): Promise<string | null> {
  try {
    const data = await post("/api/checkins/session", {
      period: flow === "checkin" ? "morning" : "afternoon",
      mood_color: color,
    });
    return typeof data.session_id === "string" ? data.session_id : null;
  } catch {
    return null;
  }
}

/** 녹음을 텍스트로. 오디오는 여기서 서버로 갔다가 사라진다. 저장하지 않는다. */
export async function transcribe(sessionId: string, audio: Blob): Promise<string> {
  const form = new FormData();
  form.set("session_id", sessionId);
  form.set("audio", audio, "speech.webm");
  const response = await fetch("/api/ai/transcribe", { method: "POST", body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new LiveChatError(data.code ?? "STT_FAILED", data.message ?? "말한 내용을 옮기지 못했어.");
  return typeof data.text === "string" ? data.text : "";
}

export async function chatTurn(args: {
  sessionId: string;
  flow: Flow;
  color: SignalColor;
  transcript: TranscriptMessage[];
}): Promise<ChatTurnResult> {
  return post("/api/ai/chat", {
    session_id: args.sessionId,
    flow: args.flow,
    color: args.color,
    transcript: args.transcript,
  }) as Promise<ChatTurnResult>;
}

/**
 * 종료 저장. 파생 수치를 **먼저**, 전문을 나중에 보낸다.
 * 전문 저장이 세션을 completed 로 바꾸므로 순서를 바꾸면 파생 수치가 들어갈 자리가 없다.
 * 파생 수치 실패는 삼킨다 — 없으면 근거 숫자가 안 뜰 뿐, 전문은 남아야 한다.
 */
export async function finishSession(args: {
  sessionId: string;
  transcript: TranscriptMessage[];
  prosody: Omit<UtteranceProsody, "index">[];
}) {
  if (args.prosody.length) {
    try {
      await post("/api/checkins/prosody", {
        session_id: args.sessionId,
        prosody: { utterances: args.prosody },
      });
    } catch (error) {
      console.warn("[prosody] 저장 실패, 전문 저장은 계속합니다", error);
    }
  }
  await post("/api/checkins/transcript", {
    session_id: args.sessionId,
    status: "completed",
    transcript: args.transcript,
  });
}

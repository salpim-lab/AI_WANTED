// 담당: 이유민 (단독 소유)
// 원본(불변) — 등/하교 색 선택 + 확정된 대화 트랜스크립트 insert 전용.

import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { SignalColor } from "@/lib/types/signal";

type CheckinSession = Database["public"]["Tables"]["checkin_sessions"]["Row"];
type ConversationMessage =
  Database["public"]["Tables"]["conversation_messages"]["Row"];
type MeetingRequest = Database["public"]["Tables"]["meeting_requests"]["Row"];

export type CheckinPeriod = "morning" | "afternoon";
export type CheckinStatus = "completed" | "stopped";
export type MessageSpeaker = "student" | "assistant" | "system";
export type MessageInputMethod = "voice" | "text" | "fixed";

export type StartSignalCheckInInput = {
  studentId: string;
  period: CheckinPeriod;
  moodColor: SignalColor;
  sessionDate?: string;
  // (2026-09-20, 이지현 제안) 공개 데모 방문자 격리용 — DEMO_MODE일 때 requireStudent()가
  // 돌려주는 demoOwnerId(=auth.uid())를 그대로 전달한다. null/undefined면 기존과 동일하게
  // 공용 행(demo_owner_id IS NULL)으로 취급한다.
  demoOwnerId?: string | null;
};

export type AppendConversationMessageInput = {
  sessionId: string;
  speaker: MessageSpeaker;
  content: string;
  inputMethod: MessageInputMethod;
};

export type FinishSignalCheckInInput = {
  sessionId: string;
  status: CheckinStatus;
  stopReason?: string;
};

export type CreateMeetingRequestInput = {
  sessionId: string;
  requestedBy: "student" | "system";
  note?: string;
  priority?: "normal" | "high";
};

export class SignalCheckInRepositoryError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "SignalCheckInRepositoryError";
  }
}

function todayInSeoul() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dbError(message: string, error: PostgrestError): never {
  throw new SignalCheckInRepositoryError(`${message}: ${error.message}`, error.code);
}

function requireText(value: string, fieldName: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new SignalCheckInRepositoryError(`${fieldName} 값이 필요합니다.`, "INVALID_INPUT");
  }

  return trimmed;
}

async function findCurrentEnrollmentId(studentId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("v_students_current")
    .select("enrollment_id")
    .eq("student_id", requireText(studentId, "studentId"))
    .eq("status", "active")
    .maybeSingle();

  if (error) dbError("현재 재학 정보를 조회하지 못했습니다", error);
  if (!data?.enrollment_id) {
    throw new SignalCheckInRepositoryError(
      "활성 상태인 학생 또는 현재 재학 정보를 찾지 못했습니다.",
      "ENROLLMENT_NOT_FOUND",
    );
  }

  return data.enrollment_id;
}

/** 색을 선택한 직후 체크인 세션을 만든다. 중단된 세션만 다음 attempt로 재시도한다. */
export async function startSignalCheckIn(
  input: StartSignalCheckInInput,
): Promise<CheckinSession> {
  const supabase = createAdminClient();
  const enrollmentId = await findCurrentEnrollmentId(input.studentId);
  const sessionDate = input.sessionDate ?? todayInSeoul();
  // null/undefined 둘 다 "공용 행"으로 통일 — DB의 부분 유니크 인덱스도 이 컬럼을
  // IS NULL 기준으로 나누므로, 여기서도 undefined를 남기지 않고 null로 맞춘다.
  const demoOwnerId = input.demoOwnerId ?? null;

  // 이 방문자(또는 공용)의 이 시간대 가장 최근 세션. 아래에서 처음 한 번, 동시 클릭 경합 뒤에 한 번 더 쓴다.
  const findLatest = async () => {
    let query = supabase
      .from("checkin_sessions")
      .select("*")
      .eq("enrollment_id", enrollmentId)
      .eq("session_date", sessionDate)
      .eq("period", input.period);
    // (2026-09-20, 이지현 제안) 데모 모드에서는 같은 enrollment_id(민준)를 여러 방문자가
    // 공유하므로, "이전 세션"도 이 방문자(demo_owner_id) 것만 봐야 한다 — 안 그러면 다른
    // 방문자가 이미 시작한 세션을 내가 이어 쓰게 된다.
    query = demoOwnerId ? query.eq("demo_owner_id", demoOwnerId) : query.is("demo_owner_id", null);
    return query.order("attempt", { ascending: false }).limit(1).maybeSingle();
  };

  const { data: previous, error: previousError } = await findLatest();

  if (previousError) dbError("기존 체크인을 조회하지 못했습니다", previousError);

  // 진행 중이던 세션은 이어서 쓴다. 새 행을 만들면 안 된다.
  // 아이가 대화 도중 새로고침하거나 탭을 닫았다 오는 일은 흔한데,
  // 그때마다 잠가 버리면 그 시간대 체크인을 영영 못 한다.
  if (previous?.status === "started") return previous;

  // 이미 끝낸 시간대는 다시 열지 않는다. 하루 두 번이 설계다(기획안 5장).
  //
  // 단 개발 중에는 막지 않는다. 같은 흐름을 몇 번이고 다시 보려면 열려 있어야 하고,
  // 스키마의 unique 는 (enrollment, date, period, attempt) 라 attempt 만 올리면 된다.
  // 실제로 이 제약 때문에 흐름을 한 번 보고 나면 DB 를 손봐야 다시 볼 수 있었다.
  if (previous && previous.status !== "stopped" && process.env.NODE_ENV === "production") {
    throw new SignalCheckInRepositoryError(
      "오늘 이 시간대의 마음은 이미 들었습니다.",
      "CHECKIN_ALREADY_EXISTS",
    );
  }

  const attemptTried = (previous?.attempt ?? 0) + 1;
  const { data, error } = await supabase
    .from("checkin_sessions")
    .insert({
      enrollment_id: enrollmentId,
      session_date: sessionDate,
      period: input.period,
      attempt: attemptTried,
      mood_color: input.moodColor,
      status: "started",
      demo_owner_id: demoOwnerId,
    })
    .select()
    .single();

  // 동시 클릭 경합(2026-09-20 실측으로 확인·수정): 위 select와 이 insert 사이에 같은 방문자의 다른 요청이 먼저
  // 세션을 만들면 DB의 부분 유니크 인덱스가 중복 행을 막는다(23505). 예전엔 그 실패가 그대로 500으로 나갔다.
  // 이제 **충돌한 바로 그 슬롯**을 다시 조회한다 — 유니크 키 전체(소유자 · enrollment · 날짜 · 시간대 · attempt)가
  // 정확히 일치하는 행만이다("내 최신 세션"이 아니다: 경합 뒤에 다른 시도가 끼어도 엉뚱한 attempt를 돌려주지 않고,
  // 다른 방문자·공용 시드 세션은 owner 조건상 절대 반환되지 않는다).
  //   - 승자가 진행 중(started)이면 그 세션을 이어 쓴다(위의 "진행 중이던 세션은 이어서 쓴다"와 같은 정책, 멱등).
  //   - 그 밖(이미 끝남·재조회 실패)이면 500이 아니라 409(CHECKIN_ALREADY_EXISTS)로 명시적으로 거절한다.
  if (error) {
    if (error.code === "23505") {
      let slotQuery = supabase
        .from("checkin_sessions")
        .select("*")
        .eq("enrollment_id", enrollmentId)
        .eq("session_date", sessionDate)
        .eq("period", input.period)
        .eq("attempt", attemptTried);
      slotQuery = demoOwnerId ? slotQuery.eq("demo_owner_id", demoOwnerId) : slotQuery.is("demo_owner_id", null);
      const { data: winner } = await slotQuery.maybeSingle();
      if (winner?.status === "started") return winner;
      throw new SignalCheckInRepositoryError(
        "이미 시작된 체크인이에요. 잠시 후 다시 시도해 주세요.",
        "CHECKIN_ALREADY_EXISTS",
      );
    }
    dbError("체크인을 시작하지 못했습니다", error);
  }
  return data;
}

/** STT가 확정한 한 발화 또는 고정 질문을 다음 sequence로 한 번만 저장한다. */
export async function appendConversationMessage(
  input: AppendConversationMessageInput,
): Promise<ConversationMessage> {
  const supabase = createAdminClient();
  const sessionId = requireText(input.sessionId, "sessionId");
  const content = requireText(input.content, "content");

  const { data: session, error: sessionError } = await supabase
    .from("checkin_sessions")
    .select("status")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) dbError("체크인 상태를 조회하지 못했습니다", sessionError);
  if (!session) {
    throw new SignalCheckInRepositoryError("체크인 세션을 찾지 못했습니다.", "SESSION_NOT_FOUND");
  }
  if (session.status !== "started") {
    throw new SignalCheckInRepositoryError(
      "종료된 체크인에는 메시지를 추가할 수 없습니다.",
      "SESSION_ALREADY_FINISHED",
    );
  }

  const { data: previous, error: previousError } = await supabase
    .from("conversation_messages")
    .select("sequence")
    .eq("session_id", sessionId)
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousError) dbError("이전 메시지를 조회하지 못했습니다", previousError);

  const { data, error } = await supabase
    .from("conversation_messages")
    .insert({
      session_id: sessionId,
      sequence: (previous?.sequence ?? 0) + 1,
      speaker: input.speaker,
      content,
      input_method: input.inputMethod,
    })
    .select()
    .single();

  if (error) dbError("대화 메시지를 저장하지 못했습니다", error);
  return data;
}

/** 원본 색은 유지하고 진행 중 세션의 상태와 종료 시각만 확정한다. */
export async function finishSignalCheckIn(
  input: FinishSignalCheckInInput,
): Promise<CheckinSession> {
  const supabase = createAdminClient();
  const stopReason = input.stopReason?.trim();

  if (input.status === "stopped" && !stopReason) {
    throw new SignalCheckInRepositoryError(
      "중단된 체크인에는 stopReason이 필요합니다.",
      "INVALID_INPUT",
    );
  }

  const { data, error } = await supabase
    .from("checkin_sessions")
    .update({
      status: input.status,
      stop_reason: input.status === "stopped" ? stopReason : null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", requireText(input.sessionId, "sessionId"))
    .eq("status", "started")
    .select()
    .maybeSingle();

  if (error) dbError("체크인을 종료하지 못했습니다", error);
  if (!data) {
    throw new SignalCheckInRepositoryError(
      "진행 중인 체크인 세션을 찾지 못했습니다.",
      "SESSION_NOT_ACTIVE",
    );
  }

  return data;
}

/** 학생 버튼 또는 안전 규칙이 만든 면담 신청을 체크인 근거와 함께 저장한다. */
export async function createMeetingRequest(
  input: CreateMeetingRequestInput,
): Promise<MeetingRequest> {
  const supabase = createAdminClient();
  const sessionId = requireText(input.sessionId, "sessionId");

  const { data: session, error: sessionError } = await supabase
    .from("checkin_sessions")
    .select("enrollment_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) dbError("체크인 정보를 조회하지 못했습니다", sessionError);
  if (!session) {
    throw new SignalCheckInRepositoryError("체크인 세션을 찾지 못했습니다.", "SESSION_NOT_FOUND");
  }

  const { data, error } = await supabase
    .from("meeting_requests")
    .insert({
      enrollment_id: session.enrollment_id,
      source_session_id: sessionId,
      requested_by: input.requestedBy,
      note: input.note?.trim() || null,
      priority: input.priority ?? "normal",
    })
    .select()
    .single();

  if (error) dbError("면담 신청을 저장하지 못했습니다", error);
  return data;
}

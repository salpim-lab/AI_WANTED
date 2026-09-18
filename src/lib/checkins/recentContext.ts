// 담당: 이유민
// 후속 질문에 쓸 "최근 며칠 맥락".
//
// 왜 서버에서 읽나: 지난 세션은 다른 날의 대화다. 브라우저가 그걸 들고 있을 이유가 없고,
// 클라이언트가 보내게 두면 값을 지어내도 서버가 알 수 없다.
// 그래서 라우트가 직접 읽고, 클라이언트가 보낸 recent_context 는 무시한다.
//
// 요약하지 않는다. 아이가 실제로 한 말을 그대로 넘긴다 —
// 요약을 한 번 거치면 그 요약의 해석이 질문에 섞이고, LLM 호출도 한 번 더 든다.
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { parseTranscript } from "@/lib/supabase/raw/wholeTranscript";

/** 며칠까지 거슬러 볼지. 너무 길면 오래된 일을 끄집어내 추궁처럼 들린다 */
const DAYS = 7;
/** 세션 수 상한 */
const MAX_SESSIONS = 4;
/** 프롬프트에 실을 최대 길이. 입력 토큰이 늘어나는 만큼만 비용이 는다 */
const MAX_CHARS = 600;

/**
 * 최근 완료된 세션들에서 아이 발화만 뽑아 한 덩어리로 만든다.
 * 없으면 undefined — 프롬프트에 null 로 들어가고 모델은 오늘 말만 본다.
 */
export async function buildRecentContext(
  enrollmentId: string,
  excludeSessionId: string,
): Promise<string | undefined> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - DAYS);
  const sinceDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(since);

  const { data, error } = await createAdminClient()
    .from("checkin_sessions")
    .select("session_date, mood_color, transcript")
    .eq("enrollment_id", enrollmentId)
    .neq("id", excludeSessionId)
    .gte("session_date", sinceDate)
    .not("transcript", "is", null)
    .order("session_date", { ascending: false })
    .limit(MAX_SESSIONS);
  if (error) {
    // 맥락이 없다고 대화를 막지는 않는다. 오늘 말만으로도 질문은 만들 수 있다.
    console.warn("[recentContext] 조회 실패", error.message);
    return undefined;
  }

  const lines: string[] = [];
  for (const row of data ?? []) {
    let messages;
    try {
      messages = parseTranscript(row.transcript);
    } catch {
      continue;
    }
    const said = messages
      .filter((m) => m.speaker === "student")
      .map((m) => m.content.trim())
      .filter(Boolean)
      .join(" ");
    if (said) lines.push(`${row.session_date}(${row.mood_color}): ${said}`);
  }
  if (!lines.length) return undefined;

  const joined = lines.join("\n");
  return joined.length > MAX_CHARS ? `${joined.slice(0, MAX_CHARS)}…` : joined;
}

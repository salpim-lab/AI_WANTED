// 담당: 진승혜 (단독 소유)
// 감정 어휘 성장 카드의 "실사용자 한 명" 경로.
//
// 대시보드의 스무 명 중 열아홉은 mockData.ts 의 하드코딩 값 그대로다. 민준이만 마지막 체크인에서
// 실제로 말한 감정 어휘를 이번 달 새 단어로 얹는다 — 시연에서 아이가 녹음하면 그 자리에서
// 막대가 한 칸 오르는 것을 보여주기 위한 경로다.
//
// 왜 민준이인가: 학생 로그인 화면이 아직 없어 개발 환경의 체크인은 전부 시드의 민준이로
// 저장된다 (lib/checkins/authorize.ts 의 DEV_STUDENT_FALLBACK = seed.sql 의 민준).
// 그래서 "실사용자가 녹음한 세션" = "민준이의 세션"이다. 학생 로그인이 붙으면 이 상수 대신
// 로그인한 학생을 쓰면 된다.
//
// 왜 마지막 한 건만 보나: 같은 이유로 팀원들이 기능을 시험한 세션도 전부 민준이 앞으로 쌓여 있다.
// 기간으로 긁으면 그 시험 기록까지 "이번 달 새로 쓴 말"로 올라와 카드를 못 읽는다.
// 지난 기록은 mockData 의 하드코딩 값이 맡고, 여기는 방금 한 대화 하나만 얹는다.
//
// ⚠️ (2026-09-20, 이지현 제안) 공개 데모(DEMO_MODE=true) 방문자 격리 — 모든 방문자가 같은
// "민준"(같은 enrollment_id)을 공유하므로, 방문자 구분 없이 "가장 최근 세션 하나"를 고르면
// 다른 방문자가 방금 만든 체크인이 내 화면에 뜰 수 있다(관찰일지·상담기록과 같은 문제).
// 그래서 이 함수는 이제 viewerId(호출자의 현재 익명 세션 auth.uid())를 받는다 — DEMO_MODE에서
// viewerId가 있으면 "검증된 공용 목업(demo_owner_id IS NULL) + 현재 방문자가 만든 세션"만
// 후보로 본다. 연결된 analysis_runs 캐시 조회도 이렇게 걸러진 세션의 id로만 하므로 같이
// 격리된다(다른 방문자의 세션 id를 모르면애초에 그 방문자의 analysis_runs 행을 못 찾는다).
// DEMO_MODE가 아니거나 viewerId가 없으면(실 서비스 단일 배포) 기존 동작 그대로 — 학급 전체에서
// 가장 최근 세션 하나.
//
// 경계:
//   LLM  = 이 발화에 어떤 표제어가 있나 (lib/openai/extractVocab)
//   코드 = 세는 것 전부 (lib/vocab/aggregate 의 정의를 mockData.mergeLiveVocab 이 따른다)
// 읽기 전용이다. 원본 테이블에는 쓰지 않는다 (살핌_DB_스키마_v0.3.md §13).
// 유일한 쓰기는 analysis_runs 의 추출 캐시 한 줄 — /api/ai/vocab-growth 와 같은 규칙이다.

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { parseTranscript } from "@/lib/supabase/raw/wholeTranscript";
import { extractVocab } from "@/lib/openai/extractVocab";
import { VOCAB_EXTRACT_PROMPT_VERSION } from "@/lib/openai/prompts/vocab-extract";
import { canonicalize } from "@/lib/vocab/lexicon";

/** 시드의 민준. 개발 환경에서 로그인 없이 체크인하면 이 학생으로 저장된다. */
export const LIVE_VOCAB_STUDENT_ID = "30000000-0000-4000-8000-000000000001";

const ANALYSIS_TYPE = "emotion_vocab";

/** 실데이터로 얹을 세션 수. 1 = 가장 최근 대화 한 건만. */
const LIVE_SESSION_COUNT = 1;

let warned = false;
function warnOnce(error: unknown) {
  if (warned) return;
  warned = true;
  console.warn(
    "[liveVocab] 실제 감정 어휘를 읽지 못해 하드코딩 값만 보여줍니다:",
    error instanceof Error ? error.message : error,
  );
}

const enabled = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SECRET_KEY?.trim());

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LiveVocab = {
  /** 마지막 대화에서 확인된 표제어 (말한 순, 중복 없음) */
  lemmas: string[];
  /** 그 대화가 있었던 날. 없으면 null — 카드는 하드코딩 값 그대로다. */
  sessionDate: string | null;
};

const EMPTY: LiveVocab = { lemmas: [], sessionDate: null };

/**
 * 민준이의 마지막 체크인 대화에서 뽑은 감정 표제어.
 *
 * asOf 는 대시보드에서 고른 날짜다. 그 날까지의 마지막 대화를 본다 —
 * 과거 날짜를 고르면 그 시점의 마지막 대화가 나온다.
 *
 * viewerId — 공개 데모 방문자 격리용(위 파일 상단 설명 참고). DEMO_MODE=true이고 이 값이
 * 있으면 "공용 목업(demo_owner_id IS NULL) + 이 방문자가 만든 세션"만 후보로 본다. 그 밖의
 * 경우(DEMO_MODE 아님, 또는 아직 방문자 id를 모름)에는 null을 넘긴다 — 기존 동작 그대로
 * 학급 전체에서 가장 최근 세션 하나를 본다.
 *
 * 추출은 세션 하나당 한 번만 한다 — 결과를 analysis_runs 에 남기고, 다음부터는 그 행을 읽는다.
 * 대시보드는 새로고침이 잦아서 캐시가 없으면 같은 대화를 몇 번이고 다시 모델에 보내게 된다.
 *
 * 실패하면 빈 값을 돌려준다. 실데이터가 없다고 카드가 비면 안 되고, 하드코딩 값으로 그대로 보이면 된다.
 */
export async function getLiveVocabLemmas(asOf: string, viewerId: string | null = null): Promise<LiveVocab> {
  if (!enabled()) return EMPTY;

  // demo_owner_id 컬럼 자체는 DEMO_MODE 여부와 무관하게 존재하므로, 플래그가 꺼져 있거나
  // viewerId를 안 받은 호출부(아직 안 넘기는 기존 호출부 포함)는 필터를 걸지 않는다 — 실수로
  // 값을 안 넘겼다고 빈 카드가 뜨면 안 된다(이 카드는 "실데이터 없으면 하드코딩 값" 규칙).
  const demoScoped = process.env.DEMO_MODE === "true" && viewerId !== null && UUID_RE.test(viewerId);

  try {
    const client = createAdminClient();

    const { data: enrollments, error: enrollmentError } = await client
      .from("enrollments")
      .select("id")
      .eq("student_id", LIVE_VOCAB_STUDENT_ID)
      .is("ended_on", null);
    if (enrollmentError) throw enrollmentError;
    const enrollmentIds = (enrollments ?? []).map((e) => e.id);
    if (!enrollmentIds.length) return EMPTY;

    // 끝난 대화만 본다. 아직 진행 중인 세션(status='started')은 transcript 가 null 이다.
    // 중간에 그만둔 대화(stopped)도 센다 — 아이가 이미 말한 말이고, 시연에서 끝까지 못 가는 일이 잦다.
    // 같은 날 등교·하교가 다 있으면 나중 것(하교)이 마지막 대화다.
    let sessionQuery = client
      .from("checkin_sessions")
      .select("id, session_date, transcript")
      .in("enrollment_id", enrollmentIds)
      .lte("session_date", asOf)
      .not("transcript", "is", null);
    // 공용 목업(NULL) 또는 이 방문자(viewerId)가 만든 세션만 — 다른 방문자의 세션은 후보에서
    // 아예 제외한다(우선순위 조정이 아니라 접근 자체를 차단).
    if (demoScoped) sessionQuery = sessionQuery.or(`demo_owner_id.is.null,demo_owner_id.eq.${viewerId}`);
    const { data: sessions, error: sessionError } = await sessionQuery
      .order("session_date", { ascending: false })
      .order("started_at", { ascending: false })
      .limit(LIVE_SESSION_COUNT);
    if (sessionError) throw sessionError;

    const session = sessions?.[0];
    if (!session) return EMPTY;

    const { data: cached, error: cacheError } = await client
      .from("analysis_runs")
      .select("result")
      .eq("analysis_type", ANALYSIS_TYPE)
      .eq("source_type", "session")
      .eq("status", "completed")
      .eq("source_id", session.id)
      .limit(1);
    if (cacheError) throw cacheError;

    let lemmas: string[];
    const hit = cached?.[0];

    if (hit) {
      const raw = (hit.result as { lemmas?: unknown })?.lemmas;
      // 사전이 바뀌어 더는 세지 않는 표제어가 캐시에 남아 있을 수 있다 — 지금 사전으로 다시 거른다.
      lemmas = Array.isArray(raw)
        ? raw.map(canonicalize).filter((l): l is string => l !== null)
        : [];
    } else {
      if (!process.env.OPENAI_API_KEY?.trim()) return EMPTY;
      const model = process.env.OPENAI_VOCAB_MODEL || process.env.OPENAI_ITEM_MODEL || "gpt-4.1-mini";
      const hits = await extractVocab(parseTranscript(session.transcript));
      lemmas = hits.map((h) => h.lemma);
      await client.from("analysis_runs").insert({
        analysis_type: ANALYSIS_TYPE,
        source_type: "session",
        source_id: session.id,
        provider: "openai",
        model,
        prompt_version: VOCAB_EXTRACT_PROMPT_VERSION,
        status: "completed",
        result: { lemmas, evidence: hits },
      });
    }

    // 말한 순서를 지킨다 — 화면이 목록 뒤쪽을 "이번 달 새로 쓴 말"로 읽는다.
    const ordered: string[] = [];
    for (const lemma of lemmas) if (!ordered.includes(lemma)) ordered.push(lemma);

    return { lemmas: ordered, sessionDate: session.session_date };
  } catch (error) {
    warnOnce(error);
    return EMPTY;
  }
}

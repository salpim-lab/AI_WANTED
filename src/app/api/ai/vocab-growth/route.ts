// 담당: 진승혜
// 역할: 월별 아이별 감정 어휘 종류 증가 추이 (대시보드 6번째 섹션)
// 참고: docs/planning/PLANNING.md "6. 감정 어휘 성장", 살핌_기획안.md "7.3"
//
// 역할 분담이 이 라우트의 전부다:
//   LLM  = 한 세션의 학생 발화 → 감정 표제어 추출·정규화 (lib/openai/extractVocab)
//   코드 = 종류 수·이번 달 증가·학급 평균 계산      (lib/vocab/aggregate)
// 숫자를 LLM에게 맡기면 같은 데이터에서 매번 다른 값이 나와 성과 지표로 쓸 수 없다.
//
// 추출 결과는 세션당 한 번만 계산해 analysis_runs(analysis_type='emotion_vocab')에 남긴다.
// 대시보드를 열 때마다 전 학급 전 세션을 다시 호출하면 비용도 지연도 감당이 안 된다.
// 읽기 전용 화면이지만 이 캐시 한 줄만 쓴다 — 원본 테이블에는 쓰지 않는다 (DB 스키마 §13).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseTranscript } from "@/lib/supabase/raw/wholeTranscript";
import { extractVocab } from "@/lib/openai/extractVocab";
import { ItemAIError } from "@/lib/openai/client";
import { VOCAB_EXTRACT_PROMPT_VERSION } from "@/lib/openai/prompts/vocab-extract";
import { canonicalize } from "@/lib/vocab/lexicon";
import { aggregateVocab, type SessionLemmas } from "@/lib/vocab/aggregate";

export const runtime = "nodejs";
export const maxDuration = 60;

const ANALYSIS_TYPE = "emotion_vocab";
/** 한 요청에서 새로 추출할 세션 수 상한. 나머지는 다음 요청이 이어서 채운다. */
const EXTRACT_BUDGET = 12;

const fail = (code: string, message: string, status: number) =>
  NextResponse.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const asOf = new URL(request.url).searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return fail("INVALID_REQUEST", "date는 YYYY-MM-DD여야 합니다.", 400);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim())
    return fail("DB_NOT_CONFIGURED", ".env.local 의 Supabase 값을 채운 뒤 사용할 수 있습니다.", 503);

  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return fail("UNAUTHORIZED", "교사 로그인이 필요합니다.", 401);

    const { data: teaching, error: classError } = await client
      .from("class_teachers").select("class_id").eq("teacher_id", user.id);
    if (classError) return fail("DATABASE_ERROR", "담당 학급을 조회하지 못했습니다.", 500);
    if (!teaching?.length) return fail("NO_CLASS", "담당 학급이 없습니다.", 404);
    const classIds = teaching.map((t) => t.class_id);

    const { data: enrollments, error: rosterError } = await client
      .from("enrollments").select("id, student_id, students(display_name)")
      .in("class_id", classIds).is("ended_on", null);
    if (rosterError) return fail("DATABASE_ERROR", "학생 명단을 조회하지 못했습니다.", 500);
    if (!enrollments?.length) return fail("NO_STUDENTS", "학급에 학생이 없습니다.", 404);

    const studentOf = new Map(enrollments.map((e) => [e.id, e.student_id]));
    const roster = enrollments.map((e) => ({
      studentId: e.student_id,
      name: e.students?.display_name ?? "이름 없음",
    }));

    const { data: sessions, error: sessionError } = await client
      .from("checkin_sessions").select("id, enrollment_id, session_date, transcript")
      .in("enrollment_id", [...studentOf.keys()])
      .eq("status", "completed").lte("session_date", asOf)
      .order("session_date", { ascending: true });
    if (sessionError) return fail("DATABASE_ERROR", "상담 기록을 조회하지 못했습니다.", 500);

    const withTranscript = (sessions ?? []).filter((s) => s.transcript !== null);

    // 이미 추출해 둔 세션은 LLM을 다시 부르지 않는다.
    const { data: cached, error: cacheError } = await client
      .from("analysis_runs").select("source_id, result")
      .eq("analysis_type", ANALYSIS_TYPE).eq("source_type", "session").eq("status", "completed")
      .in("source_id", withTranscript.map((s) => s.id));
    if (cacheError) return fail("DATABASE_ERROR", "감정 어휘 분석 기록을 조회하지 못했습니다.", 500);

    const lemmasBySession = new Map<string, string[]>();
    for (const run of cached ?? []) {
      const raw = (run.result as { lemmas?: unknown })?.lemmas;
      // 사전이 바뀌어 더는 쓰지 않는 표제어가 캐시에 남아 있을 수 있다 — 지금 사전으로 다시 거른다.
      lemmasBySession.set(run.source_id, Array.isArray(raw) ? raw.map(canonicalize).filter((l): l is string => l !== null) : []);
    }

    const pending = withTranscript.filter((s) => !lemmasBySession.has(s.id));
    if (pending.length && !process.env.OPENAI_API_KEY?.trim())
      return fail("AI_NOT_CONFIGURED", "OPENAI_API_KEY 설정 후 사용할 수 있습니다.", 503);

    for (const session of pending.slice(0, EXTRACT_BUDGET)) {
      const hits = await extractVocab(parseTranscript(session.transcript));
      const lemmas = hits.map((h) => h.lemma);
      lemmasBySession.set(session.id, lemmas);
      await client.from("analysis_runs").insert({
        analysis_type: ANALYSIS_TYPE,
        source_type: "session",
        source_id: session.id,
        provider: "openai",
        model: process.env.OPENAI_VOCAB_MODEL || process.env.OPENAI_ITEM_MODEL || "gpt-4.1-mini",
        prompt_version: VOCAB_EXTRACT_PROMPT_VERSION,
        status: "completed",
        result: { lemmas, evidence: hits },
      });
    }

    const perSession: SessionLemmas<string>[] = withTranscript
      .filter((s) => lemmasBySession.has(s.id))
      .map((s) => ({
        studentId: studentOf.get(s.enrollment_id)!,
        date: s.session_date,
        lemmas: lemmasBySession.get(s.id)!,
      }));

    return NextResponse.json(
      {
        date: asOf,
        promptVersion: VOCAB_EXTRACT_PROMPT_VERSION,
        /** 아직 추출하지 못하고 남은 세션 수 — 0이 아니면 화면 숫자는 아직 늘어날 수 있다. */
        pending: Math.max(0, pending.length - EXTRACT_BUDGET),
        ...aggregateVocab(roster, perSession, asOf),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof ItemAIError) return fail(e.code, e.message, e.httpStatus);
    return fail("VOCAB_GROWTH_FAILED", "감정 어휘 성장을 계산하지 못했습니다.", 500);
  }
}

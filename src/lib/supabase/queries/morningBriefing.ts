// 담당: 진승혜 (단독 소유)
// 대시보드 섹션 1 — 아침 브리핑.
//
// 판정 로직은 여기 없다. lib/briefing/{baseline,triggers,templates} 가 전부 순수 함수로 갖고 있고
// (DB 없이 `node --test src/lib/briefing/__tests__/briefing.test.mjs` 로 검증한다),
// 이 파일은 그 함수들이 읽을 StudentFacts 를 DB 에서 긁어 담는 일만 한다.
// 그래서 규칙을 고칠 일이 생기면 여기가 아니라 triggers.ts 를 본다.
//
// LLM 을 부르지 않는다. 감정 어휘처럼 LLM 이 만든 값을 읽기는 하지만, 그건 체크인이 끝날 때
// 이미 analysis_runs 에 저장된 행이라 브리핑은 세기만 한다.
//
// 대시보드는 읽기 전용이다 (살핌_DB_스키마_v0.3.md §13) — 어떤 테이블에도 쓰지 않는다.
// UI/URL 에 노출하는 식별자는 student_id 다. enrollment_id 는 이 파일 안에서만 쓴다.

import { renderBriefingLine } from "@/lib/briefing/templates";
import { selectBriefing, type StudentFacts } from "@/lib/briefing/triggers";
import type { SignalColor } from "@/lib/types/signal";

/** 화면 한 줄. components/teacher/dashboard/mockData.ts 의 BriefingStudent 와 같은 모양이다. */
export type BriefingRow = {
  studentId: number;
  name: string;
  tone: SignalColor;
  status: string;
  reason: string;
};

/** 기준선을 세우는 데 쓸 과거 기록 길이 (수업일). 14일이 최소이고 여유를 둔다. */
export const BRIEFING_HISTORY_DAYS = 30;

/** 한 화면에 올릴 최대 인원. 이보다 많으면 훑는 카드가 아니라 명단이 된다. */
export const BRIEFING_LIMIT = 4;

/**
 * 사실 묶음 → 화면 줄. 이 변환에는 DB 도 LLM 도 없다.
 * 아래 getMorningBriefing 이 채워지기 전에도 mock 데이터로 그대로 쓸 수 있다.
 */
export function buildBriefingRows(
  everyone: StudentFacts[],
  date: string,
  limit = BRIEFING_LIMIT,
): BriefingRow[] {
  return selectBriefing(everyone, date, limit).map(({ facts, triggers }) => ({
    studentId: facts.studentId,
    name: facts.name,
    // 체크인을 안 한 아이는 색이 없다 — 화면에서는 가장 옅은 남색 점으로 자리만 잡는다.
    tone: facts.todayColor ?? "navy",
    ...renderBriefingLine(triggers),
  }));
}

// TODO(진승혜): getMorningBriefing(classId: string, date: string): Promise<BriefingRow[]>
//   아래를 한 번씩 조회해 StudentFacts[] 를 만든 뒤 buildBriefingRows 에 넘긴다.
//     todayColor   checkin_sessions where session_date = date and period = 'morning'
//     history      checkin_sessions where session_date < date, 최근 BRIEFING_HISTORY_DAYS 수업일
//     meetingRequest  meeting_requests where status = 'requested'
//     prosody      session_prosody — 그날 값 / 그 아이 과거 중앙값 의 비율로 넘긴다 (원본 수치 아님)
//     lastConflict work_records ⨝ work_record_students (읽기 전용)
//     emotionWordGap   analysis_runs where analysis_type = 'emotion_vocab' — result.lemmas 가 빈 세션의 연속 횟수
//     peerMentionGapWeeks  전사에서 같은 반 이름 문자열 매칭 (LLM 불필요 — 명단이 20명뿐이다)
//     navyCountLast2Weeks  checkin_sessions mood_color = 'navy' 집계
//
//   주의: history 는 오래된 날 → 최근 날 순서여야 한다 (streak 계산이 뒤에서부터 읽는다).

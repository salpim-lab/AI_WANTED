// 담당: 이유민
// STT 에 넘길 "우리 반 어휘".
//
// 왜 필요한가: 한국 아이 이름은 음성 인식이 가장 자주 틀리는 부분이다.
// 실측(합성 아동 발화 10문장, 고유명사 18개)에서 그냥 부르면 11/18 이었고,
// 반 명단을 힌트로 넘기니 18/18 이 됐다. 놓치던 것들:
//   현우 → 현호 / 다올 → 다오리 / 나윤 → 나연 / 윤아 → 유나 / 수아 → 주아 / 술래 → 순례
//
// 이름이 중요한 이유는 따로 있다. 교사 화면의 관계 지도와 갈등 기록이
// "누가 누구를 언급했는가" 를 전문에서 읽는다. 이름이 틀리면 그 연결이 통째로 어긋난다.
//
// ⚠️ 이건 **인식을 돕는 힌트**다. 전사 결과를 이 목록으로 고쳐 쓰지 않는다.
//    아이가 하지 않은 이름을 기록에 넣는 것은 못 알아듣는 것보다 나쁘다.
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** 교실에서 자주 나오는 말. 이름만큼 자주 틀린다(술래 → 순례) */
const SCHOOL_WORDS = [
  "술래잡기",
  "술래",
  "피구",
  "급식",
  "쉬는 시간",
  "체육 시간",
  "단톡방",
  "짝꿍",
  "지우개",
  "받아쓰기",
  "돌봄교실",
  "방과후",
];

/** prompt 가 길면 전사가 오히려 흔들린다. 이름은 한 반 정원이면 충분히 들어간다 */
const MAX_NAMES = 40;

/**
 * 같은 반 아이들의 이름 + 학교 어휘로 STT 힌트 문장을 만든다.
 * 조회에 실패해도 전사를 막지 않는다 — 힌트가 없을 뿐이다.
 */
export async function buildSttPrompt(enrollmentId: string): Promise<string | undefined> {
  try {
    const admin = createAdminClient();

    const { data: mine } = await admin
      .from("enrollments")
      .select("class_id")
      .eq("id", enrollmentId)
      .maybeSingle();
    if (!mine?.class_id) return undefined;

    const { data: rows } = await admin
      .from("enrollments")
      .select("students!inner ( display_name, status )")
      .eq("class_id", mine.class_id)
      .is("ended_on", null)
      .limit(MAX_NAMES);

    const names = (rows ?? [])
      .map((r) => (r.students as unknown as { display_name: string; status: string }))
      .filter((s) => s?.status === "active" && s.display_name)
      .map((s) => s.display_name);

    const parts = ["초등학교 교실에서 아이가 하는 말."];
    if (names.length) parts.push(`우리 반 친구 이름: ${[...new Set(names)].join(", ")}.`);
    parts.push(`자주 나오는 말: ${SCHOOL_WORDS.join(", ")}.`);
    return parts.join(" ");
  } catch (error) {
    console.warn("[sttPrompt] 반 명단을 읽지 못했습니다", error);
    return undefined;
  }
}

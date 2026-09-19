// 담당: 김현우 (2026-09-18 추가 — 학생 화면은 이유민 담당. PR에서 이유민 님과 협의)
// 학생 등교 홈의 "선생님 편지" 조회.
//
// 임시(2026-09-20): Supabase 작업이 끝날 때까지 교사가 보냈는지와 상관없이 편지가 항상 나온다.
//   내용은 아래 MOCK_LETTERS 3개가 요청마다 돌아가며 나온다. 실제 조회(getLetterForStudent)는 연결하지 않았다.
//   Supabase 연결이 끝나면: MOCK_LETTERS·nextMockLetter를 지우고 GET 안의 "실제 조회" 주석을 되살린다.
//
// 원래 동작(실제 조회): 교사가 아이 상세에서 보낸 최종본(feedback_drafts.final_text, status='sent') 중
//   마지막 등교 이후에 보낸 1건 (docs/planning/TEACHER_LETTER_LOGIC.md C안). 조회·판정은
//   lib/supabase/interpretation/teacherComment.ts.
//
// 응답: GET → 200 { letter: { text, teacherName } | null }
//   - 어느 학생인지는 서버가 정한다(getActingStudent). 브라우저가 보낸 studentId를 받지 않는다 — 다른 아이 편지를 못 보게.
//   - AI 초안(draft_text)은 절대 내려보내지 않는다. 교사가 검토해 보낸 글만.
//   - 목업 문구는 가상의 내용이다. 진단·평가 표현 없이 격려만 담는다.

import { NextResponse } from "next/server";
// import { getLetterForStudent } from "@/lib/supabase/interpretation/teacherComment";
// import { getActingStudent } from "@/lib/supabase/raw/_mockTeacherData";

export const runtime = "nodejs";

// 편지 머리말은 "{이름}이 ○○이에게 보내는 편지"로 읽힌다 — 이름 대신 그냥 "선생님"으로 쓴다.
// 실제 조회로 바꿀 때는 getLetterForStudent가 돌려주는 teacherName을 쓴다 (지금은 담임 표시명 "선생님").
const MOCK_TEACHER_LETTER_NAME = "선생님";

// **강조** 는 편지지에서 형광펜으로 칠해진다. 빈 줄은 문단 나눔.
const MOCK_LETTERS = [
  `어제 수학 시간에 발표하는 모습이 **정말 멋졌어!**
처음엔 조금 긴장한 것 같았는데,
끝까지 씩씩하게 해내는 모습이 대단했어.

오늘도 너의 하루가
즐겁고 행복하길 바라! 💜`,
  `요즘 친구들에게 먼저 **인사를 건네는 모습**이 눈에 띄어서 선생님도 기분이 좋았어.
작은 인사 한마디가 교실을 환하게 만들어 준단다.

오늘 하루도 편안한 마음으로 시작해 보자.
무슨 일이 있으면 언제든 선생님께 이야기해 줘! 🌈`,
  `지난주에 모둠 활동에서 **친구 이야기를 끝까지 들어주던 모습**, 선생님이 기억하고 있어.
그렇게 귀 기울여 주는 친구가 있어서 모두 든든했을 거야.

오늘은 무엇을 하며 놀고 싶은지 생각해 보렴.
선생님은 네 편이야. ☀️`,
];

// 다음에 보여줄 편지 순서. 개발 서버가 다시 시작하면 처음부터.
// React 개발 모드는 화면을 열 때 같은 요청을 두 번 보내므로, 2초 안에 다시 오면 같은 편지를 돌려준다.
const DUPLICATE_WINDOW_MS = 2000;
const globalForLetter = globalThis as typeof globalThis & {
  __salpimMockLetter?: { index: number; servedAt: number };
};

function nextMockLetter(): string {
  const now = Date.now();
  const last = globalForLetter.__salpimMockLetter;
  const index =
    last && now - last.servedAt < DUPLICATE_WINDOW_MS ? last.index : ((last?.index ?? -1) + 1) % MOCK_LETTERS.length;
  globalForLetter.__salpimMockLetter = { index, servedAt: now };
  return MOCK_LETTERS[index];
}

export async function GET() {
  try {
    // 실제 조회 (Supabase 연결 후 되살리기):
    // const student = await getActingStudent();
    // const letter = await getLetterForStudent(student.studentId);
    const letter = { text: nextMockLetter(), teacherName: MOCK_TEACHER_LETTER_NAME };
    return NextResponse.json({ letter }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[student/letter]", error);
    return NextResponse.json({ message: "편지를 불러오지 못했습니다." }, { status: 500 });
  }
}

// 담당: 이유민 (Claude 세션)
// 학생 홈 조립. mode 로 등교/하교를 전환한다 (현재 시각에 의존하지 않는다).
//
//   <StudentHome mode="morning" />
//   <StudentHome mode="afternoon" />
//
// 배경 일러스트는 이미지 에셋으로 넣는다. bgSrc 가 없으면 색 방향만 맞춘
// 임시 그라데이션이 깔린다 (목업 일러스트를 SVG 로 흉내내지 않는다).
"use client";

import { useEffect, useState } from "react";
import SalpimHeader from "./SalpimHeader";
import StudentProfile from "./StudentProfile";
import MorningHome from "./MorningHome";
import AfternoonHome from "./AfternoonHome";
import type { LetterData } from "./TeacherLetter";

export type StudentHomeMode = "morning" | "afternoon";

/** 등교 홈을 다음 화면이 떠오른 뒤에도 그려 두는 시간(ms). 마음 신호등이 떠오르는 시간(CSS .mood-screen)보다 길게 */
const LINGER_MS = 1000;

export default function StudentHome({
  mode,
  active = true,
  onNext,
  studentName = "민준",
  studentFullName = "김민준",
  teacherName = "이유민 선생님",
  /** 오늘 보여줄 편지 본문. 없으면 편지 없이 인사 화면으로 시작한다.
      실제로는 feedback_drafts.final_text (status='sent') 를 넘긴다.
      자세한 로직: docs/planning/TEACHER_LETTER_LOGIC.md */
  letterText,
  bgSrc,
  studentPhotoSrc,
}: {
  mode: StudentHomeMode;
  active?: boolean;
  onNext: () => void;
  studentName?: string;
  studentFullName?: string;
  teacherName?: string;
  letterText?: string | null;
  /** 배경 일러스트 에셋 경로. 예: "/brand/scene-morning.webp" */
  bgSrc?: string;
  studentPhotoSrc?: string;
}) {
  const isMorning = mode === "morning";
  // 등교 홈은 다음 화면(마음 신호등)이 떠오르는 동안 잠시 더 그려 둔다 — 편지 봉투가 그 아래에서 마저 내려가게.
  // 바로 내리면 봉투가 내려가는 도중에 뚝 사라진다. 다시 돌아오면(뒤로가기) 새로 시작하도록 시간이 지나면 내린다.
  const [lingering, setLingering] = useState(false);
  const [prevActive, setPrevActive] = useState(active);
  // active 가 true → false 로 바뀌는 그 렌더에서 바로 붙들어 둔다(효과에서 하면 한 프레임 비어 보인다)
  if (prevActive !== active) {
    setPrevActive(active);
    if (!active && isMorning) setLingering(true);
  }
  useEffect(() => {
    if (!lingering) return;
    const timer = window.setTimeout(() => setLingering(false), LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [lingering]);
  const shown = active || lingering;
  // letterText 가 없으면 편지를 띄우지 않는다 (빈 봉투나 "편지 없어요" 안내도 넣지 않는다).
  // undefined는 아직 서버 응답을 기다리는 중이다. null(편지 없음)과 구분해
  // 로딩 중 아침 인사가 잠깐 그려지는 것을 막는다.
  const letter: LetterData | null | undefined =
    letterText === undefined
      ? undefined
      : letterText === null
        ? null
        : { teacherName, studentName, text: letterText };

  return (
    <section
      className={`home-screen${shown ? " active" : ""}`}
      aria-label={isMorning ? "등교 홈" : "하교 홈"}
    >
      <div className="home-bg">
        {bgSrc ? (
          <img src={bgSrc} alt="" />
        ) : (
          <div
            className={`h-full w-full ${
              isMorning
                ? "home-bg--morning-placeholder"
                : "home-bg--afternoon-placeholder"
            }`}
          />
        )}
      </div>

      <div className="home-layer">
        <SalpimHeader />
        <StudentProfile name={studentFullName} photoSrc={studentPhotoSrc} />

        {isMorning ? (
          shown && <MorningHome letter={letter} studentName={studentName} onNext={onNext} />
        ) : (
          <AfternoonHome studentName={studentName} onNext={onNext} />
        )}
      </div>
    </section>
  );
}

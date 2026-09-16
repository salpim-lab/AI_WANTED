// 담당: 이유민 (Claude 세션)
// 학생 홈 조립. mode 로 등교/하교를 전환한다 (현재 시각에 의존하지 않는다).
//
//   <StudentHome mode="morning" />
//   <StudentHome mode="afternoon" />
//
// 배경 일러스트는 이미지 에셋으로 넣는다. bgSrc 가 없으면 색 방향만 맞춘
// 임시 그라데이션이 깔린다 (목업 일러스트를 SVG 로 흉내내지 않는다).
"use client";

import SalpimHeader from "./SalpimHeader";
import StudentProfile from "./StudentProfile";
import MorningHome from "./MorningHome";
import AfternoonHome from "./AfternoonHome";
import type { LetterData } from "./TeacherLetter";

export type StudentHomeMode = "morning" | "afternoon";

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
  // letterText 가 없으면 편지를 띄우지 않는다 (빈 봉투나 "편지 없어요" 안내도 넣지 않는다).
  const letter: LetterData | null =
    letterText === null
      ? null
      : { teacherName, studentName, text: letterText };

  return (
    <section
      className={`home-screen${active ? " active" : ""}`}
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
          <MorningHome letter={letter} studentName={studentName} onNext={onNext} />
        ) : (
          <AfternoonHome studentName={studentName} onNext={onNext} />
        )}
      </div>
    </section>
  );
}

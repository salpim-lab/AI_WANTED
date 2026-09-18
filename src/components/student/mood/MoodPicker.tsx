// 담당: 이유민
// 마음 색 선택 화면 — 등교·하교 공통 2단계.
//
// 기획안 §5.2 의 네 색을 그대로 쓴다. 남색은 "나쁨"이 아니라 혼자 있고 싶다는 요청이라
// 척도 밖으로 다루지만, 이 화면에서는 나머지와 똑같이 하나의 선택지로 보여준다.
// (남색을 고른 뒤 AI 가 말을 걸지 않는 처리는 3단계 대화 쪽에서 한다.)
//
// 기획안 §5.3 은 "이름 타일을 색 칸으로 드래그"였지만, 로그인이 생겨 본인 확인이
// 이미 끝났고 "색 3초" 예산에도 탭이 유리해 탭 방식으로 간다 (2026-09-17 결정).
"use client";

import type { SignalColor } from "@/lib/types/signal";
import { SIGNAL_COLORS } from "@/lib/constants/colors";
import SalpimHeader from "../home/SalpimHeader";
import StudentProfile from "../home/StudentProfile";
import MoodButton, { type MoodOption } from "./MoodButton";

// 문구는 SIGNAL_COLORS 한 곳에서만 관리한다. 여기서 다시 쓰면 대화 화면 뱃지와 어긋난다.
const OPTIONS: MoodOption[] = (["green", "yellow", "red", "navy"] as const).map((color) => ({
  color,
  name: SIGNAL_COLORS[color].name,
  desc: SIGNAL_COLORS[color].label,
}));

export default function MoodPicker({
  active = true,
  onSelect,
  studentFullName = "김민준",
  studentPhotoSrc,
}: {
  active?: boolean;
  onSelect: (color: SignalColor) => void;
  studentFullName?: string;
  studentPhotoSrc?: string;
}) {
  return (
    <section
      className={`home-screen mood-screen${active ? " active" : ""}`}
      aria-label="오늘의 마음 색 고르기"
    >
      <div className="home-layer">
        <SalpimHeader />
        <StudentProfile name={studentFullName} photoSrc={studentPhotoSrc} />

        <div className="absolute left-1/2 top-[19cqh] z-[2] flex w-full -translate-x-1/2 flex-col items-center">
          <h1 className="sh-cute text-[5.6cqh] leading-[1.25] tracking-tight text-[var(--sh-navy)]">
            지금, 너의 <span className="text-[var(--sh-violet)]">마음</span>은 어떤 색이야?
          </h1>
          <p className="mt-[1.6cqh] text-[2.7cqh] font-bold text-[var(--sh-muted)]">
            지금 느끼는 마음과 가장 비슷한 색을 눌러줘!
          </p>

          <div className="mood-panel mt-[5cqh]">
            {OPTIONS.map((o) => (
              <MoodButton key={o.color} option={o} onSelect={onSelect} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// 담당: 이유민 (Claude 세션)
// 등교 홈.
//  - 처음: 선생님 편지가 중앙에 열려 있고 CTA 는 아래
//  - 편지를 X 로 닫으면: 하교 홈과 같은 구조의 인사 화면으로 바뀐다
"use client";

import { useEffect, useRef, useState } from "react";
import TeacherLetter, { type LetterData } from "./TeacherLetter";
import HomeIntro from "./HomeIntro";
import CtaButton from "./CtaButton";

export default function MorningHome({
  letter,
  studentName,
  onNext,
}: {
  /** 오늘 보여줄 편지. 교사가 매일 쓰지는 않으므로 null 이 오히려 일반적이다. */
  letter: LetterData | null;
  studentName: string;
  onNext: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [hidden, setHidden] = useState(false);

  const closeStarted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!closing) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function finish() {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      setHidden(true);
    }
    function onMotionChange() { if (motion.matches) finish(); }
    timer.current = setTimeout(finish, motion.matches ? 0 : 1100);
    motion.addEventListener("change", onMotionChange);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      motion.removeEventListener("change", onMotionChange);
    };
  }, [closing]);

  function close() {
    if (closeStarted.current) return;
    closeStarted.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setHidden(true);
      return;
    }
    setClosing(true);
  }

  function next() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setClosing(false);
    setHidden(true);
    onNext();
  }

  return (
    <>
      {/* 칠판 오른쪽 손글씨 — 편지 유무와 관계없이 유지 */}
      <p className="sh-hand sh-hand--chalk absolute right-[3.2cqw] top-[36cqh] z-[2] text-right text-[2.6cqh]">
        오늘도
        <br />
        좋은 하루
        <br />
        보내자!
        <br />
        <span className="text-[3cqh]">☺</span>
      </p>

      {hidden || !letter ? (
        <div className={hidden ? "sh-morning-intro-entering" : undefined}>
          <HomeIntro
            title={
              <>
                좋은 아침이야,
                <br />
                <span className="text-[var(--sh-violet-light)]">{studentName}</span>아!
              </>
            }
            subtitle="오늘도 네 마음을 들려줘!"
            onNext={next}
          />
        </div>
      ) : (
        <>
          <TeacherLetter data={letter} closing={closing} onClose={close} />
          <div className="absolute top-[82cqh] left-1/2 z-[4] -translate-x-1/2">
            <CtaButton onClick={next} />
          </div>
        </>
      )}
    </>
  );
}

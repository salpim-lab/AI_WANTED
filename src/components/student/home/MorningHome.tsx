// 담당: 이유민 (Claude 세션)
// 등교 홈.
//  - 처음: 선생님 편지가 중앙에 열려 있고 CTA 는 아래
//  - 편지를 X 로 닫으면: 편지지가 봉투로 들어가고 덮개가 닫힌 뒤 봉투가 아래로 미끄러져 내려간다.
//    인사는 봉투가 내려가는 도중에 겹쳐 떠오른다 — 봉투가 다 사라진 뒤에 뜨면 화면이 뚝 끊긴다.
//  - 동작 값은 letterMotion.ts 한곳에 있다. 개발 중에는 /checkin?tune=1 에서 눈으로 맞출 수 있다.
"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import TeacherLetter, { type LetterData } from "./TeacherLetter";
import HomeIntro from "./HomeIntro";
import CtaButton from "./CtaButton";
import LetterMotionTuner from "./LetterMotionTuner";
import { DEFAULT_LETTER_MOTION, letterExitMs, letterMotionVars, type LetterMotion } from "./letterMotion";

const noopSubscribe = () => () => {};
const readTuneFlag = () =>
  process.env.NODE_ENV !== "production" &&
  new URLSearchParams(window.location.search).get("tune") === "1";

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
  const [motionValues, setMotionValues] = useState<LetterMotion>(DEFAULT_LETTER_MOTION);
  // 개발 전용 조절 패널. 편지가 없는 날에도 데모 편지로 반복해 볼 수 있게 한다.
  // 서버에서는 주소를 모르므로 false 로 그리고, 브라우저에서 주소를 읽어 다시 그린다.
  const tune = useSyncExternalStore(noopSubscribe, readTuneFlag, () => false);
  const [run, setRun] = useState(0);

  const closeStarted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const view: LetterData | null =
    letter ?? (tune ? { teacherName: "담임 선생님", studentName, text: undefined } : null);
  const exitMs = letterExitMs(motionValues);

  useEffect(() => {
    if (!closing) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function finish() {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      setHidden(true);
    }
    function onMotionChange() { if (motion.matches) finish(); }
    // 봉투가 다 내려간 시각. 값은 letterMotion.ts 에서 CSS 와 함께 온다.
    timer.current = setTimeout(finish, motion.matches ? 0 : exitMs);
    motion.addEventListener("change", onMotionChange);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      motion.removeEventListener("change", onMotionChange);
    };
  }, [closing, exitMs]);

  useEffect(
    () => () => {
      if (replayTimer.current !== null) clearTimeout(replayTimer.current);
    },
    [],
  );

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

  /** 조절 패널: 편지를 다시 열고, 열리는 동작이 끝나면 닫는다 */
  function replay() {
    if (replayTimer.current !== null) clearTimeout(replayTimer.current);
    closeStarted.current = false;
    setClosing(false);
    setHidden(false);
    setRun((r) => r + 1);
    replayTimer.current = setTimeout(close, 1400);
  }

  const showIntro = !view || closing || hidden;
  const showLetter = view && !hidden;

  return (
    // display: contents — 자리를 차지하지 않고 CSS 변수만 아래로 내려보낸다
    <div style={{ ...letterMotionVars(motionValues), display: "contents" }}>
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


      {showLetter && (
        <>
          <TeacherLetter key={`letter-${run}`} data={view} closing={closing} onClose={close} />
          <div
            className={`absolute top-[82cqh] left-1/2 z-[4] -translate-x-1/2${closing ? " sh-letter-cta-away" : ""}`}
          >
            <CtaButton onClick={next} />
          </div>
        </>
      )}

      {/* 인사는 편지 뒤에 그려 봉투보다 위 층에 둔다 — 반투명해진 봉투 위로 인사가 겹쳐 떠오른다 */}
      {showIntro && (
        <div key={`intro-${run}`} className={closing || hidden ? "sh-morning-intro-entering" : undefined}>
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
      )}

      {tune && <LetterMotionTuner value={motionValues} onChange={setMotionValues} onReplay={replay} />}
    </div>
  );
}

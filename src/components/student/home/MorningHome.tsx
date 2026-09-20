// 담당: 이유민 (Claude 세션)
// 등교 홈.
//  - 처음: 선생님 편지가 중앙에 열려 있고 CTA("오늘의 마음 이야기하기") 는 아래. 편지에는 닫기(X) 버튼이 없다.
//  - CTA 를 누르면: 편지지가 봉투로 들어가고 덮개가 닫힌 뒤 봉투가 아래로 미끄러져 내려간다.
//    봉투가 아직 내려가는 도중에 마음 신호등 화면이 그 위로 사악 떠오른다(랜딩 화면처럼 아래에서 위로 살짝).
//    봉투는 StudentHome 이 잠시 더 붙들어 두므로 떠오르는 화면 아래에서 마저 내려간다.
//    인사를 다시 띄우지 않는다.
//  - 편지가 없는 날: 인사 화면의 CTA 로 바로 넘어간다.
//  - 동작 값은 letterMotion.ts 한곳에 있다. 개발 중에는 /checkin?tune=1 에서 눈으로 맞출 수 있다.
"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import TeacherLetter, { type LetterData } from "./TeacherLetter";
import HomeIntro from "./HomeIntro";
import CtaButton from "./CtaButton";
import LetterMotionTuner from "./LetterMotionTuner";
import { DEFAULT_LETTER_MOTION, letterExitMs, letterMotionVars, type LetterMotion } from "./letterMotion";

const noopSubscribe = () => () => {};
const MORNING_GREETING_ENTER_MS = 600;
const MORNING_GREETING_HOLD_MS = 1200;
const MORNING_GREETING_FADE_MS = 500;
/** 봉투가 다 내려가기 이만큼 전에 마음 신호등 화면이 떠오르기 시작한다.
    떠오르는 시간(CSS .mood-screen)과 StudentHome 이 봉투를 붙들어 두는 시간(LINGER_MS)보다 짧아야 한다 */
const CROSSFADE_LEAD_MS = 650;
const readTuneFlag = () =>
  process.env.NODE_ENV !== "production" &&
  new URLSearchParams(window.location.search).get("tune") === "1";

export default function MorningHome({
  letter,
  studentName,
  onNext,
}: {
  /** 오늘 보여줄 편지. 교사가 매일 쓰지는 않으므로 null 이 오히려 일반적이다. */
  /** undefined는 불러오는 중, null은 오늘 편지가 없음 */
  letter: LetterData | null | undefined;
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
  const [greetingElapsed, setGreetingElapsed] = useState(false);
  const [introLeaving, setIntroLeaving] = useState(false);
  const [letterStarted, setLetterStarted] = useState(false);
  const [introDismissed, setIntroDismissed] = useState(false);

  const closeStarted = useRef(false);
  /** CTA 로 닫는 중 — 끝나면 다음 화면으로 간다. 조절 패널의 "다시 열고 닫아 보기"는 넘어가지 않는다 */
  const [advancing, setAdvancing] = useState(false);
  // 부모가 onNext 를 매번 새로 만들어도 타이머가 다시 걸리지 않게 최신 값을 ref 로 들고 있는다
  const onNextRef = useRef(onNext);
  useEffect(() => {
    onNextRef.current = onNext;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const waitingForLetter = letter === undefined && !tune;
  const view: LetterData | null =
    letter ?? (tune ? { teacherName: "담임 선생님", studentName, text: undefined } : null);
  const exitMs = letterExitMs(motionValues);
  const hasLetter = view !== null;

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const greetingTimer = setTimeout(
      () => setGreetingElapsed(true),
      MORNING_GREETING_HOLD_MS + (reducedMotion ? 0 : MORNING_GREETING_ENTER_MS),
    );
    return () => clearTimeout(greetingTimer);
  }, []);

  useEffect(() => {
    if (!hasLetter || !greetingElapsed) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startTimer = setTimeout(() => {
      setIntroLeaving(true);
    }, 0);
    const letterTimer = setTimeout(() => {
      setIntroDismissed(true);
      setLetterStarted(true);
    }, reducedMotion ? 0 : MORNING_GREETING_FADE_MS);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(letterTimer);
    };
  }, [greetingElapsed, hasLetter]);

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

  // CTA 로 닫았다면: 봉투가 아직 내려가는 도중에 마음 신호등으로 넘긴다(화면이 그 위로 떠오른다)
  useEffect(() => {
    if (!advancing) return;
    const nextTimer = setTimeout(() => onNextRef.current(), Math.max(0, exitMs - CROSSFADE_LEAD_MS));
    return () => clearTimeout(nextTimer);
  }, [advancing, exitMs]);

  useEffect(
    () => () => {
      if (replayTimer.current !== null) clearTimeout(replayTimer.current);
    },
    [],
  );

  function close(advance = false) {
    if (closeStarted.current) return;
    closeStarted.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setHidden(true);
      if (advance) onNextRef.current();
      return;
    }
    setClosing(true);
    if (advance) setAdvancing(true);
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
    setAdvancing(false);
    setHidden(false);
    setRun((r) => r + 1);
    // 편지지가 다 올라온 다음(2.4s)에 닫는다
    replayTimer.current = setTimeout(() => close(), 2700);
  }

  const showPrelude =
    !introDismissed && !closing && !hidden && (waitingForLetter || hasLetter);
  // 편지가 있는 날은 편지를 닫으면 바로 다음 화면으로 가므로 인사 화면을 다시 띄우지 않는다
  const showIntro = !waitingForLetter && !view;
  const showLetter = view && letterStarted && !hidden;

  return (
    // display: contents — 자리를 차지하지 않고 CSS 변수만 아래로 내려보낸다
    <div style={{ ...letterMotionVars(motionValues), display: "contents" }}>
      {/* 칠판 오른쪽 손글씨 — 편지 유무와 관계없이 유지 */}
      {/* 편지를 닫기 시작하면 먼저 사라진다. 마음 신호등 화면이 떠오른 뒤까지 남아 있으면 그 위에 늦게 빠져 보였다 */}
      <p
        className={`sh-hand sh-hand--chalk absolute right-[3.2cqw] top-[36cqh] z-[2] text-right text-[2.6cqh]${closing || hidden ? " sh-hand--away" : ""}`}
      >
        오늘도
        <br />
        좋은 하루
        <br />
        보내자!
        <br />
        <span className="text-[3cqh]">☺</span>
      </p>

      {/* 첫 진입에서는 인사만 읽히고, 인사가 사라진 뒤 편지가 등장한다. */}
      {showPrelude && (
        <div className={`sh-intro sh-morning-prelude${introLeaving ? " sh-morning-prelude--away" : ""}`}>
          <h1 className="sh-cute text-[8cqh] leading-[1.3] tracking-tight text-[var(--sh-navy)]">
            좋은 아침이야,
            <br />
            <span className="text-[var(--sh-violet-light)]">{studentName}</span>아!
          </h1>
          <p className="mt-[2cqh] text-[3.2cqh] font-bold text-[var(--sh-muted)]">
            오늘도 만나서 반가워!
          </p>
        </div>
      )}


      {showLetter && (
        <>
          <TeacherLetter key={`letter-${run}`} data={view} closing={closing} />
          <div
            className={`absolute top-[82cqh] left-1/2 z-[4] -translate-x-1/2 ${closing ? "sh-letter-cta-away" : "sh-letter-cta-in"}`}
          >
            {/* 누르면 편지를 닫는 동작을 먼저 하고, 봉투가 내려간 뒤 마음 신호등으로 넘어간다 */}
            <CtaButton onClick={() => close(true)} />
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

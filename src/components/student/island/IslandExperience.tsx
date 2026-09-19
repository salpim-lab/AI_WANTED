"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createHeldWalk } from "./heldWalk";
import type { CameraPreset, GiftKind, IslandGift, PlacementPhase, PlacementProposal, SceneHandle, ViewMode } from "./types";

const IslandScene = dynamic(() => import("./IslandScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center bg-[#dceee5] text-sm text-[#557564]">섬을 준비하고 있어요…</div>,
});

type IconName = "leaf" | "puzzle" | "sun" | "rotate" | "top" | "plus" | "minus" | "home" | "left" | "right" | "up" | "down" | "turn" | "person" | "star";

function Icon({ name, size = 20, className = "" }: { name: IconName; size?: number; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    leaf: <path d="M12 21v-9M12 15C4 16 3 10 3 6c6-1 10 2 9 9ZM12 11c-1-6 3-9 9-8 0 6-3 10-9 8Z"/>,
    puzzle: <path d="M9 3H4a1 1 0 0 0-1 1v5c4-3 6 4 0 3v8a1 1 0 0 0 1 1h5c-2-5 5-5 4 0h7a1 1 0 0 0 1-1v-6c-5 2-5-5 0-4V4a1 1 0 0 0-1-1h-6c3 5-5 5-5 0Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></>,
    rotate: <path d="M20 7v5h-5M4 17v-5h5M5.5 7a7.5 7.5 0 0 1 13 0l1.5 5M4 12l1.5 5a7.5 7.5 0 0 0 13 0"/>,
    top: <path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    minus: <path d="M5 12h14"/>,
    home: <path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/>,
    left: <path d="m14 6-6 6 6 6"/>,
    right: <path d="m10 6 6 6-6 6"/>,
    up: <path d="m6 14 6-6 6 6"/>,
    down: <path d="m6 10 6 6 6-6"/>,
    person: <><circle cx="12" cy="7.5" r="3.5"/><path d="M5 20.5a7 7 0 0 1 14 0"/></>,
    turn: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{paths[name]}</svg>;
}

// 방향키 꺽새·사람 테두리: 모양대로 잘라 낸 반투명 유리 — 뒤의 섬이 흐릿하게 비친다.
const glassMask = (d: string, width = 4.2) => { const url = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='${width}' stroke-linecap='round' stroke-linejoin='round'><path d='${d}'/></svg>`)}")`; return { maskImage: url, WebkitMaskImage: url }; };
const personOutline = "M8.5 7.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M5 20.5a7 7 0 0 1 14 0";

type Props = {
  flow?: "checkin" | "checkout";
  preparing?: boolean;
  compact?: boolean;
  studentName?: string;
  incomingItem?: { emoji: string; name: string; reason: string; assetFormat?: "glb" | "procedural"; geometrySpec?: unknown } | null;
  baseItemCount?: number;
  /** Items already on the island (rendered and used for spacing checks). */
  placedGifts?: IslandGift[];
  onComplete?: (placed: IslandGift | null) => void;
};

const NO_GIFTS: IslandGift[] = [];
const WAITING_MESSAGES = [
  "선물이 준비되면 놓기 버튼이 켜질 거야.",
  "화면을 움직여서 섬을 둘러봐!",
  "선물을 놓고 싶은 자리를 골라 볼까?",
  "멀리 보고 싶으면 - 버튼을 눌러 봐!",
  "바닷가와 나무 옆, 어디가 더 좋을까?",
  "위에서 보면 섬이 또 다르게 보여!",
] as const;

export default function IslandExperience({ flow = "checkin", compact = false, studentName = "민준", incomingItem = null, baseItemCount = 0, placedGifts = NO_GIFTS, preparing = false, onComplete }: Props) {
  const acquired = {
    kind: "star" as GiftKind,
    emoji: incomingItem?.emoji ?? "⭐",
    name: incomingItem?.name ?? "반짝이는 별",
    description: incomingItem?.reason ?? "오늘의 이야기가 담긴 선물",
    assetFormat: incomingItem?.assetFormat,
    geometrySpec: incomingItem?.geometrySpec,
  };
  const [mode, setMode] = useState<ViewMode>("island");
  const [gifts, setGifts] = useState<IslandGift[]>([]);
  const [selected, setSelected] = useState<GiftKind | null>(null);
  const [proposal, setProposal] = useState<PlacementProposal | null>(null);
  const [phase, setPhase] = useState<PlacementPhase>("ready");
  const [cameraView, setCameraView] = useState<"free" | "top">("free");
  const [overview, setOverview] = useState(false);
  const [waitingTick, setWaitingTick] = useState(0);
  const [placementInteractionStarted, setPlacementInteractionStarted] = useState(false);
  const [placementNotice, setPlacementNotice] = useState<string | null>(null);
  const [homeGreeting, setHomeGreeting] = useState<"none" | "greeting" | "closed">("none");
  const [completionNoticeVisible, setCompletionNoticeVisible] = useState(true);
  const [entryStage, setEntryStage] = useState<"intro" | "cta" | "exiting" | "popping" | "placement">("intro");
  const sceneRef = useRef<SceneHandle>(null);
  const timersRef = useRef<number[]>([]);
  const [heldWalk] = useState(() => createHeldWalk());
  const giftId = useRef(0);
  const hasIncomingItem = incomingItem !== null;

  useEffect(() => {
    if (preparing || !hasIncomingItem) return;
    const timer = window.setTimeout(() => setCompletionNoticeVisible(false), 3_000);
    return () => window.clearTimeout(timer);
  }, [preparing, hasIncomingItem]);

  useEffect(() => {
    if (!preparing) return;
    const timer = window.setInterval(() => setWaitingTick(tick => tick + 1), 5_000);
    return () => window.clearInterval(timer);
  }, [preparing]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(window.clearTimeout);
    };
  }, []);

  const after = (delay: number, callback: () => void) => {
    const timer = window.setTimeout(callback, delay);
    timersRef.current.push(timer);
  };

  const propose = useCallback((kind: GiftKind, x: number, z: number, alreadyAtPosition = false) => {
    if (phase !== "choosing" && phase !== "confirming") return;
    // The placed item must keep its procedural spec, or it falls back to the preset star.
    setProposal({ kind, name: acquired.name, x, z, assetFormat: acquired.assetFormat, geometrySpec: acquired.geometrySpec });
    setPhase(alreadyAtPosition ? "confirming" : "moving");
  }, [acquired.name, acquired.assetFormat, acquired.geometrySpec, phase]);

  const arrive = useCallback(() => {
    setPhase((current) => current === "moving" ? "confirming" : current);
  }, []);

  // The character picks up the dropped item and carries it on its head.
  function startPlacement() {
    if (preparing || phase !== "ready" || entryStage !== "cta" || baseItemCount > 0) return;
    setPlacementInteractionStarted(false);
    setPlacementNotice(null);
    setEntryStage("exiting");
    after(200, () => {
      setEntryStage("popping");
      setPhase("choosing");
      after(400, () => {
        setSelected(acquired.kind);
        setEntryStage("placement");
      });
    });
  }

  function cancelPlacement() {
    if (phase !== "choosing" && phase !== "confirming") return;
    setProposal(null);
    setSelected(null);
    setPhase("ready");
    setEntryStage("cta");
    setOverview(false);
    window.setTimeout(() => sceneRef.current?.camera("home"), 0);
  }

  function confirmPlacement() {
    if (!proposal || phase !== "confirming") return;
    setSelected(null);
    setPhase("placing");
    setOverview(false);
    setEntryStage("placement");
  }

  function finishPuttingDown() {
    if (!proposal || phase !== "placing") return;
    setGifts((current) => [...current, { ...proposal, id: `gift-${++giftId.current}` }]);
    setPlacementNotice(null);
    setPhase("returning");
  }

  function chooseAgain() {
    setPlacementInteractionStarted(false);
    setPlacementNotice(null);
    setProposal(null);
    setSelected(acquired.kind);
    setPhase("choosing");
  }

  function retryHomecoming() {
    if (phase !== "farewell") return;
    setPhase("returning");
    setOverview(false);
  }

  function completeHomecoming() {
    setPhase("complete");
    onComplete?.(gifts.at(-1) ?? null);
  }

  function camera(preset: CameraPreset) {
    sceneRef.current?.camera(preset);
    if (preset === "top") setCameraView("top");
    if (preset === "home" || preset === "character") setCameraView("free");
  }

  function changeMode(next: ViewMode) {
    if (phase === "moving" || phase === "confirming" || phase === "placing" || phase === "farewell" || phase === "returning") return;
    setMode(next);
    setCameraView("free");
    setSelected(next === "island" && phase === "choosing" ? acquired.kind : null);
  }

  useEffect(() => heldWalk.listen(window, document, (key, pressed, seconds) => sceneRef.current?.walk(key, pressed, seconds)), [heldWalk]);
  const button = "inline-flex items-center justify-center gap-2 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5a52f0] disabled:cursor-not-allowed disabled:opacity-40";
  const placementActive = phase === "moving" || phase === "confirming" || phase === "placing" || phase === "farewell" || phase === "returning" || entryStage === "popping" || entryStage === "exiting";
  const hasPlacedItem = baseItemCount > 0 || gifts.length > 0;
  const sceneGifts = useMemo(() => placedGifts.length ? [...placedGifts, ...gifts] : gifts, [placedGifts, gifts]);
  const showPlacementCta = mode === "island" && phase === "ready" && (entryStage === "cta" || entryStage === "exiting") && !hasPlacedItem;
  // Once the door closes the island zooms out on its own; the camera buttons go with it.
  const showSceneControls = (mode === "classroom" || entryStage !== "intro") && homeGreeting !== "closed";
  // Bottom card = needs a tap; everything else is a top notice.
  const showBottomCard = mode === "island" && phase === "farewell";
  const progressNotice = phase === "placing" ? ["아이템을 내려놓는 중…", "여기에 잘 놓아둘게!"]
    : phase === "returning" ? homeGreeting === "closed" ? null : homeGreeting === "greeting" ? [flow === "checkin" ? "이따 봐! 👋" : "내일 또 봐! 👋", null] : [`${acquired.name} 배치 완료!`, placementNotice ?? "집으로 돌아가는 중…"]
    : null;

  return <div lang="ko" className={`island-experience ${compact ? "island-compact flex min-h-0 flex-1 flex-col text-[#2f3560]" : "min-h-dvh bg-[#f7f8f2] text-[#294638] [font-family:'Apple_SD_Gothic_Neo','Malgun_Gothic',sans-serif]"} [&_button]:cursor-pointer`}>
    {!compact && <header className="border-b border-[#e1e7dc] bg-[#fcfcf7]">
      <div className="mx-auto flex h-[82px] max-w-[1440px] items-center justify-between gap-4 px-6 lg:px-12">
        <a href="/island" className="flex items-center gap-3" aria-label="살핌 나의 섬"><span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#2b7657] text-[#f9f8e9]"><Icon name="leaf" size={25}/></span><span className="text-[25px] font-extrabold tracking-[-1.5px]">살핌</span><span className="ml-2 hidden border-l border-[#dce2d8] pl-4 text-[12px] text-[#859083] sm:block">마음이 자라는 작은 섬</span></a>
        <nav className="flex items-center gap-1 rounded-full bg-[#edf0e7] p-1" aria-label="섬 둘러보기">
          <button disabled={placementActive} onClick={() => changeMode("island")} aria-pressed={mode === "island"} className={`${button} px-4 py-2.5 text-[13px] font-semibold ${mode === "island" ? "bg-white text-[#2c6d4f] shadow-sm" : "text-[#7e8a7d]"}`}><Icon name="home" size={16}/>나의 섬</button>
          <button disabled={placementActive} onClick={() => changeMode("classroom")} aria-pressed={mode === "classroom"} className={`${button} px-4 py-2.5 text-[13px] font-semibold ${mode === "classroom" ? "bg-white text-[#2c6d4f] shadow-sm" : "text-[#7e8a7d]"}`}><Icon name="puzzle" size={16}/>우리 반 섬</button>
        </nav>
        <div className="hidden items-center gap-2.5 md:flex"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#f1e8c9] text-[#a18b49]"><Icon name="sun" size={21}/></span><span className="text-sm font-semibold">{studentName}<span className="ml-1 font-normal text-[#8e9788]">의 공간</span></span></div>
      </div>
    </header>}

    <main className={compact ? "flex min-h-0 flex-1 flex-col" : "mx-auto max-w-[1440px] px-2 pb-8 pt-9 sm:px-8 lg:px-12"}>
      {!compact && <div className="mb-7 px-3 sm:px-0 flex items-end justify-between gap-4"><div>
        <p className="mb-2.5 text-[10px] font-bold tracking-[0.25em] text-[#83957d]">MY LITTLE ISLAND</p>
        <h1 className="text-[25px] font-bold leading-snug tracking-[-1.1px] sm:text-[31px]">{mode === "island" ? "이야기로 채워 갈, 나의 섬" : "우리의 섬이 만나면"}<span className="ml-2 text-[#a9b97c]">.</span></h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[#879182]">{mode === "island" ? "하루 두 개의 이야기가 쌓여도 넉넉한, 한 학기 동안의 섬이야." : "서로 다른 이야기가 모여, 하나의 커다란 우리 반 섬이 돼요."}</p>
      </div><span className="mb-1 hidden items-center gap-2 rounded-full border border-[#e1e6d7] bg-[#f0f3e8] px-4 py-2.5 text-[11px] text-[#7d8c6f] sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-[#96ac75]"/>{mode === "island" ? phase === "complete" ? "오늘의 배치 완료" : "오늘의 아이템 배치 중" : "학기말 모아 보기 · 미리 보기"}</span></div>}

      <section className={`relative isolate overflow-hidden ${flow === "checkout" ? "bg-[#f6a06b]" : "bg-[#dceee5]"} ${compact ? "min-h-0 flex-1" : "island-viewport-panel rounded-[26px] border border-[#d6e3d7]"}`} aria-label="3D 떠 있는 섬">
        <IslandScene
          mode={mode}
          sunset={flow === "checkout"}
          gifts={sceneGifts}
          incomingAsset={{ name: acquired.name, assetFormat: acquired.assetFormat, geometrySpec: acquired.geometrySpec }}
          itemReady={!preparing && baseItemCount === 0}
          itemBubble={showPlacementCta && !preparing && <>
            <p className="text-[14px] font-bold tracking-[-0.35px] break-keep">{`${acquired.emoji} ${acquired.name}`}</p>
            <p className="mt-0.5 whitespace-pre-line break-keep font-[family-name:var(--font-hand)] text-[15px]">{(incomingItem?.reason ?? "오늘 받은 아이템을 섬에 놓아 볼까?").replace(/,\s*/g, ",\n")}</p>
            <button onClick={startPlacement} disabled={entryStage === "exiting"} className="mt-2 h-[30px] w-full rounded-full bg-[#5a52f0] px-2.5 text-[12px] font-semibold text-white disabled:opacity-40">내 섬에 놓기</button>
          </>}
          selected={selected}
          proposal={proposal}
          phase={phase}
          onPropose={propose}
          onArrive={arrive}
          onChooseAgain={chooseAgain}
          onConfirm={confirmPlacement}
          onItemPlaced={finishPuttingDown}
          onRetryHome={retryHomecoming}
          onHomeEntered={completeHomecoming}
          onHomeBlocked={() => { setPhase("farewell"); setPlacementNotice("집으로 가는 길을 찾지 못했어. 다시 눌러 줘!"); }}
          controlsRef={sceneRef}
          onOverviewChange={setOverview}
          onPlacementNoticeChange={setPlacementNotice}
          onHomeGreetingChange={setHomeGreeting}
          onPlacementInteraction={() => setPlacementInteractionStarted(true)}
          onIntroComplete={() => setEntryStage((current) => current === "intro" ? "cta" : current)}
        />

        {!compact && <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-6">
          <div><div className="mb-1.5 flex items-center gap-2 text-[10px] font-medium tracking-[0.06em] text-[#345f56]"><span className="h-1.5 w-1.5 rounded-full bg-[#7fa886]"/>{mode === "island" ? "구름 위에 떠 있는, 작은 숲과 꽃의 섬" : "20조각으로 보는 우리 반 섬"}</div><h2 className={`text-[23px] font-bold tracking-[-0.7px] text-[#345845]`}>{mode === "island" ? `${studentName}이의 섬` : "함께 만드는 우리"}</h2></div>
          <div className="flex flex-col items-end gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-white/60 bg-white/60 px-3 py-1.5 text-[11px] text-[#6f8c78]"><Icon name={mode === "island" ? "leaf" : "puzzle"} size={14}/>{mode === "island" ? `${baseItemCount + sceneGifts.length}개의 이야기` : "학기말 미리 보기"}</span>
            {mode === "island" && phase !== "complete" && <span title={acquired.description} className="flex items-center gap-2 rounded-full border border-[#eadfbf] bg-[#fffaf0]/90 px-3 py-1.5 text-[11px] font-semibold text-[#75643d]"><span>{acquired.emoji}</span>{acquired.name}</span>}
          </div>
        </div>}

        {!compact && phase !== "moving" && entryStage !== "intro" && <div className="absolute left-6 top-[96px] z-10 hidden sm:flex rounded-full border border-white/50 bg-[#ecf4ed]/75 p-1 backdrop-blur-sm">
          <button onClick={() => camera("home")} aria-pressed={cameraView === "free"} className={`${button} px-3 py-1.5 text-[11px] ${cameraView === "free" ? "bg-white text-[#456b50] shadow-sm" : "text-[#829480]"}`}><Icon name="rotate" size={13}/>자유롭게 둘러보기</button>
          <button onClick={() => camera("top")} aria-pressed={cameraView === "top"} className={`${button} px-3 py-1.5 text-[11px] ${cameraView === "top" ? "bg-white text-[#456b50] shadow-sm" : "text-[#829480]"}`}><Icon name="top" size={13}/>위에서 보기</button>
        </div>}

        {mode === "classroom" && <div className="pointer-events-none absolute inset-x-0 bottom-8 z-10 text-center text-xs text-[#688774]">한 학기가 끝나면 친구들의 섬이 한 하늘에 모여요.</div>}

        {mode === "island" && ((phase === "choosing" && !placementInteractionStarted) || progressNotice || preparing || (phase === "ready" && incomingItem && completionNoticeVisible)) && <div className={`pointer-events-none absolute inset-x-3 z-30 mx-auto flex w-fit max-w-[calc(100%-24px)] items-center px-4 text-center text-black font-[family-name:var(--font-cute)] font-normal top-[22%]`} role="status" aria-live="polite">
          <div className="relative min-w-0"><p className="text-[clamp(24px,4cqh,34px)] font-normal tracking-[-0.35px] break-keep">{phase === "choosing" ? `${acquired.name} 놓을 자리를 골라 줘!` : progressNotice ? progressNotice[0] : preparing ? waitingTick >= 6 ? "생각보다 준비가 오래 걸리고 있어" : "아이템 생성 중…" : `${acquired.name} 생성 완료!`}</p><div className="absolute inset-x-0 top-full">{phase === "choosing" && placementNotice && <p className="mt-0.5 text-[clamp(16px,2.5cqh,21px)] font-normal text-black">{placementNotice}</p>}{progressNotice?.[1] && <p className="relative left-1/2 mt-0.5 w-max -translate-x-1/2 whitespace-nowrap text-[clamp(16px,2.5cqh,21px)] text-black">{progressNotice[1]}</p>}{preparing && phase !== "choosing" && !progressNotice && <p className="relative left-1/2 mt-0.5 w-max -translate-x-1/2 whitespace-nowrap text-[clamp(16px,2.5cqh,21px)] text-black">{WAITING_MESSAGES[waitingTick % WAITING_MESSAGES.length]}</p>}</div></div>
        </div>}

        {phase !== "moving" && showSceneControls && <div className={`pointer-events-none [&>button]:pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex flex-col items-start gap-4 ${showBottomCard ? "max-[900px]:bottom-[76px]" : ""} ${compact ? "px-3 pb-3 pt-6" : "px-5 pb-5 pt-10"}`}>
          <div className="flex flex-col items-center gap-2">
            {mode === "island" && (phase === "ready" || phase === "choosing" || phase === "confirming") && <div className="pointer-events-auto grid grid-cols-3 grid-rows-3" role="group" aria-label={`${studentName} 움직이기`}>
              {([ ["ArrowUp", "m6 15 6-6 6 6", "위로", "col-start-2 row-start-1"], ["ArrowLeft", "m15 6-6 6 6 6", "왼쪽으로", "col-start-1 row-start-2"], ["ArrowRight", "m9 6 6 6-6 6", "오른쪽으로", "col-start-3 row-start-2"], ["ArrowDown", "m6 9 6 6 6-6", "아래로", "col-start-2 row-start-3"] ] as [string, string, string, string][]).map(([key, chevron, label, place]) => <button key={key} title={label} aria-label={label} onPointerDown={(event) => { event.preventDefault(); heldWalk.press(key, event.pointerId); event.currentTarget.setPointerCapture(event.pointerId); }} onContextMenu={(event) => event.preventDefault()} className={`${place} group h-16 w-16 touch-none select-none transition-transform active:scale-90 max-sm:h-12 max-sm:w-12`}><span className="block h-full w-full bg-white/45 backdrop-blur-md backdrop-saturate-150 transition-colors group-hover:bg-white/65" style={glassMask(chevron)}/></button>)}
              <span className="col-start-2 row-start-2 grid place-items-center"><button title={`${studentName} 보기`} aria-label={`${studentName} 보기`} onClick={() => camera("character")} className="group h-10 w-10 rounded-full transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5a52f0] active:scale-90 max-sm:h-8 max-sm:w-8"><span className="block h-full w-full bg-white/45 backdrop-blur-md backdrop-saturate-150 transition-colors group-hover:bg-white/65" style={glassMask(personOutline, 2.2)}/></button></span>
            </div>}
            <div className="pointer-events-auto flex items-center gap-1.5" role="group" aria-label="확대 / 축소 · 시점 조작">
              {([ ["in", "plus", "확대", ""], ["out", "minus", "축소", ""], ["left", "turn", "왼쪽으로 회전", ""], ["right", "turn", "오른쪽으로 회전", "-scale-x-100"], ["top", "top", "위에서 보기", ""] ] as [CameraPreset, IconName, string, string][]).map(([preset, icon, label, flip]) => <button key={preset} title={label} aria-label={label} onClick={() => camera(preset)} className={`${button} h-9 w-9 border border-white/60 bg-white/35 text-[#3f4863] backdrop-blur-md backdrop-saturate-150 hover:bg-white/60 max-sm:h-8 max-sm:w-8`}><Icon name={icon} size={17} className={flip}/></button>)}
            </div>
          </div>
          {mode === "island" && (phase === "choosing" || phase === "confirming") && entryStage === "placement" && <button onClick={cancelPlacement} className="absolute right-4 bottom-5 rounded-full bg-white/85 px-3 py-1.5 text-[11px] text-[#5b6478]">배치 취소</button>}
          {mode === "island" && phase === "choosing" && entryStage === "placement" && <button onClick={() => sceneRef.current?.toggleOverview()} className="absolute right-4 bottom-14 rounded-full bg-white/85 px-3 py-1.5 text-[11px] text-[#5b6478]">{overview ? "캐릭터 보기" : "전체 보기"}</button>}
        </div>}
      </section>

      {!compact && <footer className="mt-6 flex flex-col items-center justify-between gap-4 px-1 text-[11px] text-[#a0a68f] sm:flex-row"><p className="flex items-center gap-2"><Icon name="leaf" size={14}/>한 학기 동안 매일의 이야기가 이 섬에 차곡차곡 쌓여요.</p><span className="flex items-center gap-4 text-[10px]"><span>드래그 · 시점 이동</span><span className="h-2.5 w-px bg-[#d7ddcc]"/><span>스크롤 · 확대 / 축소</span></span></footer>}
    </main>
  </div>;
}

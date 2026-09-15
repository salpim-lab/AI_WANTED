"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraPreset, GiftKind, IslandGift, IslandScreenRect, PlacementPhase, PlacementProposal, SceneHandle, ViewMode } from "./types";

const IslandScene = dynamic(() => import("./IslandScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center bg-[#dceee5] text-sm text-[#557564]">섬을 준비하고 있어요…</div>,
});

type IconName = "leaf" | "puzzle" | "sun" | "rotate" | "top" | "plus" | "minus" | "home" | "left" | "right" | "hand" | "star";

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
    hand: <path d="M8 12V5a2 2 0 0 1 4 0v6-7a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 4-2 6-6 6h-2c-2 0-3-1-4-3l-4-5c-1-2 1-4 3-2l1 1Z"/>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{paths[name]}</svg>;
}

type Props = {
  compact?: boolean;
  studentName?: string;
  incomingItem?: { emoji: string; name: string; reason: string } | null;
  baseItemCount?: number;
  onComplete?: () => void;
};

export default function IslandExperience({ compact = false, studentName = "민준", incomingItem = null, baseItemCount = 0, onComplete }: Props) {
  const acquired = {
    kind: "star" as GiftKind,
    emoji: incomingItem?.emoji ?? "⭐",
    name: incomingItem?.name ?? "반짝이는 별",
    description: incomingItem?.reason ?? "오늘의 이야기가 담긴 선물",
  };
  const [mode, setMode] = useState<ViewMode>("island");
  const [gifts, setGifts] = useState<IslandGift[]>([]);
  const [selected, setSelected] = useState<GiftKind | null>(null);
  const [proposal, setProposal] = useState<PlacementProposal | null>(null);
  const [phase, setPhase] = useState<PlacementPhase>("ready");
  const [cameraView, setCameraView] = useState<"free" | "top">("free");
  const [entryStage, setEntryStage] = useState<"intro" | "cta" | "exiting" | "popping" | "placement">("intro");
  const [showHandHint, setShowHandHint] = useState(false);
  const [islandRect, setIslandRect] = useState<IslandScreenRect | null>(null);
  const [toolbarTop, setToolbarTop] = useState(0);
  const [panelHeight, setPanelHeight] = useState(760);
  const sceneRef = useRef<SceneHandle>(null);
  const panelRef = useRef<HTMLElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);
  const giftId = useRef(0);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(window.clearTimeout);
  }, []);

  const after = (delay: number, callback: () => void) => {
    const timer = window.setTimeout(callback, delay);
    timersRef.current.push(timer);
  };

  const measureToolbar = useCallback(() => {
    const panel = panelRef.current?.getBoundingClientRect();
    const toolbar = toolbarRef.current?.getBoundingClientRect();
    if (panel) setPanelHeight(panel.height);
    if (panel && toolbar) setToolbarTop(toolbar.top - panel.top);
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver(measureToolbar);
    if (panelRef.current) observer.observe(panelRef.current);
    if (toolbarRef.current) observer.observe(toolbarRef.current);
    measureToolbar();
    return () => observer.disconnect();
  }, [measureToolbar, mode, entryStage]);

  const propose = useCallback((kind: GiftKind, x: number, z: number) => {
    if (phase !== "choosing" && phase !== "confirming") return;
    setProposal({ kind, name: acquired.name, x, z });
    setPhase("moving");
  }, [acquired.name, phase]);

  const arrive = useCallback(() => {
    setPhase((current) => current === "moving" ? "confirming" : current);
  }, []);

  // The character pops onto the island holding today's item.
  function startPlacement() {
    if (phase !== "ready" || entryStage !== "cta" || baseItemCount > 0) return;
    setShowHandHint(false);
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
  }

  function confirmPlacement() {
    if (!proposal || phase !== "confirming") return;
    setGifts((current) => [...current, { ...proposal, id: `gift-${++giftId.current}` }]);
    setSelected(null);
    setPhase("farewell");
    setEntryStage("placement");
  }

  function chooseAgain() {
    setProposal(null);
    setSelected(acquired.kind);
    setPhase("choosing");
  }

  function finishPlacement() {
    if (phase !== "farewell") return;
    setPhase("complete");
    onComplete?.();
  }

  function camera(preset: CameraPreset) {
    sceneRef.current?.camera(preset);
    if (preset === "top") setCameraView("top");
    if (preset === "home") setCameraView("free");
  }

  function changeMode(next: ViewMode) {
    if (phase === "moving" || phase === "confirming" || phase === "farewell") return;
    setMode(next);
    setCameraView("free");
    setSelected(next === "island" && phase === "choosing" ? acquired.kind : null);
  }

  const button = "inline-flex items-center justify-center gap-2 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2d7255] disabled:cursor-not-allowed disabled:opacity-40";
  const placementActive = phase === "moving" || phase === "confirming" || phase === "farewell" || entryStage === "popping" || entryStage === "exiting";
  const hasPlacedItem = baseItemCount > 0 || gifts.length > 0;
  const showPlacementCta = mode === "island" && phase === "ready" && (entryStage === "cta" || entryStage === "exiting") && !hasPlacedItem;
  const showSceneControls = mode === "classroom" || entryStage !== "intro";
  const ctaHeight = 84;
  const toolbarLimit = toolbarTop || panelHeight - 70;
  const ctaTop = Math.max(8, Math.min(Math.max((islandRect?.bottom ?? panelHeight * 0.72) + 10, 0), toolbarLimit - ctaHeight - 12));

  useEffect(() => {
    if (!showPlacementCta) return;
    const timer = window.setTimeout(() => setShowHandHint(true), 4000);
    return () => window.clearTimeout(timer);
  }, [showPlacementCta]);

  return <div lang="ko" className={`island-experience ${compact ? "island-compact flex min-h-0 flex-1 flex-col" : "min-h-dvh"} bg-[#f7f8f2] text-[#294638] [font-family:'Apple_SD_Gothic_Neo','Malgun_Gothic',sans-serif] [&_button]:cursor-pointer`}>
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

    <main className={compact ? "flex min-h-0 flex-1 flex-col p-3" : "mx-auto max-w-[1440px] px-2 pb-8 pt-9 sm:px-8 lg:px-12"}>
      {!compact && <div className="mb-7 px-3 sm:px-0 flex items-end justify-between gap-4"><div>
        <p className="mb-2.5 text-[10px] font-bold tracking-[0.25em] text-[#83957d]">MY LITTLE ISLAND</p>
        <h1 className="text-[25px] font-bold leading-snug tracking-[-1.1px] sm:text-[31px]">{mode === "island" ? "이야기로 채워 갈, 나의 섬" : "우리의 섬이 만나면"}<span className="ml-2 text-[#a9b97c]">.</span></h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[#879182]">{mode === "island" ? "하루 두 개의 이야기가 쌓여도 넉넉한, 한 학기 동안의 섬이야." : "서로 다른 이야기가 모여, 하나의 커다란 우리 반 섬이 돼요."}</p>
      </div><span className="mb-1 hidden items-center gap-2 rounded-full border border-[#e1e6d7] bg-[#f0f3e8] px-4 py-2.5 text-[11px] text-[#7d8c6f] sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-[#96ac75]"/>{mode === "island" ? phase === "complete" ? "오늘의 배치 완료" : "오늘의 아이템 배치 중" : "학기말 모아 보기 · 미리 보기"}</span></div>}

      <section ref={panelRef} data-island-bottom={islandRect?.bottom} className={`relative isolate overflow-hidden rounded-[26px] border border-[#d6e3d7] bg-[#dceee5] ${compact ? "min-h-0 flex-1" : "island-viewport-panel"}`} aria-label="3D 떠 있는 섬">
        <IslandScene
          mode={mode}
          gifts={gifts}
          selected={selected}
          proposal={proposal}
          phase={phase}
          itemName={acquired.name}
          onPropose={propose}
          onArrive={arrive}
          onChooseAgain={chooseAgain}
          onConfirm={confirmPlacement}
          onFinish={finishPlacement}
          controlsRef={sceneRef}
          onIslandScreenRect={setIslandRect}
          onIntroComplete={() => setEntryStage((current) => current === "intro" ? "cta" : current)}
        />

        <div className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 ${compact ? "p-4" : "p-6"}`}>
          <div><div className="mb-1.5 flex items-center gap-2 text-[10px] font-medium tracking-[0.06em] text-[#345f56]"><span className="h-1.5 w-1.5 rounded-full bg-[#7fa886]"/>{mode === "island" ? "구름 위에 떠 있는, 작은 숲과 꽃의 섬" : "20조각으로 보는 우리 반 섬"}</div><h2 className={`${compact ? "text-lg" : "text-[23px]"} font-bold tracking-[-0.7px] text-[#345845]`}>{mode === "island" ? `${studentName}이의 섬` : "함께 만드는 우리"}</h2></div>
          <div className="flex flex-col items-end gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-white/60 bg-white/60 px-3 py-1.5 text-[11px] text-[#6f8c78]"><Icon name={mode === "island" ? "leaf" : "puzzle"} size={14}/>{mode === "island" ? `${baseItemCount + gifts.length}개의 이야기` : "학기말 미리 보기"}</span>
            {mode === "island" && phase !== "complete" && <span title={acquired.description} className="flex items-center gap-2 rounded-full border border-[#eadfbf] bg-[#fffaf0]/90 px-3 py-1.5 text-[11px] font-semibold text-[#75643d]"><span>{acquired.emoji}</span>{acquired.name}</span>}
          </div>
        </div>

        {!compact && phase !== "moving" && entryStage !== "intro" && <div className="absolute left-6 top-[96px] z-10 hidden sm:flex rounded-full border border-white/50 bg-[#ecf4ed]/75 p-1 backdrop-blur-sm">
          <button onClick={() => camera("home")} aria-pressed={cameraView === "free"} className={`${button} px-3 py-1.5 text-[11px] ${cameraView === "free" ? "bg-white text-[#456b50] shadow-sm" : "text-[#829480]"}`}><Icon name="rotate" size={13}/>자유롭게 둘러보기</button>
          <button onClick={() => camera("top")} aria-pressed={cameraView === "top"} className={`${button} px-3 py-1.5 text-[11px] ${cameraView === "top" ? "bg-white text-[#456b50] shadow-sm" : "text-[#829480]"}`}><Icon name="top" size={13}/>위에서 보기</button>
        </div>}

        {mode === "classroom" && <div className="pointer-events-none absolute inset-x-0 bottom-8 z-10 text-center text-xs text-[#688774]">한 학기가 끝나면 친구들의 섬이 한 하늘에 모여요.</div>}

        {showPlacementCta && <div className={`island-cta-enter absolute inset-x-0 z-20 flex flex-col items-center gap-1 ${entryStage === "exiting" ? "island-cta-exit" : ""}`} style={{ top: ctaTop }}>
          <p className="rounded-full bg-white/72 px-3 py-1 text-[12px] font-semibold text-[#527463] shadow-sm backdrop-blur-sm">여기를 눌러서 시작해 봐!</p>
          <div className="relative">
            {showHandHint && <Icon name="hand" size={31} className="island-cta-hand absolute -right-5 -top-5 text-[#3d7659]"/>}
            <button onClick={startPlacement} disabled={entryStage === "exiting"} className={`${button} island-cta-button h-[52px] min-w-[242px] whitespace-nowrap bg-[#347657] px-5 text-[16px] font-bold text-white shadow-[0_8px_22px_#34765738] hover:bg-[#2c6a4d]`}>🌱 내 섬에 아이템 놓기</button>
          </div>
        </div>}

        {phase !== "moving" && showSceneControls && <div className={`absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-4 bg-gradient-to-t from-[#dceee5]/82 to-transparent ${compact ? "pb-3 pt-6" : "pb-5 pt-10"}`}>
          {mode === "island" && phase === "choosing" && entryStage === "placement" && <p className="pointer-events-none flex items-center gap-2 rounded-full bg-[#f8fff4]/75 px-3 py-1 text-[11px] text-[#45684f] backdrop-blur-sm"><Icon name="hand" size={14}/>섬의 원하는 자리를 눌러 주세요</p>}
          <div ref={toolbarRef} className="flex items-center gap-1 rounded-full border border-white/80 bg-[#fffffa]/90 px-2 py-1.5 shadow-[0_4px_20px_#60837012] backdrop-blur-sm" role="group" aria-label="시점 조작">
            {([ ["left", "left", "왼쪽으로 회전"], ["right", "right", "오른쪽으로 회전"], ["out", "minus", "축소"], ["in", "plus", "확대"], ["top", "top", "위에서 보기"], ["home", "rotate", "처음 시점으로"] ] as [CameraPreset, IconName, string][]).map(([preset, icon, label], index) => <button key={preset} title={label} aria-label={label} onClick={() => camera(preset)} className={`${button} h-8 w-8 text-[#607862] hover:bg-[#eaf0e4] max-sm:w-7 ${index === 2 || index === 4 ? "ml-1 border-l border-[#e2e7dc]" : ""}`}><Icon name={icon} size={17}/></button>)}
          </div>
          {mode === "island" && (phase === "choosing" || phase === "confirming") && entryStage === "placement" && <button onClick={cancelPlacement} className="absolute right-4 bottom-5 rounded-full bg-white/85 px-3 py-1.5 text-[11px] text-[#5e7665]">배치 취소</button>}
        </div>}
      </section>

      {!compact && <footer className="mt-6 flex flex-col items-center justify-between gap-4 px-1 text-[11px] text-[#a0a68f] sm:flex-row"><p className="flex items-center gap-2"><Icon name="leaf" size={14}/>한 학기 동안 매일의 이야기가 이 섬에 차곡차곡 쌓여요.</p><span className="flex items-center gap-4 text-[10px]"><span>드래그 · 시점 이동</span><span className="h-2.5 w-px bg-[#d7ddcc]"/><span>스크롤 · 확대 / 축소</span></span></footer>}
    </main>
  </div>;
}

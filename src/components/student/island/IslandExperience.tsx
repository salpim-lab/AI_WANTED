"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import type { CameraPreset, GiftKind, IslandGift, SceneHandle, ViewMode } from "./types";

const IslandScene = dynamic(() => import("./IslandScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center bg-[#dceee5] text-sm text-[#557564]">작은 섬을 준비하고 있어요…</div>,
});

type IconName = "leaf" | "puzzle" | "sun" | "rotate" | "top" | "plus" | "minus" | "home" | "left" | "right" | "arrow" | "check" | "hand" | "flower" | "star";

function Icon({ name, size = 20, className = "" }: { name: IconName; size?: number; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    leaf: <path d="M12 21v-9M12 15C4 16 3 10 3 6c6-1 10 2 9 9ZM12 11c-1-6 3-9 9-8 0 6-3 10-9 8Z"/>,
    puzzle: <path d="M9 3H4a1 1 0 0 0-1 1v5c4-3 6 4 0 3v8a1 1 0 0 0 1 1h5c-2-5 5-5 4 0h7a1 1 0 0 0 1-1v-6c-5 2-5-5 0-4V4a1 1 0 0 0-1-1h-6c3 5-5 5-5 0Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></>,
    rotate: <path d="M20 7v5h-5M4 17v-5h5M5.5 7a7.5 7.5 0 0 1 13 0l1.5 5M4 12l1.5 5a7.5 7.5 0 0 0 13 0"/>,
    top: <path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>,
    plus: <path d="M12 5v14M5 12h14"/>, minus: <path d="M5 12h14"/>,
    home: <path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/>,
    left: <path d="m14 6-6 6 6 6"/>, right: <path d="m10 6 6 6-6 6"/>, arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    hand: <path d="M8 12V5a2 2 0 0 1 4 0v6-7a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 4-2 6-6 6h-2c-2 0-3-1-4-3l-4-5c-1-2 1-4 3-2l1 1Z"/>,
    flower: <><path d="M12 15v7m0-4 4-2M12 5C7-1 4 6 8 9c-7 0-4 8 1 5 1 7 8 3 5-1 6 4 9-4 3-5 3-5-3-8-5-3Z"/><circle cx="12" cy="10" r="2"/></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{paths[name]}</svg>;
}

const GIFTS: { kind: GiftKind; name: string; description: string; color: string; ink: string; icon: IconName }[] = [
  { kind: "sprout", name: "작은 새싹", description: "한 뼘 자란 나의 용기", color: "#e9efdc", ink: "#6c8a43", icon: "leaf" },
  { kind: "flower", name: "다정한 꽃", description: "마음을 나눈 순간", color: "#f9eae5", ink: "#bc7e7b", icon: "flower" },
  { kind: "star", name: "반짝이는 별", description: "기억하고 싶은 하루", color: "#f8f0d5", ink: "#b18f35", icon: "star" },
];

type Props = {
  compact?: boolean;
  studentName?: string;
  incomingItem?: { emoji: string; name: string; reason: string } | null;
  baseItemCount?: number;
  onComplete?: () => void;
};

export default function IslandExperience({ compact = false, studentName = "민준", incomingItem = null, baseItemCount = 0, onComplete }: Props) {
  const [mode, setMode] = useState<ViewMode>("island");
  const [gifts, setGifts] = useState<IslandGift[]>([]);
  const [selected, setSelected] = useState<GiftKind | null>(null);
  const [message, setMessage] = useState("");
  const [completed, setCompleted] = useState(false);
  const [cameraView, setCameraView] = useState<"free" | "top">("free");
  const sceneRef = useRef<SceneHandle>(null);
  const giftId = useRef(0);
  const placedIncoming = !!incomingItem && gifts.length > 0;
  const place = useCallback((kind: GiftKind, x: number, z: number) => {
    const name = incomingItem?.name ?? GIFTS.find((gift) => gift.kind === kind)!.name;
    const id = `gift-${++giftId.current}`;
    setGifts((current) => current.some((gift) => gift.kind === kind) || (incomingItem && current.length) ? current : [...current, { id, kind, name, x, z }]);
    setSelected(null);
    setMessage(`${name}, 섬에 잘 놓았어요.`);
  }, [incomingItem]);

  function camera(preset: CameraPreset) {
    sceneRef.current?.camera(preset);
    if (preset === "top") setCameraView("top");
    if (preset === "home") setCameraView("free");
  }

  function changeMode(next: ViewMode) {
    setMode(next); setSelected(null); setMessage(""); setCameraView("free");
  }

  const button = "inline-flex items-center justify-center gap-2 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2d7255] disabled:cursor-not-allowed disabled:opacity-40";
  const available = incomingItem ? [{ ...GIFTS[2], name: incomingItem.name, description: "오늘의 이야기가 담긴 선물" }] : GIFTS;

  return <div lang="ko" className={`island-experience ${compact ? "flex min-h-0 flex-1 flex-col" : "min-h-dvh"} bg-[#f7f8f2] text-[#294638] [font-family:'Apple_SD_Gothic_Neo','Malgun_Gothic',sans-serif] [&_button]:cursor-pointer`}>
    {!compact && <header className="border-b border-[#e1e7dc] bg-[#fcfcf7]">
      <div className="mx-auto flex h-[82px] max-w-[1440px] items-center justify-between gap-4 px-6 lg:px-12">
        <a href="/island" className="flex items-center gap-3" aria-label="살핌 나의 섬"><span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#2b7657] text-[#f9f8e9]"><Icon name="leaf" size={25}/></span><span className="text-[25px] font-extrabold tracking-[-1.5px]">살핌</span><span className="ml-2 hidden border-l border-[#dce2d8] pl-4 text-[12px] text-[#859083] sm:block">마음이 자라는 작은 섬</span></a>
        <nav className="flex items-center gap-1 rounded-full bg-[#edf0e7] p-1" aria-label="섬 둘러보기">
          <button onClick={() => changeMode("island")} aria-pressed={mode === "island"} className={`${button} px-4 py-2.5 text-[13px] font-semibold ${mode === "island" ? "bg-white text-[#2c6d4f] shadow-sm" : "text-[#7e8a7d]"}`}><Icon name="home" size={16}/>나의 섬</button>
          <button onClick={() => changeMode("classroom")} aria-pressed={mode === "classroom"} className={`${button} px-4 py-2.5 text-[13px] font-semibold ${mode === "classroom" ? "bg-white text-[#2c6d4f] shadow-sm" : "text-[#7e8a7d]"}`}><Icon name="puzzle" size={16}/>우리 반 퍼즐</button>
        </nav>
        <div className="hidden items-center gap-2.5 md:flex"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#f1e8c9] text-[#a18b49]"><Icon name="sun" size={21}/></span><span className="text-sm font-semibold">{studentName}<span className="ml-1 font-normal text-[#8e9788]">의 공간</span></span></div>
      </div>
    </header>}

    <main className={compact ? "flex min-h-0 flex-1 flex-col p-3" : "mx-auto max-w-[1440px] px-5 pb-8 pt-9 sm:px-8 lg:px-12"}>
      {!compact && <div className="mb-7 flex items-end justify-between gap-4"><div>
        <p className="mb-2.5 text-[10px] font-bold tracking-[0.25em] text-[#83957d]">MY LITTLE ISLAND</p>
        <h1 className="text-[25px] font-bold leading-snug tracking-[-1.1px] sm:text-[31px]">{mode === "island" ? "이야기가 자라는, 나의 작은 섬" : "우리의 섬이 만나면"}<span className="ml-2 text-[#a9b97c]">.</span></h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[#879182]">{mode === "island" ? "어떤 마음이든 괜찮아. 네 이야기가 이곳에 차곡차곡 쌓일 거야." : "서로 다른 이야기가 모여, 하나의 커다란 우리 반 마을이 돼요."}</p>
      </div><span className="mb-1 hidden items-center gap-2 rounded-full border border-[#e1e6d7] bg-[#f0f3e8] px-4 py-2.5 text-[11px] text-[#7d8c6f] sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-[#96ac75]"/>{mode === "island" ? "나만의 속도로 자라는 중" : "학기말 모아 보기 · 미리 보기"}</span></div>}

      <div className={compact ? "grid min-h-0 flex-1 grid-cols-[1fr_190px] gap-3" : "grid gap-5 lg:grid-cols-[minmax(0,1fr)_292px]"}>
        <section className={`relative isolate overflow-hidden rounded-[24px] border border-[#d6e3d7] bg-[#dceee5] ${compact ? "min-h-0" : "h-[510px] sm:h-[580px]"}`} aria-label="3D 퍼즐 섬">
          <IslandScene mode={mode} gifts={gifts} selected={selected} onPlace={place} controlsRef={sceneRef}/>
          <div className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 ${compact ? "p-4" : "p-6"}`}>
            <div><div className="mb-1.5 flex items-center gap-2 text-[10px] font-medium tracking-[0.06em] text-[#799888]"><span className="h-1.5 w-1.5 rounded-full bg-[#7fa886]"/>{mode === "island" ? "작은 마음의 정원" : "아홉 조각으로 보는 예시"}</div><h2 className={`${compact ? "text-lg" : "text-[23px]"} font-bold tracking-[-0.7px] text-[#345845]`}>{mode === "island" ? `${studentName}이의 섬` : "함께 만드는 우리"}</h2></div>
            <span className="flex items-center gap-1.5 rounded-full border border-white/60 bg-white/55 px-3 py-1.5 text-[11px] text-[#6f8c78]"><Icon name={mode === "island" ? "leaf" : "puzzle"} size={14}/>{mode === "island" ? `${baseItemCount + gifts.length}개의 이야기` : "학기말 미리 보기"}</span>
          </div>
          {!compact && <div className="absolute left-6 top-[96px] flex rounded-full border border-white/50 bg-[#ecf4ed]/75 p-1 backdrop-blur-sm">
            <button onClick={() => camera("home")} aria-pressed={cameraView === "free"} className={`${button} px-3 py-1.5 text-[11px] ${cameraView === "free" ? "bg-white text-[#456b50] shadow-sm" : "text-[#829480]"}`}><Icon name="rotate" size={13}/>자유롭게 둘러보기</button>
            <button onClick={() => camera("top")} aria-pressed={cameraView === "top"} className={`${button} px-3 py-1.5 text-[11px] ${cameraView === "top" ? "bg-white text-[#456b50] shadow-sm" : "text-[#829480]"}`}><Icon name="top" size={13}/>위에서 보기</button>
          </div>}
          <div className={`absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-[#dceee5]/85 to-transparent ${compact ? "pb-3 pt-6" : "pb-5 pt-10"}`}>
            <p className="pointer-events-none flex items-center gap-2 text-[11px] text-[#688774]"><Icon name={selected ? "plus" : "hand"} size={14}/>{selected ? "빈 잔디를 눌러 선물을 놓아 보세요" : compact ? "드래그로 회전 · 스크롤로 확대" : "천천히 돌려 봐. 다른 풍경이 보일 거야."}</p>
            <div className="flex items-center gap-1 rounded-full border border-white/80 bg-[#fffffa]/90 px-2 py-1.5 shadow-[0_4px_20px_#60837012] backdrop-blur-sm" role="group" aria-label="시점 조작">
              {([ ["left", "left", "왼쪽으로 회전"], ["right", "right", "오른쪽으로 회전"], ["out", "minus", "축소"], ["in", "plus", "확대"], ["top", "top", "위에서 보기"], ["home", "rotate", "처음 시점으로"] ] as [CameraPreset, IconName, string][]).map(([preset, icon, label], i) => <button key={preset} title={label} aria-label={label} onClick={() => camera(preset)} className={`${button} h-8 w-8 text-[#607862] hover:bg-[#eaf0e4] ${i === 2 || i === 4 ? "ml-1 border-l border-[#e2e7dc]" : ""}`}><Icon name={icon} size={17}/></button>)}
            </div>
          </div>
        </section>

        <aside className={`flex min-h-0 flex-col ${compact ? "gap-3 overflow-y-auto" : "gap-4"}`}>
          <section className={`flex flex-col rounded-[22px] border border-[#e2e6d9] bg-[#fdfdf8] ${compact ? "p-4" : "flex-1 p-6"}`}>
            <div className="mb-5 flex items-center justify-between"><span className="text-[10px] font-semibold tracking-[0.16em] text-[#929d87]">LITTLE MEMORIES</span><Icon name="leaf" size={18} className="text-[#a5b195]"/></div>
            <h2 className={`${compact ? "text-base" : "text-[20px]"} font-bold tracking-[-0.5px]`}>{mode === "classroom" ? "한 조각의 나, 함께하는 우리" : "마음이 머무는 자리"}</h2>
            <p className="mt-2 text-[12px] leading-[1.8] text-[#92998a]">{mode === "classroom" ? "한 학기가 끝나면 친구들의 섬과 퍼즐을 맞춰요. 저마다의 이야기가 하나의 풍경이 될 거예요." : incomingItem ? "오늘의 이야기가 작은 선물이 되었어요. 섬에서 마음에 드는 자리를 골라 주세요." : <>나눈 이야기가 작은 선물이 되어<br/>이 섬에 하나씩 찾아올 거예요.</>}</p>
            {mode === "island" ? <>
              {!compact && <div className="my-5 flex items-center gap-3"><div className="h-px flex-1 bg-[#e9ecdf]"/><span className="text-[10px] text-[#a1a894]">{incomingItem ? "오늘 도착한 선물" : "미리 놓아 보기"}</span><div className="h-px flex-1 bg-[#e9ecdf]"/></div>}
              <div className={`flex flex-col ${compact ? "mt-4 gap-2" : "gap-2.5"}`}>
                {available.map((gift) => {
                  const isPlaced = incomingItem ? placedIncoming : gifts.some((placed) => placed.kind === gift.kind);
                  return <button key={gift.kind} disabled={isPlaced} aria-pressed={selected === gift.kind} onClick={() => { setSelected((value) => value === gift.kind ? null : gift.kind); setMessage(""); }} className={`flex items-center gap-3 rounded-[14px] border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[#2d7255] disabled:cursor-default ${selected === gift.kind ? "border-[#8da979] bg-[#f0f5e8]" : "border-[#eceee4] bg-[#fafbf5] hover:border-[#bdcbaa]"}`}>
                    <span style={{ background: gift.color, color: gift.ink }} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"><Icon name={gift.icon} size={24}/></span>
                    <span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold">{gift.name}</span>{!compact && <span className="mt-1 block text-[10px] text-[#929b86]">{gift.description}</span>}</span><span className="text-[#879d71]"><Icon name={isPlaced ? "check" : selected === gift.kind ? "minus" : "plus"} size={15}/></span>
                  </button>;
                })}
              </div>
              <div className="mt-4 min-h-10 text-[11px] leading-relaxed text-[#849276]" aria-live="polite">{message || (selected ? "선물을 골랐어요. 빈 잔디를 누르거나 아래 버튼으로 놓아 보세요." : gifts.length ? "이야기 하나가 섬의 풍경이 되었어요." : "선물을 고르고, 섬 위에 놓아 보세요.")}</div>
              {selected && <button onClick={() => sceneRef.current?.placeSuggested()} className={`${button} mt-1 w-full bg-[#327455] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#255c41]`}>빈자리에 놓기<Icon name="arrow" size={15}/></button>}
              {compact && onComplete && <button disabled={!gifts.length || completed} onClick={() => { setCompleted(true); onComplete(); }} className={`${button} mt-3 w-full bg-[#327455] px-3 py-2.5 text-xs font-semibold text-white`}>{completed ? "오늘의 이야기 완료" : "배치 완료"}<Icon name="check" size={15}/></button>}
              {!incomingItem && <p className="mt-auto pt-4 text-[10px] leading-relaxed text-[#a0a795]">배치 체험용 선물이에요.<br/>새로고침하면 처음 모습으로 돌아와요.</p>}
            </> : <div className="mt-7 flex flex-1 flex-col items-center justify-center gap-5 rounded-2xl bg-[#f0f3e8] px-4 py-7">
              <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <span key={i} className={`grid h-11 w-11 place-items-center rounded-lg ${i === 4 ? "bg-[#668760] text-[#fff8dc]" : "bg-[#dce5cd] text-[#9caf88]"}`}><Icon name="puzzle" size={25}/></span>)}</div>
              <p className="text-center text-xs leading-relaxed text-[#7f8f71]">모양은 달라도,<br/>우리에게는 서로의 자리가 있어요.</p><button onClick={() => changeMode("island")} className={`${button} bg-[#fffff9] px-4 py-2.5 text-xs text-[#648051]`}>내 섬으로 돌아가기<Icon name="arrow" size={15}/></button>
            </div>}
          </section>
          {mode === "island" && !compact && <button onClick={() => changeMode("classroom")} className="group flex items-center gap-3.5 rounded-[20px] border border-[#e0e5d4] bg-[#edf1e4] p-5 text-left transition-colors hover:bg-[#e5ecda] focus-visible:outline-2 focus-visible:outline-[#2d7255]">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-[#d8e1c8] bg-[#f5f7ee] text-[#84976b]"><Icon name="puzzle" size={23}/></span><span className="flex-1"><span className="mb-1 block text-[9px] tracking-[0.08em] text-[#99a38a]">학기말에 만나요</span><span className="text-[12px] font-semibold text-[#657c54]">우리의 섬이 만나면</span></span><Icon name="arrow" size={16} className="text-[#8fa07a] transition-transform group-hover:translate-x-1"/>
          </button>}
        </aside>
      </div>
      {!compact && <footer className="mt-6 flex flex-col items-center justify-between gap-4 px-1 text-[11px] text-[#a0a68f] sm:flex-row"><p className="flex items-center gap-2"><Icon name="leaf" size={14}/>작은 이야기 하나도, 이곳에서는 소중한 풍경이 돼요.</p><span className="flex items-center gap-4 text-[10px]"><span>드래그 · 시점 이동</span><span className="h-2.5 w-px bg-[#d7ddcc]"/><span>스크롤 · 확대 / 축소</span></span></footer>}
    </main>
  </div>;
}

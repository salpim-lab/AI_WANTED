"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ISLAND_ITEM_WAIT_MS, pollItemGeneration, requestItemGeneration, type ItemGenerationJobState } from "@/lib/items/itemGenerationClient";
import type { Item } from "./mockScenarios";
import { preloadIsland } from "./island/preloadIsland";
import IslandBoard from "./IslandBoard";
import SalpimHeader from "./home/SalpimHeader";
import StudentProfile from "./home/StudentProfile";

const MESSAGE_CHANGE_MS = 2_000;
const DEMO_ISLAND_WAIT_MS = 15_000;
const PREPARATION_MESSAGES = [
  { title: "오늘 이야기, 잘 들었어!", sub: "네 이야기를 담을 아이템을 준비할게.", image: "/brand/salpim-signal-character.png" },
  { title: "어떤 아이템이 어울릴까?", sub: "오늘 가장 기억에 남는 순간을 떠올려 봐.", image: "/brand/salpim-wait-thinking.png" },
  { title: "이야기가 아이템이 되는 중!", sub: "섬에 놓으면 오늘을 다시 기억할 수 있어.", image: "/brand/salpim-wait-star.png" },
  { title: "아이템은 어디에 놓을까?", sub: "마당도 좋고, 나무 옆도 좋겠다.", image: "/brand/salpim-wait-gift.png" },
  { title: "이제 섬으로 가 볼까?", sub: "아이템이 준비되는 동안 섬을 먼저 둘러보자.", image: "/brand/salpim-wait-star.png" },
  { title: "섬에서 조금 더 기다려 줘", sub: "아이템 준비가 끝나면 알려줄게.", image: "/brand/salpim-wait-gift.png" },
] as const;

function toItem(job: ItemGenerationJobState | null, demoItem: Item | null): Item {
  const inference = job?.inference_output;
  const fallback = job?.fallback_asset_id && !job.generated_asset_id;
  return {
    emoji: fallback || inference ? "🎁" : demoItem?.emoji ?? "🎁",
    name: fallback ? job?.asset?.name ?? "먼저 준비한 아이템" : inference?.itemName ?? demoItem?.name ?? "오늘의 아이템",
    reason: fallback ? "네 이야기를 담은 아이템을 준비하는 동안 이 아이템을 먼저 받아줘." : inference?.studentMessage ?? demoItem?.reason ?? "오늘 네 이야기를 담았어.",
    assetFormat: job?.asset?.asset_format,
    geometrySpec: job?.asset?.geometry_spec,
    studentItemId: job?.student_item_id ?? undefined,
  };
}

/** Shared by the actual checkin/checkout screens; null session uses a timed offline demo. */
export default function ItemPreparation({ sessionId, item, onReady, flow = "checkin", onIslandComplete }: {
  flow?: "checkin" | "checkout";
  sessionId: string | null;
  item: Item | null;
  onReady: (item: Item) => void;
  /** 섬에서 "배치 종료" 를 눌렀을 때. 등교 화면이 이걸 받아 하교 화면으로 넘긴다(이유민 2026-09-19 추가) */
  onIslandComplete?: () => void;
}) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [job, setJob] = useState<ItemGenerationJobState | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [browseIsland, setBrowseIsland] = useState(false);
  const [readyItem, setReadyItem] = useState<Item | null>(null);

  useEffect(() => {
    if (readyItem) return;
    const complete = (result: ItemGenerationJobState | null) => {
      const preparedItem = toItem(result, item);
      setReadyItem(preparedItem);
      onReady(preparedItem);
    };
    const controller = new AbortController();
    const signal = controller.signal;
    let result: ItemGenerationJobState | null = null;
    let elapsed = false;
    let tick = 0;
    const messageTimer = setInterval(() => {
      tick += 1;
      setMessageIndex(Math.min(tick, PREPARATION_MESSAGES.length - 1));
    }, MESSAGE_CHANGE_MS);
    // One clock for the whole preparation screen, independent of network/asset loading.
    const transitionTimer = setTimeout(() => {
      elapsed = true;
      if (result?.asset?.geometry_spec) complete(result);
      else setBrowseIsland(true);
    }, ISLAND_ITEM_WAIT_MS);
    // 시연 모드: 섬에서 "아이템 생성 중…"을 잠시 보여 준 뒤 준비를 끝낸다.
    const demoTimer = sessionId ? undefined : setTimeout(() => complete(null), ISLAND_ITEM_WAIT_MS + DEMO_ISLAND_WAIT_MS);
    void preloadIsland().catch(error => console.warn("[island] 미리 준비 실패", error));
    async function prepare() {
      if (!sessionId) return;
      await requestItemGeneration(sessionId, signal);
      // GET은 한 번에 하나씩, 진행 중인 요청은 폴링 주기로 취소하지 않는다(요청 타임아웃 12s ≠ 폴링 간격 1s). 오류는 백오프 뒤 재시도.
      // 응답마다 onJob으로 중간 추론 결과를 화면에 바로 쓴다. 언마운트(abort) 시 즉시 중단된다.
      const job = await pollItemGeneration(sessionId, { signal, onJob: (next) => { if (next) { result = next; setJob(next); } } });
      if (signal.aborted || !job) return;
      if (elapsed) complete(result);
    }
    void prepare().catch(() => { if (!signal.aborted) setError(true); });
    return () => { controller.abort(); clearInterval(messageTimer); clearTimeout(transitionTimer); clearTimeout(demoTimer); };
  }, [sessionId, item, onReady, retry, readyItem]);

  const retryButton = <button type="button" className="talk-btn item-prep__retry" onClick={() => { setError(false); setMessageIndex(0); setRetry(v => v + 1); }}><span className="talk-btn__row">다시 준비하기</span></button>;
  const message = PREPARATION_MESSAGES[messageIndex];

  // Keep the same island mounted when generation finishes so its intro and camera persist.
  if (browseIsland || readyItem) return <>
    {error && <div role="alert" className="item-prep__alert"><p className="chat-voice-error">아이템 준비를 다시 해볼까?</p>{retryButton}</div>}
    <IslandBoard flow={flow} item={readyItem ?? toItem(job, item)} preparing={!readyItem} onComplete={onIslandComplete} />
  </>;

  // 대화 화면과 같은 배경·헤더·살핌 얼굴·입력 중 점을 써서 대화가 이어지는 것처럼 보이게 한다.
  return <section className="chat-screen active item-prep" aria-busy={!error} aria-label="아이템 준비">
    <SalpimHeader />
    <StudentProfile name="김민준" />
    <div className="item-prep__body">
      <span className="item-prep__face" aria-hidden="true">
        <Image src={message.image} alt="" width={1254} height={1254} priority className="item-prep__character" />
      </span>
      <div role="status" aria-live="polite">
        <h2 className="item-prep__title">{error ? "잠깐, 준비가 멈췄어" : message.title}</h2>
        <p className="item-prep__sub">{error ? "한 번 더 준비해 볼까?" : message.sub}</p>
      </div>
      {error && retryButton}
    </div>
  </section>;
}

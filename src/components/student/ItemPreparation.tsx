"use client";

import { useEffect, useState } from "react";
import { ISLAND_ITEM_WAIT_MS, requestItemGeneration, waitForItemGeneration, type ItemGenerationJobState } from "@/lib/items/itemGenerationClient";
import type { Item } from "./mockScenarios";
import { preloadIsland } from "./island/preloadIsland";
import IslandBoard from "./IslandBoard";
import SalpimFace from "./SalpimFace";
import SalpimHeader from "./home/SalpimHeader";
import StudentProfile from "./home/StudentProfile";

const MESSAGE_CHANGE_MS = 2_000;
const PREPARATION_MESSAGES = [
  ["오늘 이야기, 잘 들었어!", "네 이야기를 담을 선물을 준비할게."],
  ["어떤 선물이 어울릴까?", "오늘 가장 기억에 남는 순간을 떠올려 봐."],
  ["이야기가 선물이 되는 중!", "섬에 놓으면 오늘을 다시 기억할 수 있어."],
  ["선물은 어디에 놓을까?", "바닷가도 좋고, 나무 옆도 좋겠다."],
  ["이제 섬으로 가 볼까?", "선물이 준비되는 동안 섬을 먼저 둘러보자."],
  ["섬에서 조금 더 기다려 줘", "선물 준비가 끝나면 놓기 버튼이 켜질 거야."],
] as const;

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const stop = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", stop); resolve(); }, ms);
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
  });
}

function toItem(job: ItemGenerationJobState | null, demoItem: Item | null): Item {
  const inference = job?.inference_output;
  const fallback = job?.fallback_asset_id && !job.generated_asset_id;
  return {
    emoji: fallback || inference ? "🎁" : demoItem?.emoji ?? "🎁",
    name: fallback ? job?.asset?.name ?? "먼저 준비한 선물" : inference?.itemName ?? demoItem?.name ?? "오늘의 선물",
    reason: fallback ? "네 이야기를 담은 선물을 준비하는 동안 이 선물을 먼저 받아줘." : inference?.studentMessage ?? demoItem?.reason ?? "오늘 네 이야기를 담았어.",
    assetFormat: job?.asset?.asset_format,
    geometrySpec: job?.asset?.geometry_spec,
  };
}

/** Shared by the actual checkin/checkout screens; null session uses a timed offline demo. */
export default function ItemPreparation({ sessionId, item, onReady, flow = "checkin" }: {
  flow?: "checkin" | "checkout";
  sessionId: string | null;
  item: Item | null;
  onReady: (item: Item) => void;
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
      if (!sessionId || result?.asset?.geometry_spec) complete(result);
      else setBrowseIsland(true);
    }, ISLAND_ITEM_WAIT_MS);
    void preloadIsland().catch(error => console.warn("[island] 미리 준비 실패", error));
    async function prepare() {
      if (!sessionId) return;
      await requestItemGeneration(sessionId, signal);
      while (!signal.aborted) {
        // Short query windows publish intermediate inference without an extra UI stage.
        const response = await waitForItemGeneration(sessionId, "placement", { signal, timeoutMs: 1_000 });
        if (signal.aborted) return;
        if (response.job) { result = response.job; setJob(result); }
        if (response.ready && result?.asset?.geometry_spec) {
          if (elapsed) complete(result);
          return;
        }
        if (response.ready) await delay(500, signal);
      }
    }
    void prepare().catch(() => { if (!signal.aborted) setError(true); });
    return () => { controller.abort(); clearInterval(messageTimer); clearTimeout(transitionTimer); };
  }, [sessionId, item, onReady, retry, readyItem]);

  const retryButton = <button type="button" className="talk-btn item-prep__retry" onClick={() => { setError(false); setMessageIndex(0); setRetry(v => v + 1); }}><span className="talk-btn__row">다시 준비하기</span></button>;

  // Keep the same island mounted when generation finishes so its intro and camera persist.
  if (browseIsland || readyItem) return <>
    {error && <div role="alert" className="item-prep__alert"><p className="chat-voice-error">선물 준비를 다시 해볼까?</p>{retryButton}</div>}
    <IslandBoard flow={flow} item={readyItem ?? toItem(job, item)} preparing={!readyItem} />
  </>;

  // 대화 화면과 같은 배경·헤더·살핌 얼굴·입력 중 점을 써서 대화가 이어지는 것처럼 보이게 한다.
  return <section className="chat-screen active item-prep" aria-busy={!error} aria-label="선물 준비">
    <SalpimHeader />
    <StudentProfile name="김민준" />
    <div className="item-prep__body">
      <span className="chat-avatar chat-avatar--ai item-prep__face" aria-hidden="true"><SalpimFace className="chat-avatar__face" withSparkles={false} /></span>
      <div role="status" aria-live="polite">
        <h2 className="item-prep__title">{error ? "잠깐, 준비가 멈췄어" : PREPARATION_MESSAGES[messageIndex][0]}</h2>
        <p className="item-prep__sub">{error ? "한 번 더 준비해 볼까?" : PREPARATION_MESSAGES[messageIndex][1]}</p>
      </div>
      {error ? retryButton : <div className="chat-typing" aria-hidden="true"><span /><span /><span /></div>}
    </div>
  </section>;
}

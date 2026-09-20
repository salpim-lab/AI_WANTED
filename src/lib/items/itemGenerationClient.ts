import type { ItemInference } from "./itemInference";

export const ISLAND_ITEM_WAIT_MS = 12_000;

export type ItemGenerationJobState = {
  id: string;
  status: "queued" | "generating" | "retry_wait" | "fallback" | "completed" | "fallback_final";
  inference_output?: ItemInference | null;
  student_message?: string | null;
  generated_asset_id: string | null;
  fallback_asset_id: string | null;
  student_item_id: string | null;
  asset?: { name: string; asset_format: "procedural"; geometry_spec: unknown } | null;
};

/** Start alongside transcript saving and the final AI response, using the existing session ID. */
export async function requestItemGeneration(sessionId: string, signal?: AbortSignal): Promise<ItemGenerationJobState> {
  const response = await fetch("/api/ai/item-generation", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }), signal,
  });
  if (!response.ok) throw new Error(`ITEM_GENERATION_REQUEST_FAILED:${response.status}`);
  return (await response.json()).job;
}

/** 개별 GET 요청 하나의 최대 대기 시간. 폴링 주기(POLL_INTERVAL_MS)와는 별개다 — 느린 응답을 폴링 주기 때문에 끊지 않는다. */
export const ITEM_QUERY_REQUEST_TIMEOUT_MS = 12_000;
/** 응답이 ready가 아닐 때, 그 응답이 **끝난 뒤** 다음 요청을 보내기 전에 기다리는 시간. */
export const ITEM_QUERY_POLL_INTERVAL_MS = 1_000;
/** 네트워크 오류·요청 시간 초과 뒤 재시도 대기(연속 오류가 늘수록 길어진다, 마지막 값에서 고정). */
export const ITEM_QUERY_ERROR_BACKOFF_MS = [1_000, 2_000, 4_000] as const;
/** 연속 오류가 이 횟수에 이르면 폴링을 멈추고 오류를 던진다(화면의 "다시 준비하기"로 넘어간다). */
export const ITEM_QUERY_MAX_CONSECUTIVE_ERRORS = 5;

export class ItemQueryTimeoutError extends Error {
  constructor() { super("ITEM_GENERATION_QUERY_TIMEOUT"); this.name = "ItemQueryTimeoutError"; }
}

/** ms 뒤에 끝나거나, signal이 중단되면 즉시 끝난다(예외를 던지지 않는다 — 호출부가 signal.aborted를 본다). */
function abortableDelay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => { clearTimeout(timer); signal?.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, Math.max(0, ms));
    signal?.addEventListener("abort", done, { once: true });
  });
}

const isPlaceable = (job: ItemGenerationJobState | null) => Boolean(job?.student_item_id && (job.generated_asset_id || job.fallback_asset_id));

/**
 * 작업 상태 GET **한 번**. 이 요청은 폴링 주기로 취소되지 않는다 — 끝나거나, requestTimeoutMs가 지나거나, 바깥 signal(컴포넌트
 * 언마운트)이 중단될 때만 끝난다. 시간 초과는 ItemQueryTimeoutError, 바깥 중단은 signal.reason을 던진다.
 */
export async function fetchItemGenerationJob(
  sessionId: string,
  { signal, requestTimeoutMs = ITEM_QUERY_REQUEST_TIMEOUT_MS }: { signal?: AbortSignal; requestTimeoutMs?: number } = {},
): Promise<ItemGenerationJobState | null> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromOutside = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abortFromOutside, { once: true });
  if (signal?.aborted) abortFromOutside();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(0, requestTimeoutMs));
  try {
    const response = await fetch(`/api/ai/item-generation?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`ITEM_GENERATION_QUERY_FAILED:${response.status}`);
    return (await response.json()).job ?? null;
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (timedOut) throw new ItemQueryTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromOutside);
  }
}

/**
 * Wait for reveal data OR a placeable item. A UI deadline never fails the server job.
 * 요청은 **순차**로만 보낸다(겹치지 않는다). timeoutMs는 "새 요청을 시작하는 기준 시간"일 뿐 진행 중인 요청을 끊지 않는다.
 * 요청 하나가 requestTimeoutMs를 넘기면 그 창은 ready:false로 끝난다.
 */
export async function waitForItemGeneration(
  sessionId: string,
  stage: "inference" | "placement",
  { timeoutMs = ISLAND_ITEM_WAIT_MS, signal, requestTimeoutMs = ITEM_QUERY_REQUEST_TIMEOUT_MS, pollIntervalMs = ITEM_QUERY_POLL_INTERVAL_MS }:
    { timeoutMs?: number; signal?: AbortSignal; requestTimeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<{ ready: boolean; job: ItemGenerationJobState | null }> {
  const deadline = Date.now() + timeoutMs;
  let job: ItemGenerationJobState | null = null;
  try {
    for (;;) {
      job = await fetchItemGenerationJob(sessionId, { signal, requestTimeoutMs });
      if (isPlaceable(job) || (stage === "inference" && job?.inference_output)) return { ready: true, job };
      if (Date.now() + pollIntervalMs >= deadline) return { ready: false, job };
      await abortableDelay(pollIntervalMs, signal);
      if (signal?.aborted) throw signal.reason;
    }
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (error instanceof ItemQueryTimeoutError) return { ready: false, job };
    throw error;
  }
}

/**
 * 학생 화면용 폴링: 놓을 수 있는 아이템(+ 화면에 쓸 asset.geometry_spec)이 올 때까지 GET을 **한 번에 하나씩** 보낸다.
 *  - ready가 아니면 그 응답이 끝난 뒤 pollIntervalMs를 기다렸다가 다음 요청을 보낸다(취소·즉시 재시도 폭주 없음).
 *  - 네트워크 오류·시간 초과는 백오프(1s→2s→4s…) 뒤 재시도하고, 연속 maxConsecutiveErrors회면 오류를 던진다.
 *  - 바깥 signal이 중단되면(언마운트) 진행 중인 요청과 대기를 즉시 끝내고 null을 돌려준다.
 *  - 응답을 받을 때마다 onJob(job)을 부른다(중간 추론 결과 등을 화면에 즉시 쓰기 위해).
 */
export async function pollItemGeneration(
  sessionId: string,
  {
    signal, onJob, pollIntervalMs = ITEM_QUERY_POLL_INTERVAL_MS, requestTimeoutMs = ITEM_QUERY_REQUEST_TIMEOUT_MS,
    errorBackoffMs = ITEM_QUERY_ERROR_BACKOFF_MS, maxConsecutiveErrors = ITEM_QUERY_MAX_CONSECUTIVE_ERRORS,
  }: {
    signal?: AbortSignal; onJob?: (job: ItemGenerationJobState | null) => void; pollIntervalMs?: number; requestTimeoutMs?: number;
    errorBackoffMs?: readonly number[]; maxConsecutiveErrors?: number;
  } = {},
): Promise<ItemGenerationJobState | null> {
  let consecutiveErrors = 0;
  while (!signal?.aborted) {
    try {
      const job = await fetchItemGenerationJob(sessionId, { signal, requestTimeoutMs });
      consecutiveErrors = 0;
      onJob?.(job);
      if (isPlaceable(job) && job?.asset?.geometry_spec) return job;
    } catch (error) {
      if (signal?.aborted) return null;
      consecutiveErrors += 1;
      if (consecutiveErrors >= maxConsecutiveErrors) throw error;
      await abortableDelay(errorBackoffMs[Math.min(consecutiveErrors - 1, errorBackoffMs.length - 1)] ?? pollIntervalMs, signal);
      continue;
    }
    await abortableDelay(pollIntervalMs, signal);
  }
  return null;
}

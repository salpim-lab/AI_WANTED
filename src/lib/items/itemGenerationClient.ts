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

/** Wait for reveal data OR a placeable item. A UI deadline never fails the server job. */
export async function waitForItemGeneration(
  sessionId: string,
  stage: "inference" | "placement",
  { timeoutMs = ISLAND_ITEM_WAIT_MS, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ ready: boolean; job: ItemGenerationJobState | null }> {
  const deadline = Date.now() + timeoutMs;
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(), Math.max(0, timeoutMs));
  let job: ItemGenerationJobState | null = null;
  try {
    while (Date.now() < deadline) {
      const response = await fetch(`/api/ai/item-generation?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`ITEM_GENERATION_QUERY_FAILED:${response.status}`);
      job = (await response.json()).job;
      const placeable = Boolean(job?.student_item_id && (job.generated_asset_id || job.fallback_asset_id));
      if (placeable || (stage === "inference" && job?.inference_output)) return { ready: true, job };
      await new Promise<void>((resolve, reject) => {
        const stop = () => { clearTimeout(pollTimer); reject(controller.signal.reason); };
        const pollTimer = setTimeout(() => { controller.signal.removeEventListener("abort", stop); resolve(); }, Math.min(500, Math.max(0, deadline - Date.now())));
        controller.signal.addEventListener("abort", stop, { once: true });
        if (controller.signal.aborted) stop();
      });
    }
    return { ready: false, job };
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (controller.signal.aborted) return { ready: false, job };
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

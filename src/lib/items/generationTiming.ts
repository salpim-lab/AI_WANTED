import "server-only";

/** No transcript, model output, or credentials are included in timing logs. */
export function createGenerationTimer(jobId: string, attempt: number) {
  return async function measure<T>(stage: string, work: () => Promise<T> | T): Promise<T> {
    const startedAt = new Date().toISOString();
    const start = performance.now();
    let outcome = "success";
    console.info("[item-generation:timing]", JSON.stringify({ jobId, attempt, stage, event: "start", startedAt }));
    try {
      return await work();
    } catch (error) {
      outcome = "error";
      throw error;
    } finally {
      console.info("[item-generation:timing]", JSON.stringify({ jobId, attempt, stage, event: "end", startedAt, endedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - start), outcome }));
    }
  };
}

export type GenerationMeasure = ReturnType<typeof createGenerationTimer>;

// 담당: 이지현 (단독 소유)
// 선생님 agent 전용 OpenAI 호출. lib/openai/client.ts(item-generation 담당자 소유, callModel)는
// 구조화된 JSON 출력 + 증거 검증에 맞춰진 함수라 그대로 재사용하지 않고, 같은 방식(Responses API를
// fetch로 직접 호출)으로 자유 텍스트 응답용 버전을 따로 둔다 — 남의 파일은 손대지 않는다는 원칙 유지.
// 반드시 서버(app/api/**)에서만 import — API 키가 클라이언트 번들에 노출되면 안 된다.

import "server-only";

type ResponsesOutputContent = { type: string; text?: string; refusal?: string };
type ResponsesOutputItem = { type: string; content?: ResponsesOutputContent[] };
type ResponsesBody = {
  status?: string;
  incomplete_details?: { reason?: string };
  output?: ResponsesOutputItem[];
};

const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_TIMEOUT_MS = 20_000;

/** OPENAI_API_KEY가 설정돼 있는지 — 라우트가 실제 호출 대신 개발용 폴백을 쓸지 정할 때 쓴다. */
export function hasOpenAIKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/**
 * system + user 메시지 한 번으로 자유 텍스트 답변을 받는다. (교사 agent용 — 구조화 JSON 출력 아님)
 * 키가 없으면 호출부에서 hasOpenAIKey()로 먼저 걸러야 한다 — 이 함수는 없으면 그냥 던진다.
 */
export async function callTeacherAgentModel(
  systemPrompt: string,
  userMessage: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY 설정이 필요합니다.");
  const model = process.env.OPENAI_AGENT_MODEL?.trim() || DEFAULT_MODEL;

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new Error("OpenAI에 연결하지 못했습니다.");
  }

  if (!response.ok) {
    const errText = (await response.text().catch(() => "")).slice(0, 500);
    throw new Error(`OpenAI 호출 실패 (HTTP ${response.status}): ${errText}`);
  }

  const data = (await response.json().catch(() => null)) as ResponsesBody | null;
  if (data?.status === "incomplete") {
    throw new Error(`응답이 완료되지 않았습니다: ${data.incomplete_details?.reason ?? "unknown"}`);
  }

  const content = (data?.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  const refusal = content.find((c) => c.type === "refusal");
  if (refusal) throw new Error("모델이 답변을 거부했습니다.");

  const text = content
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("빈 응답을 받았습니다.");
  return text;
}

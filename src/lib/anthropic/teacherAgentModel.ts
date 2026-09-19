// 담당: 이지현 (단독 소유)
// 선생님 agent 전용 Claude(Anthropic) 호출. (2026-09-19) 팀에서 OpenAI 대신 Claude로 바꾸기로
// 하면서, OpenAI Responses API를 쓰던 lib/openai/teacherAgentModel.ts를 대체한다.
//
// 이미 lib/anthropic/client.ts(item-generation 담당자 소유, callClaude)가 있지만, 그건 구조화된
// JSON 출력 + item worker 전용 에러 타입(ItemAIError)에 맞춰진 함수라 그대로 재사용하지 않는다 —
// 여기는 자유 텍스트 답변이 필요하고(구조화 JSON 아님), item-generation과 무관한 별도 에러를
// 던져야 해서 lib/openai/teacherAgentModel.ts와 같은 이유로 내 것을 따로 둔다(같은 원칙:
// "남의 파일은 손대지 않는다" — 새 파일을 만드는 것뿐, client.ts는 건드리지 않음).
// 반드시 서버(app/api/**)에서만 import — API 키가 클라이언트 번들에 노출되면 안 된다.

import "server-only";

type MessagesContentBlock = { type: string; text?: string };
type MessagesBody = { stop_reason?: string; content?: MessagesContentBlock[] };

// OPENAI_AGENT_MODEL의 기본값(gpt-4.1-mini)이 "빠르고 저렴한" 등급이었던 것과 맞춰, 여기도
// Claude 중 비슷한 등급(Haiku)을 기본값으로 둔다. 더 나은 품질이 필요하면 env로 올릴 수 있다.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS = 1024; // 도메인 소견(2~3문장)·종합의견(3~6문장) 정도면 충분한 여유

/** ANTHROPIC_API_KEY가 설정돼 있는지 — 라우트가 실제 호출 대신 개발용 폴백을 쓸지 정할 때 쓴다. */
export function hasClaudeKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/**
 * system + user 메시지 한 번으로 자유 텍스트 답변을 받는다. (교사 agent용 — 구조화 JSON 출력 아님)
 * 키가 없으면 호출부에서 hasClaudeKey()로 먼저 걸러야 한다 — 이 함수는 없으면 그냥 던진다.
 */
export async function callTeacherAgentModel(
  systemPrompt: string,
  userMessage: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY 설정이 필요합니다.");
  const model = process.env.ANTHROPIC_AGENT_MODEL?.trim() || DEFAULT_MODEL;

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: DEFAULT_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new Error("Claude에 연결하지 못했습니다.");
  }

  if (!response.ok) {
    const errText = (await response.text().catch(() => "")).slice(0, 500);
    throw new Error(`Claude 호출 실패 (HTTP ${response.status}): ${errText}`);
  }

  const data = (await response.json().catch(() => null)) as MessagesBody | null;
  if (data?.stop_reason === "refusal") throw new Error("모델이 답변을 거부했습니다.");

  const text = (data?.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("")
    .trim();

  // max_tokens에 걸려 잘렸어도, 이미 나온 텍스트가 있으면(가장 흔한 경우 — 답이 길어져서 잘린 것뿐)
  // 그냥 그걸 쓴다. 아예 빈 채로 잘렸을 때만 에러로 처리한다.
  if (data?.stop_reason === "max_tokens" && !text) {
    throw new Error("응답이 완료되지 않았습니다: max_tokens");
  }
  if (!text) throw new Error("빈 응답을 받았습니다.");
  return text;
}

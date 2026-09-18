import "server-only";
import type { ItemInference } from "../items/itemInference";
import { ITEM_ASSEMBLY_SCHEMA, parseItemAssembly } from "../items/itemAssembly";
import { ITEM_ASSEMBLY_PROMPT, ITEM_CLOSEST_PROMPT } from "./prompts/item-assembly";
import { ASSEMBLY_EXAMPLE_IDS, ITEM_CATALOG } from "../items/itemCatalog";
import { callModel, ItemAIError } from "./client";
import type { GenerationMeasure } from "../items/generationTiming";

/** Fixed reviewed examples plus the catalog item the inference found closest, if any. */
function assemblyExamples(closestCatalogId: string) {
  const ids = [...ASSEMBLY_EXAMPLE_IDS, closestCatalogId];
  return ITEM_CATALOG.filter(item => ids.includes(item.id))
    .map(({ spec }) => JSON.stringify({ version: 1, name: spec.name, parts: spec.parts })).join("\n");
}

const NO_CLOSEST = "없음";
const CLOSEST_SCHEMA = {
  type: "object", additionalProperties: false, required: ["closest"],
  // Korean display names: English ids in front of the model turned its answers English.
  properties: { closest: { type: "string", enum: [...ITEM_CATALOG.map(item => item.displayName), NO_CLOSEST] } },
};

/** Catalog id that builds most like the subject, or "none". A failure only costs the extra example. */
export async function pickClosestCatalogId(inference: Pick<ItemInference, "subject" | "appearance">) {
  const request = {
    model: process.env.OPENAI_ITEM_MODEL || "gpt-4.1-mini",
    instructions: `${ITEM_CLOSEST_PROMPT}\n[카탈로그 목록]\n${ITEM_CATALOG.map(item => item.displayName).join(", ")}`,
    input: [{ role: "user", content: JSON.stringify({ subject: inference.subject, appearance: inference.appearance }) }],
    text: { format: { type: "json_schema", name: "closest_catalog_item", strict: true, schema: CLOSEST_SCHEMA } },
    max_output_tokens: 100, store: false,
  };
  const failed = "비슷한 카탈로그 아이템을 고르지 못했습니다.";
  return callModel("ASSEMBLY", request, 15000, { unavailable: failed, failed, invalid: failed },
    value => ITEM_CATALOG.find(item => item.displayName === (value as { closest?: unknown }).closest)?.id ?? "none")
    .catch(() => "none");
}

export function buildItemAssemblyRequest(inference: ItemInference, closestCatalogId = "none") {
  // Only appearance data is needed; do not resend private counseling or evidence.
  const input = { itemName: inference.itemName, subject: inference.subject, appearance: inference.appearance };
  return {
    model: process.env.OPENAI_ITEM_ASSEMBLY_MODEL || process.env.OPENAI_ITEM_MODEL || "gpt-4.1-mini",
    instructions: `${ITEM_ASSEMBLY_PROMPT}\n[조립 예시 JSON]\n${assemblyExamples(closestCatalogId)}\n[API 출력 보충]\n모든 부품에 mirror와 repeat를 반드시 넣는다. 사용하지 않으면 null이다. 각뿔 sides도 반드시 넣는다. 도형별 지정 필드만 사용한다.`,
    input: [{ role: "user", content: JSON.stringify(input) }],
    text: { format: { type: "json_schema", name: "item_assembly", strict: true, schema: ITEM_ASSEMBLY_SCHEMA } },
    max_output_tokens: 12000, store: false,
  };
}

/** Server function only. A later generation job should call this after inferItem. */
export async function assembleItem(inference: ItemInference, measure: GenerationMeasure = async (_stage, work) => await work()) {
  const closest = await measure("catalog_example_selection", () => pickClosestCatalogId(inference));
  const request = buildItemAssemblyRequest(inference, closest);
  if (JSON.stringify(request.input).length > 4000) throw new ItemAIError("INVALID_ASSEMBLY_INPUT", 422, "조립 입력이 너무 깁니다.");
  return measure("geometry_generation", () => callModel("ASSEMBLY", request, 120000, {
    unavailable: "조립 응답을 받지 못했습니다.",
    failed: "조립 요청에 실패했습니다. 키와 모델 설정을 확인해 주세요.",
    invalid: "조립 결과를 검증하지 못했습니다.",
  }, value => parseItemAssembly(value, inference.itemName)));
}

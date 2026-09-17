export type ItemInference = {
  coreExperience: string; evidence: string[]; itemName: string; subject: string;
  selectionReason: string; studentMessage: string;
  sizeClass: "small" | "medium" | "large"; appearance: string[];
};
const text = { type: "string" };
export const ITEM_INFERENCE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    coreExperience: text, evidence: { type: "array", items: text }, itemName: text,
    subject: text, selectionReason: text, studentMessage: text,
    sizeClass: { type: "string", enum: ["small", "medium", "large"] },
    appearance: { type: "array", items: text },
  },
  required: ["coreExperience", "evidence", "itemName", "subject", "selectionReason", "studentMessage", "sizeClass", "appearance"],
};
export const EVIDENCE_MISMATCH = "근거가 실제 학생 발화와 일치하지 않습니다.";
export function parseItemInference(value: unknown, studentUtterances: string[]): ItemInference {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("추론 결과는 JSON 객체여야 합니다.");
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 8 || Object.keys(v).some(key => !ITEM_INFERENCE_SCHEMA.required.includes(key))) throw new Error("추론 필드가 잘못되었습니다.");
  const string = (v: unknown, max: number) => {
    if (typeof v !== "string" || !v.trim() || v.length > max) throw new Error("추론 문자열이 잘못되었습니다.");
    return v;
  };
  const array = (v: unknown, min: number, maxChars: number) => {
    if (!Array.isArray(v) || v.length < min || v.length > 4) throw new Error("추론 배열이 잘못되었습니다.");
    return v.map(v => string(v, maxChars));
  };
  const evidence = array(v.evidence, 1, 1000);
  if (evidence.some(q => !studentUtterances.some(u => u.includes(q)))) throw new Error(EVIDENCE_MISMATCH);
  if (v.sizeClass !== "small" && v.sizeClass !== "medium" && v.sizeClass !== "large") throw new Error("크기 분류가 잘못되었습니다.");
  return {
    coreExperience: string(v.coreExperience, 300), evidence, itemName: string(v.itemName, 80),
    subject: string(v.subject, 200), selectionReason: string(v.selectionReason, 500),
    studentMessage: string(v.studentMessage, 300), sizeClass: v.sizeClass, appearance: array(v.appearance, 2, 200),
  };
}

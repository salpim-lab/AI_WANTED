import { parseLabItem, type AssembledItemSpec } from "./assembledItem";
import { ITEM_SHAPE_CATALOG } from "../openai/prompts/item-assembly";

type Schema = { type?: string | string[]; enum?: unknown[]; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; items?: Schema; anyOf?: Schema[] };
const numeric: Schema = { type: "number" };
const text: Schema = { type: "string" };
const vector: Schema = { type: "array", items: numeric };
const points: Schema = { type: "array", items: vector };
const fields = {
  box: { size: vector, roundness: numeric },
  sphere: { radius: numeric },
  ellipsoid: { size: vector },
  hemisphere: { radius: numeric },
  cylinder: { radius: numeric, height: numeric },
  ellipticCylinder: { radiusX: numeric, radiusZ: numeric, height: numeric },
  prism: { radius: numeric, height: numeric, sides: { type: "integer" } },
  cone: { radius: numeric, height: numeric },
  frustum: { radiusTop: numeric, radiusBottom: numeric, height: numeric },
  pyramid: { width: numeric, depth: numeric, height: numeric, sides: { type: "integer" } },
  capsule: { radius: numeric, length: numeric },
  curvedTube: { points, radius: numeric },
  torus: { radius: numeric, tubeRadius: numeric },
  torusArc: { radius: numeric, tubeRadius: numeric, arc: numeric },
  extrudedShape: { points, depth: numeric, bevel: numeric },
  curvedPlate: { width: numeric, height: numeric, depth: numeric, bend: numeric },
  hollowContainer: { radiusTop: numeric, radiusBottom: numeric, height: numeric, wallThickness: numeric, bottomThickness: numeric },
} satisfies Record<keyof typeof ITEM_SHAPE_CATALOG, Record<string, Schema>>;
function object(properties: Record<string, Schema>): Schema {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}
const common = {
  id: text, position: vector, rotation: vector, color: text,
  mirror: { type: ["string", "null"], enum: ["x", null] } satisfies Schema,
  repeat: { anyOf: [object({ count: { type: "integer" }, step: vector }), { type: "null" }] } satisfies Schema,
};
export const ITEM_ASSEMBLY_SCHEMA = object({
  version: { type: "integer", enum: [1] }, name: text,
  parts: { type: "array", items: { anyOf: Object.entries(fields).map(([shape, values]) => object({ ...common, shape: { type: "string", enum: [shape] }, ...values })) } },
});

/** Mirrors the strict wire schema before the renderer enforces bounds and relationships. */
function check(value: unknown, schema: Schema): void {
  if (schema.anyOf) {
    if (schema.anyOf.some(branch => { try { check(value, branch); return true; } catch { return false; } })) return;
    throw new Error("조립 JSON의 도형 또는 선택 필드가 잘못되었습니다.");
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (!types.includes(actual) && !(types.includes("integer") && typeof value === "number" && Number.isInteger(value))) throw new Error("조립 JSON 값의 형식이 잘못되었습니다.");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("조립 숫자는 유한해야 합니다.");
  if (schema.enum && !schema.enum.includes(value)) throw new Error("조립 JSON에 허용하지 않는 값이 있습니다.");
  if (actual === "object") {
    const v = value as Record<string, unknown>;
    if (Object.keys(v).some(key => !Object.hasOwn(schema.properties!, key)) || schema.required!.some(key => !Object.hasOwn(v, key))) throw new Error("조립 JSON 필드가 누락되거나 추가되었습니다.");
    for (const [key, child] of Object.entries(schema.properties!)) check(v[key], child);
  }
  if (Array.isArray(value)) value.forEach(v => check(v, schema.items!));
}
export function parseItemAssembly(value: unknown, expectedName: string): AssembledItemSpec {
  check(value, ITEM_ASSEMBLY_SCHEMA);
  const wire = value as { version: 1; name: string; parts: Record<string, unknown>[] };
  if (wire.name !== expectedName) throw new Error("추론된 아이템 이름을 변경할 수 없습니다.");
  const spec = parseLabItem({ ...wire, parts: wire.parts.map(p => ({ ...p, mirror: p.mirror ?? undefined, repeat: p.repeat ?? undefined })) });
  if ("shape" in spec) throw new Error("조립 부품 배열이 필요합니다.");
  return spec;
}

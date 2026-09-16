import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createExtrudedItem, parseExtrudedItem, type ExtrudedItemSpec } from "./extrudedItem";

type Vec3 = [number, number, number];
type CommonPart = { id: string; position: Vec3; rotation: Vec3; color: string };
export type ItemPart = CommonPart & (
  | { shape: "box"; size: Vec3; roundness: number }
  | { shape: "pyramid"; width: number; depth: number; height: number }
);
export type AssembledItemSpec = { version: 1; name: string; parts: ItemPart[] };
export type LabItemSpec = ExtrudedItemSpec | AssembledItemSpec;

export const HOUSE_SPEC: AssembledItemSpec = {
  version: 1, name: "작은 집",
  parts: [
    { id: "body", shape: "box", size: [0.75, 0.6, 0.65], roundness: 0.025, position: [0, 0.3, 0], rotation: [0, 0, 0], color: "#F4DFC0" },
    { id: "roof", shape: "pyramid", width: 0.96, depth: 0.86, height: 0.38, position: [0, 0.59, 0], rotation: [0, 0, 0], color: "#C77760" },
    { id: "door", shape: "box", size: [0.17, 0.31, 0.04], roundness: 0.01, position: [0, 0.155, 0.333], rotation: [0, 0, 0], color: "#8D674E" },
    { id: "window-left", shape: "box", size: [0.14, 0.15, 0.04], roundness: 0.01, position: [-0.235, 0.38, 0.333], rotation: [0, 0, 0], color: "#93C4D4" },
    { id: "window-right", shape: "box", size: [0.14, 0.15, 0.04], roundness: 0.01, position: [0.235, 0.38, 0.333], rotation: [0, 0, 0], color: "#93C4D4" },
  ],
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("설계서와 각 부품은 JSON 객체여야 해요.");
  return value as Record<string, unknown>;
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`숫자는 ${min}~${max} 범위여야 해요.`);
  return value;
}
function vector(value: unknown, min: number, max: number): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) throw new Error("크기·위치·회전은 숫자 3개로 입력해 주세요.");
  return [number(value[0], min, max), number(value[1], min, max), number(value[2], min, max)];
}

export function parseLabItem(value: unknown): LabItemSpec {
  const v = object(value);
  if (v.shape === "extrudedShape") return parseExtrudedItem(value);
  if (v.version !== 1 || typeof v.name !== "string" || !v.name.trim() || v.name.length > 80) throw new Error("version은 1, 이름은 1~80자로 입력해 주세요.");
  if (!Array.isArray(v.parts) || v.parts.length < 1 || v.parts.length > 30) throw new Error("부품 명령은 1~30개여야 해요.");
  const ids = new Set<string>();
  const parts = v.parts.map((raw): ItemPart => {
    const p = object(raw);
    if (typeof p.id !== "string" || !p.id.trim() || p.id.length > 80 || ids.has(p.id)) throw new Error("부품 ID는 비어 있거나 중복되면 안 돼요.");
    ids.add(p.id);
    if (typeof p.color !== "string" || !/^#[0-9a-f]{6}$/i.test(p.color)) throw new Error("부품 색은 #F5C84C 형식이어야 해요.");
    const common: CommonPart = { id: p.id, color: p.color, position: vector(p.position, -2, 2), rotation: vector(p.rotation, -Math.PI * 2, Math.PI * 2) };
    if (p.shape === "box") {
      const size = vector(p.size, 0.02, 2);
      return { ...common, shape: "box", size, roundness: number(p.roundness, 0, Math.min(...size) / 2) };
    }
    if (p.shape === "pyramid") return { ...common, shape: "pyramid", width: number(p.width, 0.02, 2), depth: number(p.depth, 0.02, 2), height: number(p.height, 0.02, 2) };
    throw new Error("이번 조립 테스트는 box와 pyramid 도형을 지원해요.");
  });
  return { version: 1, name: v.name, parts };
}

/** Rectangular pyramid: base centered at local y=0, apex at y=height. */
function pyramidGeometry(width: number, depth: number, height: number) {
  const w = width / 2, d = depth / 2;
  const corners = [[-w, 0, -d], [w, 0, -d], [w, 0, d], [-w, 0, d]];
  const vertices: number[] = [];
  for (let i = 0; i < 4; i++) vertices.push(...corners[i], 0, height, 0, ...corners[(i + 1) % 4]);
  vertices.push(...corners[0], ...corners[1], ...corners[2], ...corners[0], ...corners[2], ...corners[3]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createLabItem(value: unknown): THREE.Group {
  const spec = parseLabItem(value);
  if ("shape" in spec) return createExtrudedItem(spec);
  const content = new THREE.Group();
  for (const part of spec.parts) {
    const geometry = part.shape === "pyramid"
      ? pyramidGeometry(part.width, part.depth, part.height)
      : part.roundness > 0
        ? new RoundedBoxGeometry(...part.size, 2, part.roundness)
        : new THREE.BoxGeometry(...part.size);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.65, metalness: 0 }));
    mesh.name = part.id;
    mesh.position.set(...part.position);
    mesh.rotation.set(...part.rotation);
    content.add(mesh);
  }
  const bounds = new THREE.Box3().setFromObject(content);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = 1 / Math.max(size.x, size.y, size.z);
  content.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  content.scale.setScalar(scale);
  const model = new THREE.Group();
  model.name = spec.name;
  model.add(content);
  model.userData.baseDiameter = Math.hypot(size.x, size.z) * scale;
  return model;
}

import * as THREE from "three";
import { parseExtendedShape, createExtendedGeometry, type ExtendedShape } from "./itemShapes";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createExtrudedItem, parseExtrudedItem, type ExtrudedItemSpec } from "./extrudedItem";

type Vec3 = [number, number, number];
type CommonPart = { id: string; position: Vec3; rotation: Vec3; color: string; mirror?: "x"; repeat?: { count: number; step: Vec3 } };
export type ItemPart = CommonPart & (
  | { shape: "box"; size: Vec3; roundness: number }
  | { shape: "pyramid"; width: number; depth: number; height: number; sides?: number }
  | { shape: "ellipsoid"; size: Vec3 }
  | { shape: "cylinder"; radius: number; height: number }
  | { shape: "curvedTube"; points: Vec3[]; radius: number }
  | { shape: "extrudedShape"; points: [number, number][]; depth: number; bevel: number }
  | ExtendedShape
);
export type ItemSizeClass = "small" | "medium" | "large";
/** Island scale per size class; medium keeps the original gift size. */
export const ITEM_SIZE_SCALE: Record<ItemSizeClass, number> = { small: 0.55, medium: 1, large: 1.35 };
export type AssembledItemSpec = { version: 1; name: string; sizeClass?: ItemSizeClass; parts: ItemPart[] };
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
function vector(value: unknown, min = -Infinity, max = Infinity): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) throw new Error("크기·위치·회전은 숫자 3개로 입력해 주세요.");
  return [number(value[0], min, max), number(value[1], min, max), number(value[2], min, max)];
}
function dimension(value: unknown): number {
  const n = number(value, 0, Infinity);
  if (n === 0) throw new Error("도형 크기는 0보다 커야 해요.");
  return n;
}
function sizeVector(value: unknown): Vec3 {
  return vector(value).map(dimension) as Vec3;
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
    if (p.mirror !== undefined && p.mirror !== "x") throw new Error("대칭 축은 x만 지원해요.");
    const common: CommonPart = { id: p.id, color: p.color, mirror: p.mirror as "x" | undefined, position: vector(p.position), rotation: vector(p.rotation) };
    if (p.repeat !== undefined) {
      const repeat = object(p.repeat);
      const count = number(repeat.count, 2, 30);
      if (!Number.isInteger(count)) throw new Error("반복 개수는 정수여야 해요.");
      common.repeat = { count, step: vector(repeat.step) };
      for (let i = 1; i < count; i++) vector(common.position.map((v, axis) => v + common.repeat!.step[axis] * i));
    }
    if (p.shape === "box") {
      const size = sizeVector(p.size);
      return { ...common, shape: "box", size, roundness: Math.min(number(p.roundness, 0, Infinity), Math.min(...size) / 2) };
    }
    if (p.shape === "ellipsoid") return { ...common, shape: "ellipsoid", size: sizeVector(p.size) };
    if (p.shape === "extrudedShape") {
      const outline = parseExtrudedItem({ ...p, version: 1, name: p.id });
      return { ...common, shape: "extrudedShape", points: outline.points, depth: outline.depth, bevel: outline.bevel };
    }
    if (p.shape === "cylinder") return { ...common, shape: "cylinder", radius: dimension(p.radius), height: dimension(p.height) };
    if (p.shape === "curvedTube") {
      if (!Array.isArray(p.points) || p.points.length < 2 || p.points.length > 4) throw new Error("곡선 관의 제어점은 2~4개여야 해요.");
      const points = p.points.map(point => vector(point));
      if (points.some((point, i) => i > 0 && point.every((n, axis) => n === points[i - 1][axis]))) throw new Error("연속된 곡선 제어점은 서로 달라야 해요.");
      const radius = dimension(p.radius);
      return { ...common, shape: "curvedTube", points, radius };
    }
    if (p.shape === "pyramid" && p.sides !== undefined && (!Number.isInteger(p.sides) || number(p.sides, 3, 12) < 3)) throw new Error("각뿔의 변 수는 3~12 정수여야 해요.");
    if (p.shape === "pyramid") return { ...common, shape: "pyramid", sides: p.sides as number | undefined, width: dimension(p.width), depth: dimension(p.depth), height: dimension(p.height) };
    return { ...common, ...parseExtendedShape(p) };
  });
  if (parts.reduce((count, part) => count + (part.mirror ? 2 : 1) * (part.repeat?.count ?? 1), 0) > 60) throw new Error("복제 후 부품은 최대 60개예요.");
  if (v.sizeClass !== undefined && !(typeof v.sizeClass === "string" && v.sizeClass in ITEM_SIZE_SCALE)) throw new Error("sizeClass는 small, medium, large 중 하나예요.");
  const sizeClass = v.sizeClass as ItemSizeClass | undefined;
  return sizeClass ? { version: 1, name: v.name, sizeClass, parts } : { version: 1, name: v.name, parts };
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
    let geometry: THREE.BufferGeometry;
    switch (part.shape) {
      case "box": geometry = part.roundness > 0 ? new RoundedBoxGeometry(...part.size, 2, part.roundness) : new THREE.BoxGeometry(...part.size); break;
      case "pyramid":
        if (part.sides !== undefined && part.sides !== 4) {
          geometry = new THREE.ConeGeometry(1, part.height, part.sides);
          geometry.rotateY(Math.PI / 6);
          geometry.computeBoundingBox();
          const size = geometry.boundingBox!.getSize(new THREE.Vector3());
          geometry.scale(part.width / size.x, 1, part.depth / size.z);
          geometry.translate(0, part.height / 2, 0);
        } else geometry = pyramidGeometry(part.width, part.depth, part.height);
        break;
      case "ellipsoid": geometry = new THREE.SphereGeometry(0.5, 24, 16); geometry.scale(...part.size); break;
      case "cylinder": geometry = new THREE.CylinderGeometry(part.radius, part.radius, part.height, 20); break;
      case "curvedTube": {
        const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(part.points.map(p => new THREE.Vector3(...p))), 40, part.radius, 16, false);
        const caps = [part.points[0], part.points[part.points.length - 1]].map(point => new THREE.SphereGeometry(part.radius, 16, 12).translate(...point));
        geometry = mergeGeometries([tube, ...caps])!;
        tube.dispose(); caps.forEach(cap => cap.dispose());
        break;
      }
      default: geometry = createExtendedGeometry(part); break;
      case "extrudedShape": {
        const shape = new THREE.Shape();
        part.points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
        shape.closePath();
        geometry = new THREE.ExtrudeGeometry(shape, { depth: part.depth, steps: 1, bevelEnabled: part.bevel > 0, bevelSize: part.bevel, bevelThickness: part.bevel, bevelSegments: 3 });
        geometry.translate(0, 0, -part.depth / 2);
        break;
      }
    }
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.65, metalness: 0 }));
    mesh.name = part.id;
    // The island renders shadows; without them a ball or other point-contact item reads as floating.
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(...part.position);
    mesh.rotation.set(...part.rotation);
    for (let i = 0; i < (part.repeat?.count ?? 1); i++) {
      const copy = i === 0 ? mesh : mesh.clone();
      copy.name = i === 0 ? part.id : `${part.id}-repeat-${i}`;
      if (part.repeat) copy.position.set(...part.position.map((v, axis) => v + part.repeat!.step[axis] * i) as Vec3);
      content.add(copy);
      if (part.mirror === "x") {
        const mirrored = new THREE.Group();
        mirrored.scale.x = -1;
        const reflected = copy.clone();
        reflected.name = `${copy.name}-mirrored`;
        mirrored.add(reflected);
        content.add(mirrored);
      }
    }
  }
  // precise: rotated parts use their vertices, not their rotated bounding boxes, so the item rests on y=0.
  const bounds = new THREE.Box3().setFromObject(content, true);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = 1 / Math.max(size.x, size.y, size.z);
  content.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  content.scale.setScalar(scale);
  const model = new THREE.Group();
  model.name = spec.name;
  model.add(content);
  model.userData.baseDiameter = Math.hypot(size.x, size.z) * scale;
  model.userData.sizeScale = ITEM_SIZE_SCALE[spec.sizeClass ?? "medium"];
  return model;
}

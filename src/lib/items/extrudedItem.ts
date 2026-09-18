import * as THREE from "three";

/** v1 prototype: XY outline, +Z front, radians, normalized longest side = 1. */
export type ExtrudedItemSpec = {
  version: 1;
  name: string;
  shape: "extrudedShape";
  points: [number, number][];
  depth: number;
  bevel: number;
  color: string;
};

export const STAR_SPEC: ExtrudedItemSpec = {
  version: 1,
  name: "반짝이 별",
  shape: "extrudedShape",
  points: Array.from({ length: 10 }, (_, i) => {
    const angle = Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 === 0 ? 0.5 : 0.24;
    return [Number((Math.cos(angle) * radius).toFixed(4)), Number((Math.sin(angle) * radius).toFixed(4))];
  }),
  depth: 0.18,
  bevel: 0.025,
  color: "#F5C84C",
};

export function parseExtrudedItem(value: unknown): ExtrudedItemSpec {
  if (!value || typeof value !== "object") throw new Error("JSON 객체를 입력해 주세요.");
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || v.shape !== "extrudedShape") throw new Error("version은 1, shape은 extrudedShape이어야 해요.");
  if (typeof v.name !== "string" || !v.name.trim() || v.name.length > 80) throw new Error("이름은 1~80자로 입력해 주세요.");
  if (typeof v.color !== "string" || !/^#[0-9a-f]{6}$/i.test(v.color)) throw new Error("색은 #F5C84C 형식으로 입력해 주세요.");
  if (typeof v.depth !== "number" || !Number.isFinite(v.depth) || v.depth <= 0) throw new Error("두께는 0보다 큰 유한한 숫자여야 해요.");
  if (typeof v.bevel !== "number" || !Number.isFinite(v.bevel) || v.bevel < 0) throw new Error("모서리 둥글기는 0 이상의 유한한 숫자여야 해요.");
  if (!Array.isArray(v.points) || v.points.length < 3 || v.points.length > 32) throw new Error("윤곽점은 3~32개여야 해요.");
  const points: [number, number][] = v.points.map((p: unknown) => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every(n => typeof n === "number" && Number.isFinite(n))) throw new Error("윤곽점은 유한한 [x, y] 숫자 쌍이어야 해요.");
    return [p[0], p[1]];
  });
  const area = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);
  if (!Number.isFinite(area) || area === 0) throw new Error("윤곽에는 유한한 넓이가 있어야 해요.");
  return { version: 1, name: v.name, shape: "extrudedShape", points, depth: v.depth, bevel: Math.min(v.bevel, v.depth / 2), color: v.color };
}

export function createExtrudedItem(value: unknown) {
  const spec = parseExtrudedItem(value);
  const shape = new THREE.Shape();
  spec.points.forEach(([x, y], i) => i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: spec.depth, steps: 1, bevelEnabled: spec.bevel > 0,
    bevelSize: spec.bevel, bevelThickness: spec.bevel, bevelSegments: 3,
  });
  const material = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.45, metalness: 0.05 });
  const mesh = new THREE.Mesh(geometry, material);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const scale = 1 / Math.max(size.x, size.y, size.z);
  geometry.translate(-center.x, -box.min.y, -center.z);
  geometry.scale(scale, scale, scale);
  const group = new THREE.Group();
  group.name = spec.name;
  group.add(mesh);
  group.userData.baseDiameter = Math.hypot(size.x, size.z) * scale;
  return group;
}

export function disposeExtrudedItem(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materialsToDispose = new Set<THREE.Material>();
  group.traverse(object => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => materialsToDispose.add(material));
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materialsToDispose.forEach(material => material.dispose());
}

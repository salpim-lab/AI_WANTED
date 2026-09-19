import type { AssembledItemSpec, ItemPart, ItemSizeClass } from "./assembledItem";
import { CAT_SPEC } from "./sampleItems";

type Vec3 = [number, number, number];
type Vec2 = [number, number];
/**
 * names: 물건 이름. "노란 별"처럼 마지막 단어가 같거나, 두 글자 이상이면 "뭉게구름"처럼 붙여 쓴 끝부분이 같아도 매칭한다.
 * concepts: 활동·상징어. subject 전체가 정확히 같을 때만 매칭한다("축구" → 축구공, "축구화"는 제외).
 * excludes: 이름 끝이 겹치지만 다른 물건("책상다리"는 다리가 아님).
 */
export type CatalogMatch = { names: string[]; concepts: string[]; excludes?: string[] };
export type CatalogItem = { id: string; category: string; displayName: string; match: CatalogMatch; spec: AssembledItemSpec };

type PartInput = ItemPart extends infer P ? P extends ItemPart ? Omit<P, "rotation"> & { rotation?: Vec3 } : never : never;
const part = (p: PartInput): ItemPart => ({ rotation: [0, 0, 0], ...p }) as ItemPart;
type Draft = Omit<CatalogItem, "category">;
const item = (id: string, displayName: string, match: CatalogMatch, parts: ItemPart[], sizeClass?: ItemSizeClass): Draft =>
  ({ id, displayName, match, spec: sizeClass ? { version: 1, name: displayName, sizeClass, parts } : { version: 1, name: displayName, parts } });
const category = (name: string, items: Draft[]): CatalogItem[] => items.map(entry => ({ ...entry, category: name }));

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const v3 = (x: number, y: number, z: number): Vec3 => [r4(x), r4(y), r4(z)];
const normalize = ([x, y, z]: Vec3): Vec3 => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
/** Euler XYZ rotation that turns local +Z toward `dir` (extrusions and tori face +Z). */
const facing = (dir: Vec3): Vec3 => { const [x, y, z] = normalize(dir); return v3(Math.atan2(-y, z), Math.asin(x), 0); };
/** Rotation that turns local +Y (cylinder/cone axis) toward angle `a` in the XY plane. */
const pointZ = (a: number): Vec3 => v3(0, 0, a - Math.PI / 2);
const polygon = (n: number, radius: number, start = Math.PI / 2): Vec2[] =>
  Array.from({ length: n }, (_, i) => [r4(Math.cos(start + (i * 2 * Math.PI) / n) * radius), r4(Math.sin(start + (i * 2 * Math.PI) / n) * radius)]);
const starOutline = (outer: number, inner: number): Vec2[] =>
  Array.from({ length: 10 }, (_, i) => { const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? inner : outer; return [r4(Math.cos(a) * r), r4(Math.sin(a) * r)]; });
/** Pointed leaf, base at y=0 and tip at y=length. */
const leafOutline = (length: number, width: number, n = 20): Vec2[] => {
  const side = (s: number) => width / 2 * Math.pow(Math.sin(Math.PI * s), 0.85) * (1 - 0.25 * s);
  const half = n / 2;
  const right = Array.from({ length: half + 1 }, (_, i): Vec2 => [r4(side(i / half)), r4((i / half) * length)]);
  const left = Array.from({ length: half - 1 }, (_, i): Vec2 => { const s = 1 - (i + 1) / half; return [r4(-side(s)), r4(s * length)]; });
  return [...right, ...left];
};
const heartOutline = (size: number, n = 28): Vec2[] => Array.from({ length: n }, (_, i) => {
  const t = (i / n) * Math.PI * 2;
  return [r4(Math.pow(Math.sin(t), 3) * 16 * size / 34), r4((13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * size / 34)];
});
/** Crescent opening to the right: outer circle radius `outer`, bitten by a circle of radius `inner` shifted by `offset`. */
const crescentOutline = (outer: number, inner: number, offset: number): Vec2[] => {
  const x = (outer ** 2 - inner ** 2 + offset ** 2) / (2 * offset), y = Math.sqrt(outer ** 2 - x ** 2);
  const a0 = Math.atan2(y, x), b0 = Math.atan2(y, x - offset);
  const outerArc = Array.from({ length: 16 }, (_, i): Vec2 => { const a = a0 + (i / 15) * (2 * Math.PI - 2 * a0); return [r4(outer * Math.cos(a)), r4(outer * Math.sin(a))]; });
  const innerArc = Array.from({ length: 12 }, (_, i): Vec2 => { const b = 2 * Math.PI - b0 - ((i + 1) / 13) * (2 * Math.PI - 2 * b0); return [r4(offset + inner * Math.cos(b)), r4(inner * Math.sin(b))]; });
  return [...outerArc, ...innerArc];
};

const BALL_R = 0.35, BALL_Y = 0.35;
const onBall = (dir: Vec3, lift = 0): Vec3 => { const [x, y, z] = normalize(dir); return v3(x * (BALL_R + lift), BALL_Y + y * (BALL_R + lift), z * (BALL_R + lift)); };
/** Seam ring: small circle on the ball around `dir`, `angle` radians from its centre. */
const ballRing = (id: string, dir: Vec3, angle: number, color: string) => {
  const [x, y, z] = normalize(dir), d = BALL_R * Math.cos(angle);
  return part({ id, shape: "torus", radius: r4(BALL_R * Math.sin(angle) + 0.002), tubeRadius: 0.011, position: v3(x * d, BALL_Y + y * d, z * d), rotation: facing(dir), color });
};

const PHI = (1 + Math.sqrt(5)) / 2;
const ICOSA: Vec3[] = [
  [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
  [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1],
];

/** Tennis-ball curve (exactly on a unit sphere when a + b = 1), split into Catmull-Rom tube segments. */
const baseballSeam = (color: string): ItemPart[] => {
  const a = 0.62, b = 0.38, c = 2 * Math.sqrt(a * b);
  const at = (t: number) => onBall([c * Math.sin(2 * t), a * Math.sin(t) - b * Math.sin(3 * t), a * Math.cos(t) + b * Math.cos(3 * t)], 0.004);
  return Array.from({ length: 8 }, (_, s) => part({
    id: `seam-${s + 1}`, shape: "curvedTube", radius: 0.012, position: [0, 0, 0], color,
    points: Array.from({ length: 4 }, (_, i) => at(((s + i / 3) / 8) * Math.PI * 2)),
  }));
};

const ROOF_SLOPE = Math.atan2(0.3, 0.35);

export const ITEM_CATALOG: CatalogItem[] = [
  ...category("운동", [
    item("soccer_ball", "축구공", { names: ["축구공", "축구 볼", "풋살공", "soccer ball"], concepts: ["축구", "축구하기", "공 차기", "공차기", "축구 경기", "축구 시합", "풋살"] }, [
      part({ id: "ball", shape: "sphere", radius: BALL_R, position: [0, BALL_Y, 0], color: "#F7F7F2" }),
      ...ICOSA.map((dir, i) => part({ id: `patch-${i + 1}`, shape: "extrudedShape", points: polygon(5, 0.1), depth: 0.03, bevel: 0.005, position: onBall(dir, -0.008), rotation: facing(dir), color: "#20252B" })),
    ], "small"),
    item("basketball", "농구공", { names: ["농구공", "농구 볼", "basketball"], concepts: ["농구", "농구하기", "농구 경기", "농구 시합"] }, [
      part({ id: "ball", shape: "sphere", radius: BALL_R, position: [0, BALL_Y, 0], color: "#E47A32" }),
      ballRing("seam-vertical", [1, 0, 0], Math.PI / 2, "#3E2A22"),
      ballRing("seam-horizontal", [0, 1, 0], Math.PI / 2, "#3E2A22"),
      ballRing("seam-curve-right", [Math.cos(0.5), 0, Math.sin(0.5)], 0.8, "#3E2A22"),
      ballRing("seam-curve-left", [-Math.cos(0.5), 0, Math.sin(0.5)], 0.8, "#3E2A22"),
    ], "small"),
    item("baseball", "야구공", { names: ["야구공", "야구 볼", "baseball"], concepts: ["야구", "야구하기", "야구 경기", "야구 시합", "캐치볼"] }, [
      part({ id: "ball", shape: "sphere", radius: BALL_R, position: [0, BALL_Y, 0], color: "#F7F5EC" }),
      ...baseballSeam("#D2463F"),
    ], "small"),
    item("dodgeball", "피구공", { names: ["피구공", "피구 공", "dodgeball"], concepts: ["피구", "피구하기", "피구 경기"] }, [
      part({ id: "ball", shape: "sphere", radius: BALL_R, position: [0, BALL_Y, 0], color: "#E8574A" }),
      ballRing("seam-vertical", [1, 0, 0], Math.PI / 2, "#F7F7F2"),
      ballRing("seam-horizontal", [0, 1, 0], Math.PI / 2, "#F7F7F2"),
      ballRing("seam-front", [0, 0, 1], Math.PI / 2, "#F7F7F2"),
    ], "small"),
    item("soccer_cleats", "축구화", { names: ["축구화", "축구 신발", "cleats"], concepts: [] }, [
      part({ id: "sole", shape: "box", size: [0.27, 0.05, 0.66], roundness: 0.02, position: [0, 0.055, 0], color: "#2F3440" }),
      ...[[-0.07, -0.22], [0.07, -0.22], [-0.07, 0], [0.07, 0], [-0.065, 0.22], [0.065, 0.22]].map(([x, z], i) => part({ id: `stud-${i + 1}`, shape: "cylinder", radius: 0.02, height: 0.04, position: [x, 0.02, z], color: "#F7F7F2" })),
      part({ id: "toe", shape: "ellipsoid", size: [0.25, 0.15, 0.3], position: [0, 0.16, 0.2], color: "#5AA0E8" }),
      part({ id: "body", shape: "ellipsoid", size: [0.26, 0.24, 0.56], position: [0, 0.19, -0.04], color: "#4A90D9" }),
      part({ id: "collar", shape: "ellipsoid", size: [0.24, 0.26, 0.24], position: [0, 0.29, -0.2], color: "#4A90D9" }),
      part({ id: "tongue", shape: "box", size: [0.14, 0.03, 0.2], roundness: 0.01, position: [0, 0.3, -0.02], rotation: [0.45, 0, 0], color: "#F7F7F2" }),
      part({ id: "lace", shape: "box", size: [0.15, 0.014, 0.02], roundness: 0.005, position: [0, 0.305, 0.04], rotation: [0.35, 0, 0], color: "#F7F7F2", repeat: { count: 3, step: [0, -0.014, 0.05] } }),
    ], "small"),
  ]),
  ...category("자연·상징", [
    item("flower", "꽃", { names: ["꽃", "꽃송이", "들꽃", "벚꽃", "꽃다발", "화초", "장미", "튤립", "해바라기", "민들레", "코스모스", "flower"], concepts: [] }, [
      part({ id: "grass", shape: "hemisphere", radius: 0.14, position: [0, 0, 0], color: "#7FA84B" }),
      part({ id: "stem", shape: "curvedTube", points: [[0, 0.05, 0], [0.02, 0.3, 0], [-0.01, 0.52, 0.02], [0, 0.66, 0.03]], radius: 0.022, position: [0, 0, 0], color: "#5E8A3A" }),
      part({ id: "leaf", shape: "extrudedShape", points: leafOutline(0.22, 0.1, 12), depth: 0.02, bevel: 0.006, position: [-0.02, 0.3, 0.01], rotation: [0, 0, 0.9], color: "#6E9A3C", mirror: "x" }),
      ...Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return part({ id: `petal-${i + 1}`, shape: "ellipsoid", size: [0.12, 0.2, 0.05], position: v3(Math.cos(a) * 0.13, 0.72 + Math.sin(a) * 0.13, 0.03), rotation: pointZ(a), color: i % 2 ? "#F29BB3" : "#E77A9C" });
      }),
      part({ id: "center", shape: "ellipsoid", size: [0.15, 0.15, 0.09], position: [0, 0.72, 0.06], color: "#F2C54E" }),
    ], "small"),
    item("leaf", "나뭇잎", { names: ["나뭇잎", "잎사귀", "잎", "이파리", "단풍잎", "leaf"], concepts: ["자연"] }, [
      part({ id: "blade", shape: "extrudedShape", points: leafOutline(0.72, 0.46), depth: 0.05, bevel: 0.014, position: [0, 0.12, 0], color: "#6E9A3C" }),
      part({ id: "midrib", shape: "curvedTube", points: [[0, 0.02, 0.045], [0.005, 0.4, 0.05], [0, 0.76, 0.042]], radius: 0.011, position: [0, 0, 0], color: "#A6C962" }),
      part({ id: "vein", shape: "box", size: [0.16, 0.02, 0.02], roundness: 0.008, position: [-0.07, 0.3, 0.04], rotation: [0, 0, -0.6], color: "#A6C962", mirror: "x", repeat: { count: 3, step: [0.008, 0.14, 0] } }),
    ], "small"),
    item("cloud", "구름", { names: ["구름", "cloud"], concepts: ["하늘"] }, [
      part({ id: "base", shape: "capsule", radius: 0.15, length: 0.52, position: [0, 0.15, 0], rotation: [0, 0, Math.PI / 2], color: "#E3F0F2" }),
      part({ id: "puff-center", shape: "sphere", radius: 0.24, position: [0.04, 0.3, 0], color: "#FFFFFF" }),
      part({ id: "puff-left", shape: "sphere", radius: 0.18, position: [-0.2, 0.24, 0.02], color: "#FAFDFF" }),
      part({ id: "puff-right", shape: "sphere", radius: 0.15, position: [0.26, 0.2, 0.02], color: "#FAFDFF" }),
      part({ id: "puff-back", shape: "sphere", radius: 0.17, position: [-0.05, 0.25, -0.1], color: "#EEF6F8" }),
    ]),
    item("sun", "태양", { names: ["태양", "해", "해님", "햇님", "sun"], concepts: ["햇빛", "햇살"] }, [
      part({ id: "core", shape: "sphere", radius: 0.24, position: [0, 0.5, 0], color: "#F6C445" }),
      ...Array.from({ length: 10 }, (_, i) => {
        const a = Math.PI / 2 + (i * Math.PI) / 5;
        return part({ id: `ray-${i + 1}`, shape: "cone", radius: 0.055, height: 0.15, position: v3(Math.cos(a) * 0.33, 0.5 + Math.sin(a) * 0.33, 0), rotation: pointZ(a), color: "#F29B45" });
      }),
    ]),
    item("moon", "달", { names: ["달", "초승달", "보름달", "반달", "moon"], concepts: ["달빛", "밤하늘"] }, [
      part({ id: "crescent", shape: "extrudedShape", points: crescentOutline(0.4, 0.34, 0.2), depth: 0.14, bevel: 0.03, position: [0, 0.42, 0], rotation: [0, 0, 0.35], color: "#F2DC8A" }),
      part({ id: "crater-1", shape: "cylinder", radius: 0.035, height: 0.02, position: [-0.29, 0.36, 0.1], rotation: [Math.PI / 2, 0, 0], color: "#DDC06C" }),
      part({ id: "crater-2", shape: "cylinder", radius: 0.022, height: 0.02, position: [-0.24, 0.55, 0.1], rotation: [Math.PI / 2, 0, 0], color: "#DDC06C" }),
    ]),
    item("star", "별", { names: ["별", "샛별", "star"], concepts: ["별빛"] }, [
      part({ id: "star", shape: "extrudedShape", points: starOutline(0.5, 0.24), depth: 0.18, bevel: 0.04, position: [0, 0.42, 0], color: "#F2C54E" }),
      part({ id: "shine", shape: "extrudedShape", points: starOutline(0.26, 0.125), depth: 0.04, bevel: 0.01, position: [0, 0.43, 0.12], color: "#FFE58A" }),
    ]),
    item("heart", "하트", { names: ["하트", "heart"], concepts: ["마음", "사랑"] }, [
      part({ id: "heart", shape: "extrudedShape", points: heartOutline(0.5, 32), depth: 0.2, bevel: 0.03, position: [0, 0.3, 0], color: "#E4606F" }),
      part({ id: "shine", shape: "ellipsoid", size: [0.1, 0.06, 0.03], position: [-0.1, 0.42, 0.13], rotation: [0, 0, 0.6], color: "#F6C0C2" }),
    ]),
    item("snail", "달팽이", { names: ["달팽이", "snail"], concepts: [] }, [
      part({ id: "foot-body", shape: "ellipsoid", size: [0.28, 0.18, 1.02], position: [0, 0.12, 0], color: "#C99A62" }),
      part({ id: "neck", shape: "ellipsoid", size: [0.27, 0.25, 0.4], position: [0, 0.22, 0.3], color: "#C99A62" }),
      part({ id: "head", shape: "ellipsoid", size: [0.3, 0.27, 0.3], position: [0, 0.29, 0.49], color: "#C99A62" }),
      part({ id: "shell", shape: "ellipsoid", size: [0.4, 0.6, 0.6], position: [0, 0.41, -0.08], color: "#A9693F" }),
      part({ id: "shell-spiral-outer", shape: "torusArc", radius: 0.17, tubeRadius: 0.025, arc: 5.5, mirror: "x", position: [-0.15, 0.41, -0.08], rotation: [0, Math.PI / 2, 0], color: "#71452F" }),
      part({ id: "shell-spiral-inner", shape: "torusArc", radius: 0.085, tubeRadius: 0.022, arc: 4.8, mirror: "x", position: [-0.18, 0.41, -0.08], rotation: [0, Math.PI / 2, 0], color: "#71452F" }),
      part({ id: "shell-spiral-center", shape: "sphere", radius: 0.035, mirror: "x", position: [-0.19, 0.41, -0.08], color: "#71452F" }),
      part({ id: "upper-feeler", shape: "curvedTube", radius: 0.018, mirror: "x", position: [0, 0, 0], color: "#C99A62", points: [[-0.075, 0.37, 0.53], [-0.09, 0.46, 0.57], [-0.135, 0.56, 0.6], [-0.18, 0.64, 0.62]] }),
      part({ id: "eye", shape: "sphere", radius: 0.032, mirror: "x", position: [-0.18, 0.64, 0.62], color: "#2F2926" }),
      part({ id: "lower-feeler", shape: "curvedTube", radius: 0.013, mirror: "x", position: [0, 0, 0], color: "#C99A62", points: [[-0.08, 0.29, 0.59], [-0.12, 0.31, 0.65], [-0.16, 0.32, 0.7]] }),
      part({ id: "tail-tip", shape: "ellipsoid", size: [0.23, 0.14, 0.3], position: [0, 0.13, -0.49], color: "#C99A62" }),
    ], "small"),
  ]),
  ...category("학교", [
    item("book", "책", { names: ["책", "동화책", "그림책", "만화책", "소설책", "교과서", "book"], concepts: ["독서", "읽기", "책 읽기"] }, [
      part({ id: "pages", shape: "box", size: [0.46, 0.62, 0.16], roundness: 0.01, position: [0.015, 0.34, 0], color: "#FBF6E6" }),
      part({ id: "cover-front", shape: "box", size: [0.5, 0.68, 0.035], roundness: 0.012, position: [0, 0.34, 0.095], color: "#4F7CC0" }),
      part({ id: "cover-back", shape: "box", size: [0.5, 0.68, 0.035], roundness: 0.012, position: [0, 0.34, -0.095], color: "#4F7CC0" }),
      part({ id: "spine", shape: "ellipticCylinder", radiusX: 0.04, radiusZ: 0.112, height: 0.68, position: [-0.245, 0.34, 0], color: "#3F68A6" }),
      part({ id: "title", shape: "box", size: [0.28, 0.1, 0.02], roundness: 0.006, position: [0.02, 0.5, 0.112], color: "#FBF6E6" }),
      part({ id: "title-line", shape: "box", size: [0.2, 0.024, 0.02], roundness: 0.008, position: [0.02, 0.36, 0.11], color: "#F2C54E" }),
      part({ id: "bookmark", shape: "box", size: [0.04, 0.12, 0.02], roundness: 0.006, position: [0.12, 0.05, 0.02], color: "#D95C59" }),
    ], "small"),
    item("notebook", "공책", { names: ["공책", "노트", "수첩", "일기장", "notebook"], concepts: ["일기", "일기 쓰기"] }, [
      part({ id: "pages", shape: "box", size: [0.5, 0.66, 0.05], roundness: 0.008, position: [0.01, 0.34, 0], color: "#FFFFFF" }),
      part({ id: "cover", shape: "box", size: [0.5, 0.68, 0.02], roundness: 0.006, position: [0.01, 0.34, 0.034], color: "#7FB7A4" }),
      part({ id: "back", shape: "box", size: [0.5, 0.68, 0.02], roundness: 0.006, position: [0.01, 0.34, -0.034], color: "#7FB7A4" }),
      part({ id: "ring", shape: "torus", radius: 0.042, tubeRadius: 0.01, position: [-0.235, 0.07, 0], rotation: [Math.PI / 2, 0, 0], color: "#9AA3AE", repeat: { count: 9, step: [0, 0.068, 0] } }),
      part({ id: "label", shape: "box", size: [0.3, 0.2, 0.02], roundness: 0.006, position: [0.04, 0.47, 0.04], color: "#FFFFFF" }),
      part({ id: "label-line", shape: "box", size: [0.24, 0.02, 0.02], roundness: 0.006, position: [0.04, 0.52, 0.043], color: "#6B8FC5", repeat: { count: 3, step: [0, -0.05, 0] } }),
    ], "small"),
    item("pencil", "연필", { names: ["연필", "색연필", "pencil"], concepts: ["필기", "글쓰기"] }, [
      part({ id: "eraser", shape: "capsule", radius: 0.052, length: 0.04, position: [0, 0.072, 0], color: "#EF9AA6" }),
      part({ id: "ferrule", shape: "cylinder", radius: 0.062, height: 0.08, position: [0, 0.14, 0], color: "#B9C0C8" }),
      part({ id: "ferrule-groove", shape: "torus", radius: 0.062, tubeRadius: 0.01, position: [0, 0.12, 0], rotation: [Math.PI / 2, 0, 0], color: "#8E969F", repeat: { count: 2, step: [0, 0.04, 0] } }),
      part({ id: "body", shape: "prism", radius: 0.066, height: 0.54, sides: 6, position: [0, 0.45, 0], color: "#F2C54E" }),
      part({ id: "wood", shape: "cone", radius: 0.058, height: 0.15, position: [0, 0.795, 0], color: "#EBC894" }),
      part({ id: "lead", shape: "cone", radius: 0.022, height: 0.056, position: [0, 0.842, 0], color: "#3A3A40" }),
    ], "small"),
    item("paintbrush", "붓", { names: ["붓", "그림붓", "paintbrush"], concepts: ["그림", "그리기", "그림 그리기", "미술"] }, [
      part({ id: "handle", shape: "frustum", radiusTop: 0.032, radiusBottom: 0.022, height: 0.5, position: [0, 0.27, 0], color: "#C0463F" }),
      part({ id: "handle-end", shape: "sphere", radius: 0.022, position: [0, 0.02, 0], color: "#C0463F" }),
      part({ id: "ferrule", shape: "frustum", radiusTop: 0.042, radiusBottom: 0.033, height: 0.13, position: [0, 0.58, 0], color: "#B9C0C8" }),
      part({ id: "bristles", shape: "ellipsoid", size: [0.09, 0.24, 0.09], position: [0, 0.72, 0], color: "#E8D2A8" }),
      part({ id: "paint", shape: "ellipsoid", size: [0.084, 0.12, 0.084], position: [0, 0.78, 0], color: "#8E6BC7" }),
      part({ id: "tip", shape: "cone", radius: 0.03, height: 0.08, position: [0, 0.855, 0], color: "#8E6BC7" }),
    ], "small"),
    item("backpack", "가방", { names: ["가방", "책가방", "배낭", "학교 가방", "backpack"], concepts: ["등교"] }, [
      part({ id: "body", shape: "box", size: [0.52, 0.62, 0.3], roundness: 0.1, position: [0, 0.33, 0], color: "#5F9A78" }),
      part({ id: "flap", shape: "box", size: [0.42, 0.24, 0.04], roundness: 0.018, position: [0, 0.5, 0.15], color: "#4E8466" }),
      part({ id: "buckle", shape: "box", size: [0.06, 0.07, 0.02], roundness: 0.008, mirror: "x", position: [-0.12, 0.4, 0.175], color: "#F2C54E" }),
      part({ id: "pocket", shape: "box", size: [0.36, 0.2, 0.1], roundness: 0.04, position: [0, 0.16, 0.16], color: "#F2C54E" }),
      part({ id: "zipper", shape: "box", size: [0.3, 0.02, 0.02], roundness: 0.006, position: [0, 0.22, 0.205], color: "#C79A2E" }),
      part({ id: "handle", shape: "torusArc", radius: 0.08, tubeRadius: 0.018, arc: Math.PI, position: [0, 0.63, 0], color: "#3F6E54" }),
      part({ id: "strap", shape: "curvedTube", points: [[-0.14, 0.58, -0.15], [-0.17, 0.4, -0.22], [-0.16, 0.12, -0.18]], radius: 0.022, mirror: "x", position: [0, 0, 0], color: "#3F6E54" }),
    ], "small"),
  ]),
  ...category("생활", [
    item("apple", "사과", { names: ["사과", "apple"], concepts: ["과일"] }, [
      part({ id: "body", shape: "ellipsoid", size: [0.6, 0.52, 0.58], position: [0, 0.3, 0], color: "#D94B4B" }),
      part({ id: "bottom", shape: "ellipsoid", size: [0.4, 0.24, 0.38], position: [0, 0.14, 0], color: "#D94B4B" }),
      part({ id: "dimple", shape: "ellipsoid", size: [0.14, 0.03, 0.14], position: [0, 0.555, 0], color: "#A83838" }),
      part({ id: "highlight", shape: "ellipsoid", size: [0.07, 0.12, 0.03], position: [-0.17, 0.38, 0.22], rotation: [0, -0.5, 0.3], color: "#F08A80" }),
      part({ id: "stem", shape: "curvedTube", points: [[0, 0.5, 0], [0.01, 0.6, 0], [0.04, 0.67, 0]], radius: 0.016, position: [0, 0, 0], color: "#6B4A32" }),
      part({ id: "leaf", shape: "extrudedShape", points: leafOutline(0.18, 0.1, 12), depth: 0.02, bevel: 0.005, position: [0.03, 0.62, 0], rotation: [0.3, 0, -1.1], color: "#5E8A3A" }),
    ], "small"),
    item("cup", "컵", { names: ["컵", "머그컵", "머그", "물컵", "찻잔", "cup", "mug"], concepts: ["물", "마시기"] }, [
      part({ id: "mug", shape: "hollowContainer", radiusTop: 0.22, radiusBottom: 0.19, height: 0.44, wallThickness: 0.025, bottomThickness: 0.03, position: [0, 0.22, 0], color: "#6FAFC6" }),
      part({ id: "stripe", shape: "frustum", radiusTop: 0.221, radiusBottom: 0.217, height: 0.05, position: [0, 0.31, 0], color: "#F7F7F2" }),
      part({ id: "water", shape: "cylinder", radius: 0.19, height: 0.02, position: [0, 0.36, 0], color: "#CDEBF5" }),
      part({ id: "handle", shape: "torusArc", radius: 0.1, tubeRadius: 0.026, arc: Math.PI, position: [0.2, 0.23, 0], rotation: [0, 0, -Math.PI / 2], color: "#6FAFC6" }),
    ], "small"),
    item("umbrella", "우산", { names: ["우산", "양산", "umbrella"], concepts: ["비", "비 오는 날", "장마"] }, [
      part({ id: "canopy", shape: "cone", radius: 0.46, height: 0.26, position: [0, 0.85, 0], color: "#5C86C9" }),
      part({ id: "canopy-cap", shape: "cone", radius: 0.185, height: 0.104, position: [0, 0.928, 0], color: "#E77A83" }),
      ...Array.from({ length: 8 }, (_, i) => part({ id: `rib-tip-${i + 1}`, shape: "sphere", radius: 0.022, position: v3(Math.cos((i * Math.PI) / 4) * 0.46, 0.72, Math.sin((i * Math.PI) / 4) * 0.46), color: "#E77A83" })),
      part({ id: "top", shape: "sphere", radius: 0.03, position: [0, 0.99, 0], color: "#E77A83" }),
      part({ id: "shaft", shape: "cylinder", radius: 0.014, height: 0.86, position: [0, 0.55, 0], color: "#8E969F" }),
      part({ id: "handle", shape: "torusArc", radius: 0.07, tubeRadius: 0.02, arc: Math.PI, position: [0.07, 0.13, 0], rotation: [0, 0, Math.PI], color: "#8D674E" }),
    ]),
    item("house", "작은 집", { names: ["집", "작은 집", "주택", "오두막", "house"], concepts: ["집에 가기"] }, [
      part({ id: "body", shape: "box", size: [0.7, 0.5, 0.6], roundness: 0.02, position: [0, 0.27, 0], color: "#F4DFC0" }),
      part({ id: "gable", shape: "extrudedShape", points: [[-0.35, 0], [0.35, 0], [0, 0.3]], depth: 0.6, bevel: 0, position: [0, 0.52, 0], color: "#F4DFC0" }),
      part({ id: "roof", shape: "box", size: [0.56, 0.05, 0.72], roundness: 0.015, mirror: "x", position: v3(-0.0195 - 0.28 * Math.cos(ROOF_SLOPE), 0.8428 - 0.28 * Math.sin(ROOF_SLOPE), 0), rotation: v3(0, 0, ROOF_SLOPE), color: "#C77760" }),
      part({ id: "ridge", shape: "cylinder", radius: 0.03, height: 0.72, position: [0, 0.845, 0], rotation: [Math.PI / 2, 0, 0], color: "#AD604C" }),
      part({ id: "chimney", shape: "box", size: [0.1, 0.24, 0.1], roundness: 0.01, position: [0.2, 0.8, -0.12], color: "#A8584A" }),
      part({ id: "step", shape: "box", size: [0.26, 0.04, 0.08], roundness: 0.01, position: [0, 0.02, 0.33], color: "#C9B79C" }),
      part({ id: "door", shape: "box", size: [0.17, 0.3, 0.04], roundness: 0.015, position: [0, 0.19, 0.3], color: "#8D674E" }),
      part({ id: "knob", shape: "sphere", radius: 0.013, position: [0.05, 0.19, 0.325], color: "#F2C54E" }),
      part({ id: "window-frame", shape: "box", size: [0.16, 0.16, 0.03], roundness: 0.01, mirror: "x", position: [-0.215, 0.32, 0.3], color: "#FFFFFF" }),
      part({ id: "window", shape: "box", size: [0.12, 0.12, 0.03], roundness: 0.008, mirror: "x", position: [-0.215, 0.32, 0.31], color: "#93C4D4" }),
      part({ id: "attic-window", shape: "cylinder", radius: 0.055, height: 0.03, position: [0, 0.62, 0.3], rotation: [Math.PI / 2, 0, 0], color: "#93C4D4" }),
    ], "large"),
  ]),
  ...category("기타", [
    item("gift_box", "선물 상자", { names: ["선물 상자", "선물", "선물 꾸러미", "gift box", "gift"], concepts: ["상자"] }, [
      part({ id: "box", shape: "box", size: [0.54, 0.44, 0.54], roundness: 0.02, position: [0, 0.22, 0], color: "#F2C54E" }),
      part({ id: "lid", shape: "box", size: [0.6, 0.12, 0.6], roundness: 0.025, position: [0, 0.48, 0], color: "#F2C54E" }),
      part({ id: "ribbon-x", shape: "box", size: [0.1, 0.445, 0.545], roundness: 0.005, position: [0, 0.22, 0], color: "#D94B5E" }),
      part({ id: "ribbon-z", shape: "box", size: [0.545, 0.445, 0.1], roundness: 0.005, position: [0, 0.22, 0], color: "#D94B5E" }),
      part({ id: "lid-ribbon-x", shape: "box", size: [0.11, 0.125, 0.605], roundness: 0.005, position: [0, 0.48, 0], color: "#D94B5E" }),
      part({ id: "lid-ribbon-z", shape: "box", size: [0.605, 0.125, 0.11], roundness: 0.005, position: [0, 0.48, 0], color: "#D94B5E" }),
      part({ id: "bow-loop", shape: "torus", radius: 0.085, tubeRadius: 0.028, mirror: "x", position: [-0.1, 0.62, 0], rotation: [0, 0.35, 0.45], color: "#E4606F" }),
      part({ id: "bow-knot", shape: "sphere", radius: 0.05, position: [0, 0.575, 0], color: "#D94B5E" }),
    ], "small"),
  ]),
  ...category("관계", [
    item("bench", "벤치", { names: ["벤치", "긴 의자", "공원 벤치", "bench"], concepts: [] }, [
      part({ id: "seat-slat", shape: "box", size: [0.84, 0.035, 0.09], roundness: 0.012, position: [0, 0.3, -0.1], color: "#C98B57", repeat: { count: 3, step: [0, 0, 0.105] } }),
      part({ id: "back-slat", shape: "box", size: [0.84, 0.09, 0.035], roundness: 0.012, position: [0, 0.45, -0.19], rotation: [-0.15, 0, 0], color: "#C98B57", repeat: { count: 2, step: [0, 0.13, -0.02] } }),
      part({ id: "front-leg", shape: "box", size: [0.045, 0.29, 0.045], roundness: 0.01, mirror: "x", position: [-0.35, 0.145, 0.1], color: "#555A63" }),
      part({ id: "back-leg", shape: "box", size: [0.045, 0.66, 0.045], roundness: 0.01, mirror: "x", position: [-0.35, 0.33, -0.19], rotation: [-0.08, 0, 0], color: "#555A63" }),
      part({ id: "armrest", shape: "box", size: [0.05, 0.04, 0.34], roundness: 0.015, mirror: "x", position: [-0.37, 0.43, -0.03], color: "#555A63" }),
      part({ id: "arm-post", shape: "box", size: [0.04, 0.12, 0.04], roundness: 0.01, mirror: "x", position: [-0.37, 0.36, 0.11], color: "#555A63" }),
    ]),
    item("bridge", "다리", { names: ["다리", "나무 다리", "징검다리", "구름다리", "흔들다리", "bridge"], concepts: ["화해", "친해지기", "연결"], excludes: ["책상다리", "의자다리", "식탁다리"] }, [
      ...[-0.6, -0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45, 0.6].map((a, i) => part({ id: `plank-${i + 1}`, shape: "box", size: [0.118, 0.04, 0.44], roundness: 0.01, position: v3(0.8 * Math.sin(a), 0.1 + 0.8 * (Math.cos(a) - Math.cos(0.6)), 0), rotation: v3(0, 0, -a), color: i % 2 ? "#B98555" : "#C8966A" })),
      ...[0.2, -0.2].flatMap((z, side) => [
        part({ id: `rail-${side + 1}`, shape: "curvedTube", points: [-0.6, 0, 0.6].map(a => v3(0.8 * Math.sin(a), 0.32 + 0.8 * (Math.cos(a) - Math.cos(0.6)), z)), radius: 0.018, position: [0, 0, 0], color: "#8D674E" }),
        ...[-0.6, -0.3].map((a, i) => part({ id: `post-${side + 1}-${i + 1}`, shape: "cylinder", radius: 0.022, height: 0.24, mirror: "x", position: v3(0.8 * Math.sin(a), 0.22 + 0.8 * (Math.cos(a) - Math.cos(0.6)), z), color: "#8D674E" })),
        part({ id: `post-${side + 1}-mid`, shape: "cylinder", radius: 0.022, height: 0.24, position: v3(0, 0.22 + 0.8 * (1 - Math.cos(0.6)), z), color: "#8D674E" }),
      ]),
      part({ id: "abutment", shape: "box", size: [0.14, 0.1, 0.5], roundness: 0.03, mirror: "x", position: [-0.47, 0.05, 0], color: "#A3A7AC" }),
    ], "large"),
    item("fence", "울타리", { names: ["울타리", "담장", "펜스", "fence"], concepts: ["거리 두기", "경계"] }, [
      part({ id: "picket", shape: "extrudedShape", points: [[-0.06, 0], [0.06, 0], [0.06, 0.5], [0, 0.58], [-0.06, 0.5]], depth: 0.04, bevel: 0.008, position: [-0.4, 0, 0], color: "#F4EFE4", repeat: { count: 5, step: [0.2, 0, 0] } }),
      part({ id: "rail", shape: "box", size: [0.96, 0.06, 0.03], roundness: 0.01, position: [0, 0.14, -0.04], color: "#D9CBB5", repeat: { count: 2, step: [0, 0.24, 0] } }),
    ]),
    item("dog", "강아지", { names: ["강아지", "개", "반려견", "멍멍이", "댕댕이", "puppy", "dog"], concepts: ["위로", "반려동물"] }, [
      part({ id: "body", shape: "ellipsoid", size: [0.36, 0.32, 0.56], position: [0, 0.36, 0], color: "#D9A066" }),
      part({ id: "front-leg", shape: "capsule", radius: 0.06, length: 0.16, mirror: "x", position: [-0.1, 0.14, 0.16], color: "#D9A066" }),
      part({ id: "back-leg", shape: "capsule", radius: 0.06, length: 0.16, mirror: "x", position: [-0.1, 0.14, -0.16], color: "#D9A066" }),
      part({ id: "chest", shape: "ellipsoid", size: [0.22, 0.2, 0.12], position: [0, 0.36, 0.24], color: "#F6E3C4" }),
      part({ id: "head", shape: "sphere", radius: 0.19, position: [0, 0.6, 0.27], color: "#D9A066" }),
      part({ id: "snout", shape: "ellipsoid", size: [0.17, 0.12, 0.15], position: [0, 0.55, 0.43], color: "#F6E3C4" }),
      part({ id: "nose", shape: "sphere", radius: 0.03, position: [0, 0.58, 0.505], color: "#342F32" }),
      part({ id: "eye", shape: "ellipsoid", size: [0.04, 0.055, 0.03], mirror: "x", position: [-0.075, 0.65, 0.435], color: "#342F32" }),
      part({ id: "ear", shape: "ellipsoid", size: [0.08, 0.22, 0.06], mirror: "x", position: [-0.18, 0.58, 0.25], rotation: [0, 0, -0.25], color: "#9C6B3F" }),
      part({ id: "collar", shape: "torus", radius: 0.12, tubeRadius: 0.022, position: [0, 0.47, 0.22], rotation: [Math.PI / 2 - 0.6, 0, 0], color: "#E4606F" }),
      part({ id: "tag", shape: "sphere", radius: 0.025, position: [0, 0.4, 0.32], color: "#F2C54E" }),
      part({ id: "tail", shape: "curvedTube", points: [[0, 0.42, -0.26], [0, 0.52, -0.34], [0.03, 0.6, -0.32]], radius: 0.03, position: [0, 0, 0], color: "#D9A066" }),
    ]),
    item("cat", "고양이", { names: ["고양이", "냥이", "야옹이", "길고양이", "반려묘", "kitten", "cat"], concepts: [] }, CAT_SPEC.parts),
    item("envelope", "편지봉투", { names: ["편지봉투", "편지", "손편지", "봉투", "쪽지", "letter", "envelope"], concepts: ["하고 싶은 말", "마음 전하기"], excludes: ["비닐봉투", "쓰레기봉투", "종이봉투"] }, [
      part({ id: "body", shape: "box", size: [0.72, 0.46, 0.04], roundness: 0.015, position: [0, 0.25, 0], color: "#F4EAD5" }),
      part({ id: "flap", shape: "extrudedShape", points: [[-0.35, 0], [0.35, 0], [0, -0.24]], depth: 0.02, bevel: 0.004, position: [0, 0.47, 0.025], color: "#E9DAB8" }),
      part({ id: "fold", shape: "box", size: [0.4, 0.02, 0.02], roundness: 0.006, mirror: "x", position: [-0.175, 0.12, 0.022], rotation: [0, 0, 0.475], color: "#E9DAB8" }),
      part({ id: "seal", shape: "extrudedShape", points: heartOutline(0.1, 20), depth: 0.02, bevel: 0.005, position: [0, 0.245, 0.04], color: "#E4606F" }),
    ], "small"),
  ]),
  ...category("고민·걱정", [
    item("stone", "돌멩이", { names: ["돌멩이", "돌", "조약돌", "바위", "rock", "stone"], concepts: ["고민", "걱정", "걱정거리", "마음에 걸리는 것"] }, [
      part({ id: "rock", shape: "ellipsoid", size: [0.8, 0.44, 0.6], position: [0, 0.22, 0], rotation: [0, 0.3, 0.05], color: "#8C9096" }),
      part({ id: "bump", shape: "ellipsoid", size: [0.44, 0.34, 0.4], position: [0.12, 0.28, 0.04], rotation: [0.2, 0, -0.2], color: "#979BA1" }),
      part({ id: "side", shape: "ellipsoid", size: [0.32, 0.24, 0.3], position: [-0.24, 0.16, 0.08], rotation: [0, 0.5, 0.1], color: "#80848A" }),
      part({ id: "pebble", shape: "ellipsoid", size: [0.14, 0.09, 0.12], position: [0.36, 0.045, 0.2], color: "#9DA1A6" }),
    ], "small"),
    item("question_sign", "물음표 표지판", { names: ["물음표 표지판", "물음표 팻말", "물음표", "question mark"], concepts: ["궁금증", "궁금한 것", "헷갈림", "헷갈리는 것", "질문"] }, [
      part({ id: "base", shape: "frustum", radiusTop: 0.06, radiusBottom: 0.1, height: 0.05, position: [0, 0.025, 0], color: "#6B7078" }),
      part({ id: "post", shape: "cylinder", radius: 0.03, height: 0.46, position: [0, 0.27, -0.01], color: "#8E969F" }),
      part({ id: "board", shape: "cylinder", radius: 0.3, height: 0.05, position: [0, 0.72, 0], rotation: [Math.PI / 2, 0, 0], color: "#F2C54E" }),
      part({ id: "rim", shape: "torus", radius: 0.3, tubeRadius: 0.025, position: [0, 0.72, 0], color: "#E0A13B" }),
      part({ id: "hook", shape: "curvedTube", points: [[-0.1, 0.8, 0.035], [0, 0.9, 0.035], [0.1, 0.8, 0.035], [0, 0.68, 0.035]], radius: 0.032, position: [0, 0, 0], color: "#3A3A40" }),
      part({ id: "stem", shape: "curvedTube", points: [[0, 0.68, 0.035], [0, 0.62, 0.035]], radius: 0.032, position: [0, 0, 0], color: "#3A3A40" }),
      part({ id: "dot", shape: "sphere", radius: 0.037, position: [0, 0.53, 0.035], color: "#3A3A40" }),
    ]),
    item("locked_box", "자물쇠 상자", { names: ["자물쇠 상자", "비밀 상자", "보물 상자", "보석함", "자물쇠", "금고", "treasure chest"], concepts: ["비밀", "아무도 모르는 이야기"] }, [
      part({ id: "body", shape: "box", size: [0.6, 0.34, 0.4], roundness: 0.02, position: [0, 0.17, 0], color: "#A8744A" }),
      part({ id: "lid", shape: "ellipticCylinder", radiusX: 0.12, radiusZ: 0.2, height: 0.62, position: [0, 0.34, 0], rotation: [0, 0, Math.PI / 2], color: "#B98555" }),
      part({ id: "band", shape: "box", size: [0.05, 0.35, 0.42], roundness: 0.01, mirror: "x", position: [-0.2, 0.17, 0], color: "#6B5040" }),
      part({ id: "lid-band", shape: "ellipticCylinder", radiusX: 0.125, radiusZ: 0.205, height: 0.05, mirror: "x", position: [-0.2, 0.34, 0], rotation: [0, 0, Math.PI / 2], color: "#6B5040" }),
      part({ id: "lock", shape: "box", size: [0.13, 0.12, 0.05], roundness: 0.02, position: [0, 0.3, 0.225], color: "#E0B040" }),
      part({ id: "shackle", shape: "torusArc", radius: 0.042, tubeRadius: 0.012, arc: Math.PI, position: [0, 0.36, 0.225], color: "#C9CED4" }),
      part({ id: "keyhole", shape: "cylinder", radius: 0.014, height: 0.02, position: [0, 0.3, 0.25], rotation: [Math.PI / 2, 0, 0], color: "#3A3A40" }),
    ]),
    item("lightning", "번개", { names: ["번개", "벼락", "천둥번개", "lightning"], concepts: ["속상함", "속상한 일", "천둥"] }, [
      part({ id: "bolt", shape: "extrudedShape", points: [[0.06, 0.78], [-0.18, 0.36], [0, 0.36], [-0.1, 0], [0.24, 0.48], [0.05, 0.48], [0.2, 0.78]], depth: 0.12, bevel: 0.02, position: [0, 0, 0], color: "#F6C445" }),
      part({ id: "cloud-base", shape: "capsule", radius: 0.1, length: 0.36, position: [0.02, 0.84, 0], rotation: [0, 0, Math.PI / 2], color: "#8E9AA8" }),
      part({ id: "cloud-top", shape: "sphere", radius: 0.15, position: [0.06, 0.93, 0], color: "#9AA5B1" }),
      part({ id: "cloud-side", shape: "sphere", radius: 0.11, position: [-0.14, 0.9, 0.01], color: "#A5B0BB" }),
    ]),
  ]),
  ...category("성장·강점", [
    item("sprout", "새싹", { names: ["새싹", "싹", "떡잎", "묘목", "sprout"], concepts: ["시작", "새로운 시작", "노력", "성장"] }, [
      part({ id: "pot", shape: "frustum", radiusTop: 0.22, radiusBottom: 0.16, height: 0.3, position: [0, 0.15, 0], color: "#D08560" }),
      part({ id: "rim", shape: "torus", radius: 0.22, tubeRadius: 0.03, position: [0, 0.3, 0], rotation: [Math.PI / 2, 0, 0], color: "#BF7452" }),
      part({ id: "soil", shape: "cylinder", radius: 0.2, height: 0.02, position: [0, 0.3, 0], color: "#6B4A32" }),
      part({ id: "stem", shape: "curvedTube", points: [[0, 0.3, 0], [0.01, 0.42, 0], [0, 0.52, 0.01]], radius: 0.02, position: [0, 0, 0], color: "#6E9A3C" }),
      part({ id: "leaf", shape: "extrudedShape", points: leafOutline(0.24, 0.15, 12), depth: 0.02, bevel: 0.006, mirror: "x", position: [-0.01, 0.52, 0.01], rotation: [0.25, 0, 1.15], color: "#8BC34A" }),
    ], "small"),
    item("trophy", "트로피", { names: ["트로피", "우승컵", "trophy"], concepts: ["우승", "성공", "성취", "해낸 일"] }, [
      part({ id: "base", shape: "box", size: [0.4, 0.1, 0.3], roundness: 0.02, position: [0, 0.05, 0], color: "#6B4A3A" }),
      part({ id: "plinth", shape: "box", size: [0.28, 0.08, 0.2], roundness: 0.015, position: [0, 0.14, 0], color: "#7E5847" }),
      part({ id: "plate", shape: "box", size: [0.16, 0.05, 0.02], roundness: 0.006, position: [0, 0.05, 0.15], color: "#F2C54E" }),
      part({ id: "stem", shape: "frustum", radiusTop: 0.03, radiusBottom: 0.06, height: 0.14, position: [0, 0.25, 0], color: "#D9A63A" }),
      part({ id: "knob", shape: "sphere", radius: 0.05, position: [0, 0.33, 0], color: "#E8B840" }),
      part({ id: "bowl", shape: "hollowContainer", radiusTop: 0.22, radiusBottom: 0.1, height: 0.28, wallThickness: 0.02, bottomThickness: 0.04, position: [0, 0.5, 0], color: "#F2C54E" }),
      part({ id: "handle", shape: "torusArc", radius: 0.08, tubeRadius: 0.02, arc: Math.PI, mirror: "x", position: [-0.18, 0.52, 0], rotation: [0, 0, Math.PI / 2], color: "#E8B840" }),
      part({ id: "star", shape: "extrudedShape", points: starOutline(0.07, 0.034), depth: 0.02, bevel: 0.004, position: [0, 0.53, 0.162], rotation: [-0.4, 0, 0], color: "#FFF1A8" }),
    ], "small"),
    item("stairs", "계단", { names: ["계단", "층계", "사다리", "stairs"], concepts: ["한 걸음씩", "나아지기", "발전"] }, [
      ...["#CFE3C6", "#A6C962", "#7FA84B", "#5E8A3A"].map((color, i) => part({ id: `step-${i + 1}`, shape: "box", size: v3(0.2, 0.15 * (i + 1), 0.4), roundness: 0.02, position: v3(-0.3 + 0.2 * i, 0.075 * (i + 1), 0), color })),
      part({ id: "flag-pole", shape: "cylinder", radius: 0.012, height: 0.26, position: [0.33, 0.73, -0.1], color: "#8E969F" }),
      part({ id: "flag", shape: "extrudedShape", points: [[0, 0], [0.16, -0.05], [0, -0.1]], depth: 0.02, bevel: 0.004, position: [0.34, 0.86, -0.1], color: "#F2C54E" }),
    ]),
  ]),
  ...category("꿈·바람", [
    item("lighthouse", "등대", { names: ["등대", "lighthouse"], concepts: ["꿈", "장래희망", "목표", "되고 싶은 것"] }, [
      part({ id: "rock", shape: "ellipsoid", size: [0.56, 0.16, 0.5], position: [0, 0.06, 0], color: "#8C9096" }),
      ...[[0.08, 0.28, "#F7F7F2"], [0.28, 0.48, "#D9534F"], [0.48, 0.68, "#F7F7F2"]].map(([y0, y1, color], i) => {
        const r = (y: number) => 0.2 - 0.06 * (y - 0.08) / 0.6;
        return part({ id: `tower-${i + 1}`, shape: "frustum", radiusTop: r(y1 as number), radiusBottom: r(y0 as number), height: 0.2, position: v3(0, ((y0 as number) + (y1 as number)) / 2, 0), color: color as string });
      }),
      part({ id: "door", shape: "box", size: [0.08, 0.13, 0.03], roundness: 0.01, position: [0, 0.155, 0.19], color: "#5B4636" }),
      part({ id: "window", shape: "cylinder", radius: 0.03, height: 0.03, position: [0, 0.56, 0.155], rotation: [Math.PI / 2 - 0.1, 0, 0], color: "#5B6B7A" }),
      part({ id: "gallery", shape: "cylinder", radius: 0.19, height: 0.03, position: [0, 0.695, 0], color: "#4A4F57" }),
      part({ id: "lantern", shape: "cylinder", radius: 0.1, height: 0.14, position: [0, 0.78, 0], color: "#FFE58A" }),
      part({ id: "roof", shape: "cone", radius: 0.14, height: 0.12, position: [0, 0.91, 0], color: "#D9534F" }),
      part({ id: "finial", shape: "sphere", radius: 0.025, position: [0, 0.98, 0], color: "#4A4F57" }),
    ], "large"),
    item("hot_air_balloon", "열기구", { names: ["열기구", "hot air balloon"], concepts: ["여행", "모험", "가보고 싶은 곳", "해보고 싶은 일"] }, [
      part({ id: "envelope", shape: "ellipsoid", size: [0.56, 0.62, 0.56], position: [0, 0.68, 0], color: "#E4606F" }),
      ...[0, Math.PI / 4, Math.PI / 2, -Math.PI / 4].map((a, i) => part({ id: `band-${i + 1}`, shape: "ellipsoid", size: [0.1, 0.624, 0.566], position: [0, 0.68, 0], rotation: v3(0, a, 0), color: "#F2C54E" })),
      part({ id: "skirt", shape: "frustum", radiusTop: 0.12, radiusBottom: 0.08, height: 0.12, position: [0, 0.34, 0], color: "#C94E5B" }),
      part({ id: "rope-front", shape: "cylinder", radius: 0.01, height: 0.14, mirror: "x", position: [-0.075, 0.22, 0.075], color: "#6B4A32" }),
      part({ id: "rope-back", shape: "cylinder", radius: 0.01, height: 0.14, mirror: "x", position: [-0.075, 0.22, -0.075], color: "#6B4A32" }),
      part({ id: "basket", shape: "box", size: [0.2, 0.16, 0.2], roundness: 0.025, position: [0, 0.08, 0], color: "#B98555" }),
      part({ id: "basket-rim", shape: "box", size: [0.22, 0.03, 0.22], roundness: 0.012, position: [0, 0.16, 0], color: "#8D674E" }),
    ], "large"),
    item("wishing_well", "소원 우물", { names: ["소원 우물", "우물", "wishing well"], concepts: ["소원", "소망", "바라는 것"] }, [
      part({ id: "wall", shape: "hollowContainer", radiusTop: 0.26, radiusBottom: 0.27, height: 0.26, wallThickness: 0.06, bottomThickness: 0.04, position: [0, 0.13, 0], color: "#A3A7AC" }),
      part({ id: "wall-rim", shape: "torus", radius: 0.23, tubeRadius: 0.035, position: [0, 0.26, 0], rotation: [Math.PI / 2, 0, 0], color: "#8C9096" }),
      part({ id: "water", shape: "cylinder", radius: 0.2, height: 0.02, position: [0, 0.2, 0], color: "#6FB1D6" }),
      part({ id: "coin", shape: "cylinder", radius: 0.025, height: 0.02, position: [0.06, 0.215, 0.05], color: "#F2C54E", repeat: { count: 2, step: [-0.12, 0, -0.06] } }),
      part({ id: "post", shape: "box", size: [0.05, 0.46, 0.05], roundness: 0.01, mirror: "x", position: [-0.24, 0.45, 0], color: "#8D674E" }),
      part({ id: "axle", shape: "cylinder", radius: 0.02, height: 0.5, position: [0, 0.56, 0], rotation: [0, 0, Math.PI / 2], color: "#6B4A32" }),
      part({ id: "rope", shape: "cylinder", radius: 0.01, height: 0.14, position: [0, 0.48, 0], color: "#D9CBB5" }),
      part({ id: "bucket", shape: "frustum", radiusTop: 0.055, radiusBottom: 0.045, height: 0.07, position: [0, 0.39, 0], color: "#B98555" }),
      part({ id: "roof", shape: "pyramid", width: 0.7, depth: 0.46, height: 0.2, position: [0, 0.68, 0], color: "#C77760" }),
    ]),
  ]),
  ...category("쉼·안정", [
    item("tent", "텐트", { names: ["텐트", "아지트", "비밀 기지", "비밀기지", "tent"], concepts: ["혼자 있기", "혼자만의 공간", "편한 곳", "안식처"] }, [
      part({ id: "canvas", shape: "extrudedShape", points: [[-0.42, 0], [0.42, 0], [0, 0.56]], depth: 0.72, bevel: 0.01, position: [0, 0, 0], color: "#E6A355" }),
      part({ id: "door", shape: "extrudedShape", points: [[-0.15, 0], [0.15, 0], [0, 0.36]], depth: 0.02, bevel: 0.003, position: [0, 0.005, 0.37], color: "#6B4A32" }),
      part({ id: "ridge", shape: "cylinder", radius: 0.02, height: 0.78, position: [0, 0.565, 0], rotation: [Math.PI / 2, 0, 0], color: "#8D674E" }),
      part({ id: "flag-pole", shape: "cylinder", radius: 0.01, height: 0.2, position: [0, 0.66, 0.34], color: "#8D674E" }),
      part({ id: "flag", shape: "extrudedShape", points: [[0, 0], [0.14, -0.04], [0, -0.08]], depth: 0.02, bevel: 0.004, position: [0.01, 0.76, 0.34], color: "#D94B5E" }),
    ], "large"),
    item("hammock", "해먹", { names: ["해먹", "hammock"], concepts: ["휴식", "쉬기", "쉼", "여유", "쉬고 싶은 마음"] }, [
      part({ id: "post", shape: "cylinder", radius: 0.03, height: 0.7, mirror: "x", position: [-0.46, 0.35, 0], color: "#8D674E" }),
      part({ id: "post-cap", shape: "sphere", radius: 0.035, mirror: "x", position: [-0.46, 0.7, 0], color: "#6B4A32" }),
      part({ id: "bed", shape: "curvedPlate", width: 0.7, height: 0.32, depth: 0.03, bend: 1.2, position: [0, 0.3, 0], rotation: [Math.PI / 2, 0, 0], color: "#4FA3A5" }),
      part({ id: "stripe", shape: "curvedPlate", width: 0.71, height: 0.06, depth: 0.034, bend: 1.2, position: [0, 0.3, 0], rotation: [Math.PI / 2, 0, 0], color: "#F2C54E" }),
      part({ id: "rope", shape: "curvedTube", points: [[-0.33, 0.4, 0], [-0.4, 0.52, 0], [-0.45, 0.6, 0]], radius: 0.012, mirror: "x", position: [0, 0, 0], color: "#D9CBB5" }),
      part({ id: "pillow", shape: "ellipsoid", size: [0.14, 0.07, 0.22], position: [-0.22, 0.38, 0], rotation: [0, 0, -0.3], color: "#F7F7F2" }),
    ]),
    item("bedding", "이불과 베개", { names: ["이불", "베개", "담요", "이부자리", "blanket", "pillow"], concepts: ["잠", "수면", "낮잠", "피곤함", "졸림"] }, [
      part({ id: "mattress", shape: "box", size: [0.72, 0.1, 0.52], roundness: 0.04, position: [0, 0.05, 0], color: "#E9E4DA" }),
      part({ id: "blanket", shape: "box", size: [0.74, 0.08, 0.36], roundness: 0.035, position: [0, 0.13, 0.09], color: "#8FB3DD" }),
      part({ id: "blanket-fold", shape: "box", size: [0.74, 0.05, 0.08], roundness: 0.02, position: [0, 0.18, -0.05], color: "#B7CFEA" }),
      part({ id: "star", shape: "extrudedShape", points: starOutline(0.05, 0.024), depth: 0.02, bevel: 0.004, position: [0.16, 0.175, 0.14], rotation: [-Math.PI / 2, 0, 0], color: "#F2C54E", repeat: { count: 3, step: [-0.16, 0, 0.06] } }),
      part({ id: "pillow", shape: "box", size: [0.44, 0.15, 0.17], roundness: 0.06, position: [0, 0.2, -0.17], color: "#FFFFFF" }),
    ]),
  ]),
  ...category("학교·일상 보충", [
    item("clock", "시계", { names: ["시계", "알람시계", "자명종", "탁상시계", "벽시계", "clock"], concepts: ["시간", "바쁜 하루", "일정"] }, [
      part({ id: "body", shape: "cylinder", radius: 0.3, height: 0.14, position: [0, 0.4, 0], rotation: [Math.PI / 2, 0, 0], color: "#D9534F" }),
      part({ id: "face", shape: "cylinder", radius: 0.25, height: 0.02, position: [0, 0.4, 0.07], rotation: [Math.PI / 2, 0, 0], color: "#FBF6E6" }),
      part({ id: "tick-v", shape: "box", size: [0.025, 0.05, 0.02], roundness: 0.006, position: [0, 0.6, 0.085], color: "#3A3A40", repeat: { count: 2, step: [0, -0.4, 0] } }),
      part({ id: "tick-h", shape: "box", size: [0.05, 0.025, 0.02], roundness: 0.006, mirror: "x", position: [-0.2, 0.4, 0.085], color: "#3A3A40" }),
      part({ id: "hour-hand", shape: "box", size: [0.03, 0.13, 0.02], roundness: 0.008, position: v3(-0.866 * 0.055, 0.4 + 0.5 * 0.055, 0.095), rotation: v3(0, 0, Math.PI / 3), color: "#3A3A40" }),
      part({ id: "minute-hand", shape: "box", size: [0.022, 0.19, 0.02], roundness: 0.006, position: v3(0.866 * 0.085, 0.4 + 0.5 * 0.085, 0.1), rotation: v3(0, 0, -Math.PI / 3), color: "#3A3A40" }),
      part({ id: "pin", shape: "cylinder", radius: 0.02, height: 0.04, position: [0, 0.4, 0.1], rotation: [Math.PI / 2, 0, 0], color: "#D9534F" }),
      part({ id: "bell", shape: "hemisphere", radius: 0.1, mirror: "x", position: [-0.17, 0.66, 0], rotation: [0, 0, 0.5], color: "#E8B840" }),
      part({ id: "hammer", shape: "cylinder", radius: 0.015, height: 0.1, position: [0, 0.72, 0], color: "#8E969F" }),
      part({ id: "leg", shape: "capsule", radius: 0.03, length: 0.06, mirror: "x", position: [-0.18, 0.1, 0], rotation: [0, 0, -0.5], color: "#8E969F" }),
    ], "small"),
    item("smartphone", "스마트폰", { names: ["스마트폰", "핸드폰", "휴대폰", "휴대전화", "폰", "smartphone", "phone"], concepts: ["유튜브", "영상", "동영상", "미디어", "메시지", "모바일 게임"] }, [
      part({ id: "stand", shape: "box", size: [0.5, 0.08, 0.2], roundness: 0.03, position: [0, 0.04, 0], color: "#D9E7DF" }),
      part({ id: "body", shape: "box", size: [0.42, 0.82, 0.05], roundness: 0.024, position: [0, 0.47, 0], color: "#2F3440" }),
      part({ id: "screen", shape: "box", size: [0.36, 0.7, 0.02], roundness: 0.008, position: [0, 0.47, 0.022], color: "#7FB7D8" }),
      part({ id: "camera", shape: "cylinder", radius: 0.015, height: 0.02, position: [0, 0.845, 0.025], rotation: [Math.PI / 2, 0, 0], color: "#11141A" }),
      ...[["#F2C54E", 0.7], ["#E77A83", 0.58], ["#6FCF97", 0.46]].map(([color, y], i) => part({ id: `app-row-${i + 1}`, shape: "box", size: [0.07, 0.07, 0.02], roundness: 0.01, position: v3(-0.1, y as number, 0.03), color: color as string, repeat: { count: 3, step: [0.1, 0, 0] } })),
      part({ id: "home-bar", shape: "box", size: [0.12, 0.02, 0.02], roundness: 0.008, position: [0, 0.16, 0.03], color: "#F7F7F2" }),
    ], "small"),
    item("game_controller", "게임패드", { names: ["게임패드", "게임 컨트롤러", "컨트롤러", "조이스틱", "조이콘", "게임기", "휴대용 게임기", "게임 콘솔", "닌텐도", "gamepad", "game controller", "game console"], concepts: ["게임", "게임하기", "온라인 게임", "비디오 게임"] }, [
      part({ id: "body", shape: "box", size: [0.5, 0.22, 0.12], roundness: 0.055, position: [0, 0.36, 0], color: "#7C8BD9" }),
      part({ id: "grip", shape: "capsule", radius: 0.085, length: 0.14, mirror: "x", position: [-0.2, 0.24, 0], rotation: [0, 0, -0.45], color: "#7C8BD9" }),
      part({ id: "dpad-v", shape: "box", size: [0.03, 0.09, 0.02], roundness: 0.006, position: [-0.16, 0.4, 0.062], color: "#2F3440" }),
      part({ id: "dpad-h", shape: "box", size: [0.09, 0.03, 0.02], roundness: 0.006, position: [-0.16, 0.4, 0.062], color: "#2F3440" }),
      part({ id: "button-v", shape: "cylinder", radius: 0.019, height: 0.02, position: [0.16, 0.445, 0.062], rotation: [Math.PI / 2, 0, 0], color: "#F2F4FA", repeat: { count: 2, step: [0, -0.08, 0] } }),
      part({ id: "button-h", shape: "cylinder", radius: 0.019, height: 0.02, position: [0.12, 0.405, 0.062], rotation: [Math.PI / 2, 0, 0], color: "#F2F4FA", repeat: { count: 2, step: [0.08, 0, 0] } }),
      part({ id: "stick-base", shape: "cylinder", radius: 0.042, height: 0.02, mirror: "x", position: [-0.075, 0.29, 0.058], rotation: [Math.PI / 2, 0, 0], color: "#5E6BB8" }),
      part({ id: "stick", shape: "cylinder", radius: 0.03, height: 0.05, mirror: "x", position: [-0.075, 0.29, 0.075], rotation: [Math.PI / 2, 0, 0], color: "#2F3440" }),
      part({ id: "menu-button", shape: "box", size: [0.04, 0.02, 0.02], roundness: 0.008, mirror: "x", position: [-0.04, 0.42, 0.062], color: "#F2F4FA" }),
    ], "small"),
    item("tteokbokki", "떡볶이", { names: ["떡볶이", "tteokbokki"], concepts: ["떡볶이 먹기"] }, [
      part({ id: "bowl", shape: "hollowContainer", radiusTop: 0.3, radiusBottom: 0.22, height: 0.2, wallThickness: 0.03, bottomThickness: 0.03, position: [0, 0.1, 0], color: "#F6EFE2" }),
      part({ id: "sauce", shape: "cylinder", radius: 0.265, height: 0.02, position: [0, 0.15, 0], color: "#B92D1B" }),
      part({ id: "rice-cake-1", shape: "capsule", radius: 0.045, length: 0.22, position: [-0.08, 0.19, -0.12], rotation: [0, 0.3, Math.PI / 2], color: "#D9482B" }),
      part({ id: "rice-cake-2", shape: "capsule", radius: 0.045, length: 0.22, position: [0.1, 0.19, -0.07], rotation: [0, -0.5, Math.PI / 2], color: "#E2643A" }),
      part({ id: "rice-cake-3", shape: "capsule", radius: 0.045, length: 0.22, position: [-0.13, 0.19, 0.06], rotation: [0, -0.2, Math.PI / 2], color: "#D9482B" }),
      part({ id: "rice-cake-4", shape: "capsule", radius: 0.045, length: 0.22, position: [0.06, 0.19, 0.12], rotation: [0, 0.7, Math.PI / 2], color: "#E2643A" }),
      part({ id: "rice-cake-5", shape: "capsule", radius: 0.045, length: 0.22, position: [0.0, 0.19, 0.0], rotation: [0, 1.2, Math.PI / 2], color: "#D9482B" }),
      part({ id: "rice-cake-6", shape: "capsule", radius: 0.045, length: 0.22, position: [0.0, 0.25, -0.05], rotation: [0, 0.9, Math.PI / 2], color: "#E2643A" }),
      part({ id: "rice-cake-7", shape: "capsule", radius: 0.045, length: 0.22, position: [-0.05, 0.25, 0.08], rotation: [0, -0.9, Math.PI / 2], color: "#D9482B" }),
      part({ id: "rice-cake-8", shape: "capsule", radius: 0.045, length: 0.22, position: [0.09, 0.25, 0.04], rotation: [0, 0.1, Math.PI / 2], color: "#E2643A" }),
    ], "small"),
    item("ice_cube", "얼음 조각", { names: ["얼음 조각", "얼음", "얼음덩이", "얼음 덩어리", "ice"], concepts: [] }, [
      part({ id: "puddle", shape: "ellipticCylinder", radiusX: 0.36, radiusZ: 0.3, height: 0.012, position: [0, 0.006, 0], color: "#A9D8EE" }),
      part({ id: "cube", shape: "box", size: [0.4, 0.34, 0.38], roundness: 0.07, position: [0, 0.18, 0], rotation: [0, 0.35, 0], color: "#BFE6F5" }),
      part({ id: "cube-top", shape: "box", size: [0.24, 0.2, 0.24], roundness: 0.06, position: [0.03, 0.44, 0.01], rotation: [0, 0.9, 0], color: "#D6F1FA" }),
      part({ id: "chip", shape: "box", size: [0.12, 0.1, 0.12], roundness: 0.03, position: [0.3, 0.05, 0.16], rotation: [0, 0.5, 0], color: "#CBEAF7" }),
    ], "small"),
    item("well_bucket", "두레박", { names: ["두레박", "우물 두레박"], concepts: [] }, [
      part({ id: "bucket", shape: "hollowContainer", radiusTop: 0.2, radiusBottom: 0.17, height: 0.3, wallThickness: 0.025, bottomThickness: 0.03, position: [0, 0.15, 0], color: "#A67D56" }),
      part({ id: "hoop-low", shape: "torus", radius: 0.183, tubeRadius: 0.013, position: [0, 0.07, 0], rotation: [Math.PI / 2, 0, 0], color: "#6B4A32" }),
      part({ id: "hoop-high", shape: "torus", radius: 0.198, tubeRadius: 0.013, position: [0, 0.24, 0], rotation: [Math.PI / 2, 0, 0], color: "#6B4A32" }),
      part({ id: "handle", shape: "torusArc", radius: 0.2, tubeRadius: 0.014, arc: Math.PI, position: [0, 0.3, 0], color: "#6B4A32" }),
      part({ id: "rope", shape: "curvedTube", points: [[0, 0.5, 0], [0.03, 0.6, 0], [-0.03, 0.7, 0], [0, 0.8, 0]], radius: 0.014, position: [0, 0, 0], color: "#D9B36C" }),
    ], "small"),
    item("soccer_goal", "축구 골대", { names: ["축구 골대", "골대", "골문", "soccer goal", "goal"], concepts: ["골", "골 취소"] }, [
      part({ id: "post", shape: "cylinder", radius: 0.022, height: 0.5, mirror: "x", position: [-0.3, 0.25, 0], color: "#F7F7F2" }),
      part({ id: "crossbar", shape: "cylinder", radius: 0.022, height: 0.64, position: [0, 0.5, 0], rotation: [0, 0, Math.PI / 2], color: "#F7F7F2" }),
      part({ id: "back-bar", shape: "cylinder", radius: 0.015, height: 0.56, mirror: "x", position: [-0.3, 0.25, -0.125], rotation: [0.4636, 0, 0], color: "#F7F7F2" }),
      part({ id: "net", shape: "box", size: [0.58, 0.56, 0.01], roundness: 0.004, position: [0, 0.25, -0.125], rotation: [0.4636, 0, 0], color: "#EEF2F5" }),
      part({ id: "ball", shape: "sphere", radius: 0.07, position: [0, 0.07, -0.02], color: "#F7F7F2" }),
    ], "large"),
    item("microphone", "마이크", { names: ["마이크", "microphone"], concepts: ["발표", "발표하기"] }, [
      part({ id: "cap", shape: "frustum", radiusTop: 0.05, radiusBottom: 0.07, height: 0.06, position: [0, 0.03, 0], color: "#2F3440" }),
      part({ id: "handle", shape: "cylinder", radius: 0.05, height: 0.46, position: [0, 0.29, 0], color: "#3A3A40" }),
      part({ id: "button", shape: "box", size: [0.04, 0.06, 0.02], roundness: 0.008, position: [0, 0.36, 0.05], color: "#E4483F" }),
      part({ id: "head", shape: "sphere", radius: 0.15, position: [0, 0.65, 0], color: "#9AA3AE" }),
      part({ id: "band-h", shape: "torus", radius: 0.15, tubeRadius: 0.012, position: [0, 0.65, 0], rotation: [Math.PI / 2, 0, 0], color: "#2F3440" }),
      part({ id: "band-v", shape: "torus", radius: 0.15, tubeRadius: 0.012, position: [0, 0.65, 0], color: "#2F3440" }),
    ], "small"),
    item("model_rocket", "모형 로켓", { names: ["로켓", "모형 로켓", "rocket"], concepts: ["로켓 발사"] }, [
      part({ id: "flame", shape: "cone", radius: 0.08, height: 0.16, position: [0, 0.08, 0], rotation: [Math.PI, 0, 0], color: "#F2C54E" }),
      part({ id: "body", shape: "cylinder", radius: 0.13, height: 0.5, position: [0, 0.45, 0], color: "#F7F7F2" }),
      part({ id: "nose", shape: "cone", radius: 0.13, height: 0.28, position: [0, 0.84, 0], color: "#E4483F" }),
      part({ id: "window", shape: "cylinder", radius: 0.05, height: 0.03, position: [0, 0.56, 0.13], rotation: [Math.PI / 2, 0, 0], color: "#7FB7D8" }),
      part({ id: "stripe", shape: "cylinder", radius: 0.133, height: 0.05, position: [0, 0.32, 0], color: "#E4483F" }),
      part({ id: "fin-side", shape: "extrudedShape", points: [[0, 0.28], [0, 0], [0.17, 0]], depth: 0.035, bevel: 0.006, mirror: "x", position: [0.12, 0.18, 0], color: "#E4483F" }),
      part({ id: "fin-back", shape: "extrudedShape", points: [[0, 0.28], [0, 0], [0.17, 0]], depth: 0.035, bevel: 0.006, position: [0, 0.18, -0.12], rotation: [0, Math.PI / 2, 0], color: "#E4483F" }),
    ], "medium"),
    item("television", "TV", { names: ["TV", "텔레비전", "티비"], concepts: ["축구 경기 보기"] }, [
      part({ id: "base", shape: "box", size: [0.34, 0.04, 0.2], roundness: 0.012, position: [0, 0.02, 0], color: "#2F3440" }),
      part({ id: "neck", shape: "box", size: [0.1, 0.09, 0.06], roundness: 0.01, position: [0, 0.085, 0], color: "#2F3440" }),
      part({ id: "body", shape: "box", size: [0.7, 0.46, 0.1], roundness: 0.03, position: [0, 0.36, 0], color: "#2F3440" }),
      part({ id: "screen", shape: "box", size: [0.62, 0.38, 0.02], roundness: 0.008, position: [0, 0.36, 0.052], color: "#7FC98A" }),
      part({ id: "halfway-line", shape: "box", size: [0.012, 0.38, 0.01], roundness: 0.002, position: [0, 0.36, 0.064], color: "#F7F7F2" }),
      part({ id: "center-circle", shape: "torus", radius: 0.07, tubeRadius: 0.006, position: [0, 0.36, 0.064], color: "#F7F7F2" }),
    ], "medium"),
    item("school_desk", "책상", { names: ["책상", "책걸상", "책상과 의자", "desk"], concepts: ["자리 바꾸기", "짝꿍"] }, [
      part({ id: "desktop", shape: "box", size: [0.62, 0.05, 0.42], roundness: 0.015, position: [0, 0.4, 0], color: "#D9B07A" }),
      part({ id: "desk-leg-1", shape: "cylinder", radius: 0.02, height: 0.38, position: [-0.27, 0.19, -0.17], color: "#8E969F" }),
      part({ id: "desk-leg-2", shape: "cylinder", radius: 0.02, height: 0.38, position: [0.27, 0.19, -0.17], color: "#8E969F" }),
      part({ id: "desk-leg-3", shape: "cylinder", radius: 0.02, height: 0.38, position: [-0.27, 0.19, 0.17], color: "#8E969F" }),
      part({ id: "desk-leg-4", shape: "cylinder", radius: 0.02, height: 0.38, position: [0.27, 0.19, 0.17], color: "#8E969F" }),
      part({ id: "book", shape: "box", size: [0.16, 0.03, 0.22], roundness: 0.006, position: [-0.12, 0.44, 0], rotation: [0, 0.3, 0], color: "#E4483F" }),
      part({ id: "seat", shape: "box", size: [0.3, 0.04, 0.3], roundness: 0.012, position: [0, 0.24, 0.45], color: "#5AA0E8" }),
      part({ id: "backrest", shape: "box", size: [0.3, 0.28, 0.03], roundness: 0.01, position: [0, 0.4, 0.6], color: "#5AA0E8" }),
      part({ id: "chair-leg-1", shape: "cylinder", radius: 0.015, height: 0.22, position: [-0.12, 0.11, 0.33], color: "#8E969F" }),
      part({ id: "chair-leg-2", shape: "cylinder", radius: 0.015, height: 0.22, position: [0.12, 0.11, 0.33], color: "#8E969F" }),
      part({ id: "chair-leg-3", shape: "cylinder", radius: 0.015, height: 0.22, position: [-0.12, 0.11, 0.57], color: "#8E969F" }),
      part({ id: "chair-leg-4", shape: "cylinder", radius: 0.015, height: 0.22, position: [0.12, 0.11, 0.57], color: "#8E969F" }),
    ], "large"),
    item("slide", "미끄럼틀", { names: ["미끄럼틀", "slide"], concepts: ["술래잡기"] }, [
      part({ id: "platform", shape: "box", size: [0.3, 0.04, 0.3], roundness: 0.01, position: [-0.3, 0.5, 0], color: "#F2C54E" }),
      part({ id: "post-1", shape: "cylinder", radius: 0.025, height: 0.5, position: [-0.4, 0.25, -0.12], color: "#8E969F" }),
      part({ id: "post-2", shape: "cylinder", radius: 0.025, height: 0.5, position: [-0.2, 0.25, -0.12], color: "#8E969F" }),
      part({ id: "post-3", shape: "cylinder", radius: 0.025, height: 0.5, position: [-0.4, 0.25, 0.12], color: "#8E969F" }),
      part({ id: "post-4", shape: "cylinder", radius: 0.025, height: 0.5, position: [-0.2, 0.25, 0.12], color: "#8E969F" }),
      part({ id: "ramp", shape: "box", size: [0.68, 0.03, 0.24], roundness: 0.01, position: [0.1, 0.27, 0], rotation: [0, 0, -0.744], color: "#E4483F" }),
      part({ id: "rail", shape: "box", size: [0.68, 0.05, 0.02], roundness: 0.005, position: [0.1, 0.29, 0.13], rotation: [0, 0, -0.744], color: "#C93A32", repeat: { count: 2, step: [0, 0, -0.26] } }),
      part({ id: "rung", shape: "box", size: [0.02, 0.02, 0.27], roundness: 0.005, position: [-0.41, 0.12, 0], color: "#8E969F", repeat: { count: 4, step: [0, 0.12, 0] } }),
    ], "large"),
    item("clothespin", "빨래집게", { names: ["빨래집게", "집게"], concepts: [] }, [
      part({ id: "leg-left", shape: "box", size: [0.07, 0.52, 0.035], roundness: 0.01, position: [-0.04, 0.3, 0], rotation: [0, 0, 0.05], color: "#E9B94D" }),
      part({ id: "leg-right", shape: "box", size: [0.07, 0.52, 0.035], roundness: 0.01, position: [0.04, 0.3, 0], rotation: [0, 0, -0.05], color: "#E9B94D" }),
      part({ id: "spring", shape: "torus", radius: 0.035, tubeRadius: 0.012, position: [0, 0.3, 0], rotation: [0, Math.PI / 2, 0], color: "#9AA3AE" }),
    ], "small"),
    item("drying_rack", "빨래 건조대", { names: ["빨래 건조대", "건조대", "빨래대"], concepts: ["빨래"] }, [
      part({ id: "leg-front", shape: "cylinder", radius: 0.02, height: 0.6, position: [-0.38, 0.3, 0.075], rotation: [-0.245, 0, 0], color: "#DCE3EA", repeat: { count: 2, step: [0.76, 0, 0] } }),
      part({ id: "leg-back", shape: "cylinder", radius: 0.02, height: 0.6, position: [-0.38, 0.3, -0.075], rotation: [0.245, 0, 0], color: "#DCE3EA", repeat: { count: 2, step: [0.76, 0, 0] } }),
      part({ id: "top-rod", shape: "cylinder", radius: 0.014, height: 0.84, position: [0, 0.6, 0], rotation: [0, 0, Math.PI / 2], color: "#8E969F" }),
      part({ id: "low-rod", shape: "cylinder", radius: 0.012, height: 0.8, position: [0, 0.4, 0.05], rotation: [0, 0, Math.PI / 2], color: "#8E969F", repeat: { count: 2, step: [0, 0, -0.1] } }),
      part({ id: "towel", shape: "box", size: [0.22, 0.3, 0.02], roundness: 0.006, position: [-0.2, 0.44, 0], color: "#5AA0E8" }),
      part({ id: "shirt", shape: "box", size: [0.17, 0.22, 0.02], roundness: 0.006, position: [0.14, 0.48, 0], color: "#F29BB3" }),
    ], "medium"),
    item("cookies", "과자", { names: ["과자", "쿠키", "비스킷"], concepts: [] }, [
      part({ id: "cookie-1", shape: "cylinder", radius: 0.17, height: 0.05, position: [-0.14, 0.03, 0], color: "#E5B36A" }),
      part({ id: "cookie-2", shape: "cylinder", radius: 0.17, height: 0.05, position: [0.14, 0.03, 0.03], color: "#E5B36A" }),
      part({ id: "cookie-3", shape: "cylinder", radius: 0.17, height: 0.05, position: [0, 0.08, 0], color: "#E5B36A" }),
      part({ id: "chip-1", shape: "ellipsoid", size: [0.05, 0.025, 0.05], position: [-0.06, 0.108, 0.03], color: "#5B3A29" }),
      part({ id: "chip-2", shape: "ellipsoid", size: [0.05, 0.025, 0.05], position: [0.07, 0.108, -0.04], color: "#5B3A29" }),
      part({ id: "chip-3", shape: "ellipsoid", size: [0.05, 0.025, 0.05], position: [0.02, 0.108, 0.08], color: "#5B3A29" }),
      part({ id: "chip-4", shape: "ellipsoid", size: [0.05, 0.025, 0.05], position: [-0.02, 0.108, -0.07], color: "#5B3A29" }),
      part({ id: "chip-5", shape: "ellipsoid", size: [0.05, 0.025, 0.05], position: [-0.25, 0.058, 0.05], color: "#5B3A29" }),
      part({ id: "chip-6", shape: "ellipsoid", size: [0.05, 0.025, 0.05], position: [-0.2, 0.058, -0.08], color: "#5B3A29" }),
      part({ id: "chip-7", shape: "ellipsoid", size: [0.05, 0.025, 0.05], position: [0.25, 0.058, -0.03], color: "#5B3A29" }),
      part({ id: "chip-8", shape: "ellipsoid", size: [0.05, 0.025, 0.05], position: [0.2, 0.058, 0.09], color: "#5B3A29" }),
    ], "small"),
  ]),
];

export const ITEM_CATALOG_SPECS = ITEM_CATALOG.map(item => item.spec);

/**
 * AI 조립 프롬프트에 항상 넣는 검수된 조립 예시. 대상이 아니라 조립 방식을 보여 준다:
 * 강아지(몸통·머리·다리, 대칭), 작은 집(건물·지붕 윤곽), 컵(속 빈 용기·손잡이),
 * 새싹(식물·잎 윤곽·줄기), 연필(길쭉한 도구·반복), 사과(둥근 몸체·꼭지).
 */
export const ASSEMBLY_EXAMPLE_IDS = ["dog", "house", "cup", "sprout", "pencil", "apple"];

const compact = (text: string) => text.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^가-힣a-z0-9]+/g, "");
// "별 하나", "사과 한 개", "하트 모양"처럼 대상 뒤에 붙는 수량·모양 표현은 매칭 전에 뗀다.
const TRAILING_FILLER = /(?:\s*(?:하나|한\s*(?:개|송이|권|자루|장|잎|채|알|조각|마리)|\d+\s*(?:개|송이|권|자루|장|잎|채|알|마리)|모양|모형))+$/;

/** 추론된 subject를 카탈로그 아이템으로 정규화한다. 겹치면 가장 긴 이름이 이긴다("책가방" → 가방). */
export function findCatalogItem(subject: string): CatalogItem | null {
  const words = subject.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^가-힣a-z0-9\s]+/g, " ").trim().replace(TRAILING_FILLER, "").trim();
  const full = compact(words), last = compact(words.split(/\s+/).at(-1) ?? "");
  if (!full) return null;
  let best: { item: CatalogItem; score: number } | null = null;
  for (const catalogItem of ITEM_CATALOG) {
    if (catalogItem.match.excludes?.some(word => full.endsWith(compact(word)))) continue;
    for (const name of catalogItem.match.names) {
      const key = compact(name);
      // 한 글자 이름은 단어 전체가 같을 때만: "불꽃"·"특별"·"집중"이 꽃·별·집이 되지 않게 한다.
      const hit = full === key || last === key || (key.length >= 2 && full.endsWith(key));
      if (hit && (!best || key.length > best.score)) best = { item: catalogItem, score: key.length };
    }
    for (const concept of catalogItem.match.concepts) {
      const key = compact(concept);
      if (full === key && (!best || key.length > best.score)) best = { item: catalogItem, score: key.length };
    }
  }
  return best?.item ?? null;
}

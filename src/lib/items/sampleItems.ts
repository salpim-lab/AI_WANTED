import type { AssembledItemSpec, ItemPart } from "./assembledItem";

const origin = [0, 0, 0] as [number, number, number];
type PartInput = ItemPart extends infer P ? P extends ItemPart ? Omit<P, "rotation"> & { rotation?: [number, number, number] } : never : never;
function part(p: PartInput): ItemPart {
  return { rotation: origin, ...p } as ItemPart;
}

export const CAT_SPEC: AssembledItemSpec = {
  version: 1, name: "작은 고양이",
  parts: [
    part({ id: "body", shape: "ellipsoid", size: [0.42, 0.55, 0.38], position: [0, 0.3, 0], color: "#E9BD85" }),
    part({ id: "head", shape: "ellipsoid", size: [0.48, 0.39, 0.37], position: [0, 0.67, 0.035], color: "#E9BD85" }),
    part({ id: "ear", shape: "extrudedShape", points: [[-0.09, 0], [0.09, 0], [0, 0.18]], depth: 0.065, bevel: 0.005, position: [-0.15, 0.76, 0.025], rotation: [0, 0, 0.12], color: "#E9BD85", mirror: "x" }),
    part({ id: "inner-ear", shape: "extrudedShape", points: [[-0.052, 0], [0.052, 0], [0, 0.115]], depth: 0.02, bevel: 0.002, position: [-0.15, 0.793, 0.0585], rotation: [0, 0, 0.12], color: "#EFAAA4", mirror: "x" }),
    part({ id: "front-paw", shape: "ellipsoid", size: [0.13, 0.27, 0.16], position: [-0.1, 0.145, 0.16], color: "#FFF0D7", mirror: "x" }),
    part({ id: "back-paw", shape: "ellipsoid", size: [0.19, 0.16, 0.23], position: [-0.16, 0.08, 0], color: "#E9BD85", mirror: "x" }),
    part({ id: "eye", shape: "ellipsoid", size: [0.045, 0.065, 0.035], position: [-0.105, 0.69, 0.21], color: "#342F32", mirror: "x" }),
    part({ id: "muzzle", shape: "ellipsoid", size: [0.095, 0.07, 0.04], position: [-0.042, 0.612, 0.212], color: "#FFF0D7", mirror: "x" }),
    part({ id: "nose", shape: "ellipsoid", size: [0.05, 0.035, 0.035], position: [0, 0.63, 0.24], color: "#B97878" }),
    part({ id: "tail", shape: "curvedTube", points: [[0.13, 0.16, -0.13], [0.32, 0.14, -0.16], [0.39, 0.36, -0.09], [0.33, 0.48, -0.04]], radius: 0.045, position: origin, color: "#E9BD85" }),
  ],
};

export const FLAG_SPEC: AssembledItemSpec = {
  version: 1, name: "도전의 작은 깃발",
  parts: [
    part({ id: "pole", shape: "cylinder", radius: 0.025, height: 0.85, position: [-0.22, 0.425, 0], color: "#A67D56" }),
    part({ id: "flag", shape: "box", size: [0.5, 0.29, 0.045], roundness: 0.018, position: [0.025, 0.66, 0], rotation: [0, -0.12, 0], color: "#E9B94D" }),
    part({ id: "finial", shape: "ellipsoid", size: [0.075, 0.075, 0.075], position: [-0.22, 0.86, 0], color: "#E9B94D" }),
  ],
};

export const SAMPLE_STORIES: Record<string, { story: string; reason: string }> = {
  [CAT_SPEC.name]: { story: "고양이랑 놀아서 즐거웠어요.", reason: "함께 놀며 즐거웠던 고양이를 작은 입체로 담았어." },
  [FLAG_SPEC.name]: { story: "발표가 무서웠는데 끝까지 했어요.", reason: "무서웠는데도 끝까지 해낸 너의 도전을 작은 깃발에 담았어." },
};

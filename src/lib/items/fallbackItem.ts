import type { AssembledItemSpec } from "./assembledItem";

/** AI와 무관하게 항상 만들 수 있는 최종 대체 선물. 상담별 asset_catalog 행에 복사한다. */
export const FALLBACK_ITEM_SPEC: AssembledItemSpec = {
  version: 1,
  name: "이야기를 담는 선물 상자",
  parts: [
    { id: "box", shape: "box", size: [0.48, 0.38, 0.42], roundness: 0.035, position: [0, 0.19, 0], rotation: [0, 0, 0], color: "#E6B86A" },
    { id: "ribbon-x", shape: "box", size: [0.09, 0.41, 0.44], roundness: 0.015, position: [0, 0.19, 0], rotation: [0, 0, 0], color: "#D96B67" },
    { id: "ribbon-z", shape: "box", size: [0.5, 0.41, 0.09], roundness: 0.015, position: [0, 0.19, 0], rotation: [0, 0, 0], color: "#D96B67" },
    { id: "bow-loop", shape: "ellipsoid", size: [0.16, 0.09, 0.07], position: [-0.085, 0.4, 0], rotation: [0, 0, -0.35], color: "#D96B67", mirror: "x" },
    { id: "bow-knot", shape: "ellipsoid", size: [0.085, 0.085, 0.085], position: [0, 0.4, 0], rotation: [0, 0, 0], color: "#C9575D" },
  ],
};

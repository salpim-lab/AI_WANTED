export type PuzzleEdge = -1 | 0 | 1;
export type PuzzleEdges = readonly [PuzzleEdge, PuzzleEdge, PuzzleEdge, PuzzleEdge];
export type ViewMode = "island" | "classroom";
export type CameraPreset = "home" | "top" | "left" | "right" | "in" | "out";
export type GiftKind = "sprout" | "flower" | "star";

export type IslandGift = {
  id: string;
  kind: GiftKind;
  name: string;
  x: number;
  z: number;
};

export type SceneHandle = {
  camera: (preset: CameraPreset) => void;
  placeSuggested: () => void;
};

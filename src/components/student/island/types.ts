export type ViewMode = "island" | "classroom";
export type CameraPreset = "home" | "top" | "left" | "right" | "in" | "out" | "character";
export type GiftKind = "sprout" | "flower" | "star";

export type IslandGift = {
  id: string;
  kind: GiftKind;
  name: string;
  x: number;
  z: number;
  assetFormat?: "glb" | "procedural";
  geometrySpec?: unknown;
};

export type PlacementProposal = Omit<IslandGift, "id">;
// "ready": only the island shows until the student asks to place today's item.
export type PlacementPhase = "ready" | "choosing" | "moving" | "confirming" | "placing" | "farewell" | "returning" | "complete";

export type SceneHandle = {
  camera: (preset: CameraPreset) => void;
  walk: (key: string, pressed: boolean, seconds?: number) => void;
  placeSuggested: () => void;
  toggleOverview: () => void;
};


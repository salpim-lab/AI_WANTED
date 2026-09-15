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

export type PlacementProposal = Omit<IslandGift, "id">;
// "ready": only the island shows until the student asks to place today's item.
export type PlacementPhase = "ready" | "choosing" | "moving" | "confirming" | "farewell" | "complete";

export type SceneHandle = {
  camera: (preset: CameraPreset) => void;
  placeSuggested: () => void;
  toggleOverview: () => void;
};

export type IslandScreenRect = { left: number; right: number; top: number; bottom: number };

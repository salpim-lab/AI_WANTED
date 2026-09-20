export type ViewMode = "island" | "classroom";
export type CameraPreset = "home" | "top" | "left" | "right" | "in" | "out" | "character" | "placement";
export type GiftKind = "sprout" | "flower" | "star";

export type IslandGift = {
  id: string;
  kind: GiftKind;
  name: string;
  x: number;
  z: number;
  assetFormat?: "glb" | "procedural";
  geometrySpec?: unknown;
  /** 공용 데모 배치: 이동·삭제할 수 없다(서버·DB도 막는다). */
  locked?: boolean;
  /** 배치된 아이템을 눌렀을 때 보여 줄 발화 시점과 생성 사유. */
  note?: { when: string; reason: string };
};

export type PlacementProposal = Omit<IslandGift, "id">;
// "ready": only the island shows until the student asks to place today's item.
export type PlacementPhase = "ready" | "choosing" | "moving" | "confirming" | "placing" | "farewell" | "returning" | "complete";

export type SceneHandle = {
  camera: (preset: CameraPreset) => void;
  inspectIncomingItem: () => void;
  walk: (key: string, pressed: boolean, seconds?: number) => void;
  placeSuggested: () => void;
  toggleOverview: () => void;
};

// 학생 섬에서 "여기에 놓을 수 있는가"의 규칙을 화면 밖(서버 검증·시드 좌표 생성)에서도 같은 식으로 쓰기 위한 순수 모듈.
//
// IslandScene.tsx의 validPoint/resolvePlacement(개인 섬 모드)와 같은 식이다:
//   조각 안 && 조각 테두리에서 edgeMargin 이상 && 지형(물·집·길 등)이 막지 않음 && 다른 아이템과 반경이 겹치지 않음
// 좌표는 모두 섬 데이터 좌표(IslandGift.x/z와 같은 값). 씬을 고치면 이 파일도 함께 고치고 placementRules.test.mjs가 잡는다.
import { createGiftModel, GIFT_MODEL_HEIGHT } from "./islandModel";
import { canPlaceAmongGifts, createIslandLayout } from "./placement";
import { getPieceLandscape } from "./pieceLandscape";
import { assetSizeScale } from "./proceduralAsset";
import { getPuzzleLayout, getPuzzlePiecePolygon, getPuzzleTerrainMetrics, puzzlePieceContains, PUZZLE_SEED, PUZZLE_STUDENT_PIECE_MAP } from "./puzzle";
import { distanceToPuzzleRim } from "./puzzleDecorations";
import type { IslandGift } from "./types";

/** 학생 개인 섬 시드 — IslandScene의 createPuzzlePieceModel(17, …)와 같다. */
const STUDENT_ISLAND_SEED = 17;

export type PlacementAsset = Pick<IslandGift, "assetFormat" | "geometrySpec">;
export type PlacedGift = Pick<IslandGift, "id" | "x" | "z" | "assetFormat" | "geometrySpec">;

export type PlacementRules = {
  /** 아이템의 점유 반경(씬의 giftRadius와 같다). 배치 행의 footprint_radius로 저장한다. */
  radiusOf: (asset: PlacementAsset) => number;
  /** 이 자리에 놓을 수 있는가. movingId는 "이동"일 때 자기 자신을 겹침 판정에서 뺀다. */
  canPlace: (x: number, z: number, asset: PlacementAsset, others: readonly PlacedGift[], movingId?: string | null) => boolean;
  /** 조각(개인 섬 영역) 외곽 사각형 — 후보 좌표를 훑을 때 쓴다. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

let cached: PlacementRules | null = null;

export function getPlacementRules(): PlacementRules {
  if (cached) return cached;
  const layout = createIslandLayout(STUDENT_ISLAND_SEED);
  const puzzle = getPuzzleLayout(layout, PUZZLE_SEED);
  const pieceIndex = PUZZLE_STUDENT_PIECE_MAP[1];
  const piece = puzzle.pieces[pieceIndex];
  const metrics = getPuzzleTerrainMetrics(layout, pieceIndex, "personal", STUDENT_ISLAND_SEED);
  const landscape = getPieceLandscape(layout, pieceIndex);

  // IslandScene: markerDiameter = 별 모델의 baseDiameter × giftScale, itemRadius = markerDiameter / 2
  const marker = createGiftModel("star");
  const markerBaseDiameter = marker.userData.baseDiameter as number;
  const giftScale = (metrics.W / 2.75) * 0.07 / GIFT_MODEL_HEIGHT;
  const itemRadius = (markerBaseDiameter * giftScale) / 2;
  const radiusOf = (asset: PlacementAsset) => itemRadius * assetSizeScale(asset);

  const polygon = getPuzzlePiecePolygon(piece);
  const xs = polygon.map((point) => point.x), zs = polygon.map((point) => point.z);

  cached = {
    radiusOf,
    canPlace(x, z, asset, others, movingId = null) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
      const radius = radiusOf(asset);
      const point = { x, z };
      if (!puzzlePieceContains(piece, point)) return false;
      if (distanceToPuzzleRim(point, landscape.polygon) < landscape.edgeMargin) return false;
      if (!landscape.canPlace(x, z, radius)) return false;
      const gifts = others as unknown as IslandGift[];
      return canPlaceAmongGifts(x, z, layout, gifts, movingId, radius, radius * 2, radiusOf);
    },
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) },
  };
  return cached;
}

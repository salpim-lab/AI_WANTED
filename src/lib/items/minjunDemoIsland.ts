import type { IslandGift } from "@/components/student/island/types";
import { ITEM_CATALOG } from "./itemCatalog";
import saved from "./minjunDemoPlacements.json";

/** 9/1~9/11 상담(등교 morning·하교 afternoon)에서 뽑은 민준 데모 아이템 18개. 일자순, 같은 아이템은 없다. reason은 말풍선에 그대로 쓴다. */
export const MINJUN_DEMO_ITEMS = [
  { itemId: "television", date: "9/1", period: "등교", reason: "아빠랑 본 축구 경기, 마지막 골에 소리 질렀어!" }, { itemId: "school_desk", date: "9/1", period: "하교", reason: "자리 바꿔서 하준이랑 가까워졌다고 했지?" },
  { itemId: "slide", date: "9/2", period: "등교", reason: "미끄럼틀 밑에 숨어서 한 번도 안 잡혔어!" }, { itemId: "ice_cube", date: "9/2", period: "하교", reason: "손에서 제일 빨리 녹인 얼음, 네가 이겼어!" },
  { itemId: "dodgeball", date: "9/3", period: "등교", reason: "피구 오는 날, 공 피하는 건 자신 있다고 했지?" }, { itemId: "heart", date: "9/3", period: "하교", reason: "끝까지 살아남아서 심장이 쿵쾅거렸어!" },
  { itemId: "soccer_cleats", date: "9/4", period: "등교", reason: "내일 새 축구화 신고 아빠랑 축구하기로 했지?" }, { itemId: "tteokbokki", date: "9/4", period: "하교", reason: "급식 떡볶이 두 번 먹고 행복했어!" },
  { itemId: "soccer_ball", date: "9/7", period: "등교", reason: "아빠랑 찬 슛이 날아갈 것 같았다고 했지?" }, { itemId: "wishing_well", date: "9/7", period: "하교", reason: "옛날 우물로 발표 주제를 정했어!" },
  { itemId: "well_bucket", date: "9/8", period: "등교", reason: "할머니께 들은 우물 이야기가 신기했지?" }, { itemId: "microphone", date: "9/8", period: "하교", reason: "조사한 걸 말해줬더니 뿌듯했어!" },
  { itemId: "trophy", date: "9/9", period: "등교", reason: "다시 하는 축구, 무조건 이긴다고 했지?" }, { itemId: "soccer_goal", date: "9/9", period: "하교", reason: "취소된 골이 정말 억울했지?" },
  { itemId: "notebook", date: "9/10", period: "등교", reason: "떨리는 발표, 연습을 많이 했어!" }, { itemId: "clothespin", date: "9/10", period: "하교", reason: "빨래 얘기에 친구들이 웃어줬어!" },
  { itemId: "cookies", date: "9/11", period: "등교", reason: "하준이랑 버스 옆자리, 과자 세 개 챙겼어!" }, { itemId: "model_rocket", date: "9/11", period: "하교", reason: "로켓 발사에 심장이 쿵 했다고 했지?" },
] as const;

/** /item-lab/minjun-island에서 저장한 자리. 파일이 곧 원본이다. */
export type DemoPlacement = { itemId: string; x: number; z: number };
export const MINJUN_DEMO_PLACEMENTS = saved as DemoPlacement[];

export function placementsToGifts(placements: DemoPlacement[]): IslandGift[] {
  return placements.flatMap(({ itemId, x, z }) => {
    const item = ITEM_CATALOG.find(entry => entry.id === itemId);
    return item ? [{ id: `demo-${itemId}`, kind: "star" as const, name: item.displayName, x, z, assetFormat: "procedural" as const, geometrySpec: item.spec }] : [];
  });
}

export const MINJUN_DEMO_GIFTS = placementsToGifts(MINJUN_DEMO_PLACEMENTS);

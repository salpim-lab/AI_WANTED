// 담당: 김현우
// 프로토타입(docs/prototype/prototype-teacher.html)의 관찰일지 초기 목록을 그대로 옮긴 mock.
// 실제로는 lib/supabase/raw/observationLog.ts 로 조회.

export type ObservationEntry = {
  id: string;
  timestamp: string; // 서버 타임스탬프 — 실제로는 DB가 자동 부여
  title?: string;
  body: string;
  tags: string[];
};

export const INITIAL_OBSERVATIONS: ObservationEntry[] = [
  {
    id: "obs-1",
    timestamp: "2026-09-12 14:03:22",
    title: "점심시간 갈등 — 민준·서연 진술 청취",
    body: '점심 배식 줄에서 민준이와 서연이가 부딪혔다는 보고를 받고 각각 진술을 들었음. 민준이는 서연이가 먼저 밀었다고 했고, 서연이는 민준이가 자기 자리를 안 비켜줬다고 함. 두 진술이 달라 추가 관찰이 필요. 오늘 하교 시 양측 모두 "이제 괜찮다"고 했으나 지켜볼 예정.',
    tags: ["김민준", "이서연"],
  },
  {
    id: "obs-2",
    timestamp: "2026-09-10 10:21:07",
    title: "체육 시간 관찰 — 민준 팀 구성 갈등",
    body: "체육 수업 팀 구성 시 민준이가 소외감을 느꼈다는 내용을 하교 때 알게 됨. 지훈이는 의도 없었다고 하나 민준이의 감정은 실제였음. 체육 시간 팀 구성 방식을 바꾸는 것을 고려할 필요 있음. 민준이에게 다음날 따로 이야기 나눌 것.",
    tags: ["김민준", "한지훈"],
  },
  {
    id: "obs-3",
    timestamp: "2026-09-08 09:05:34",
    title: "서연 — 남색 3일 연속, 개별 관찰 시작",
    body: "서연이가 3일 연속 남색을 선택. 교실에서도 혼자 앉아있는 시간이 늘어난 것 같음. 억지로 말 걸지 않고 자연스럽게 관찰 중. 학부모 상담 시 가정 내 변화 여부 확인 필요.",
    tags: ["이서연"],
  },
];

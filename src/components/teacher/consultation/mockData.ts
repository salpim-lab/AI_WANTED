// 담당: 김현우
// 프로토타입(docs/prototype/prototype-teacher.html)의 학부모상담기록 초기 목록/추출 자료 목록 mock.
// 실제로는 lib/supabase/raw/consultationLog.ts 로 조회.

export type ConsultationEntry = {
  id: string;
  timestamp: string;
  studentName?: string;
  parentTag?: string;
  body: string;
};

export const INITIAL_CONSULTATIONS: ConsultationEntry[] = [
  {
    id: "consult-1",
    timestamp: "2026-09-11 17:30:00",
    studentName: "김민준",
    parentTag: "김민준 어머니",
    body: "전화 상담. 민준이가 최근 학교 이야기를 잘 안 한다고 걱정하심. 9월 초부터 빨강 선택 빈도가 늘었고 발화량도 줄었다는 내용 공유. 갈등 관련 사안은 학교에서 지속 관찰 중이며 큰 문제로 번지지 않도록 조치하고 있음을 안내. 다음 대면 상담 10/14 예약.",
  },
  {
    id: "consult-2",
    timestamp: "2026-09-05 16:00:00",
    studentName: "이서연",
    parentTag: "이서연 아버지",
    body: "방문 상담. 서연이가 최근 남색 선택이 잦아졌다는 내용 공유. 아버지는 집에서도 혼자 방에 있는 시간이 늘었다고 하심. 학교에서는 특별한 갈등보다는 내향적으로 자기 에너지를 충전하는 것으로 보임. 부모님도 억지로 말 걸지 않고 기다려 주시기로 함.",
  },
];

export const CONSULT_CANDIDATES = ["김민준", "이서연", "박예린", "최하준", "정지우", "이시아", "김준혁", "박수빈"];

export const EXPORT_DATA: Record<string, string[]> = {
  김민준: ["신호등 색 이력 (9월 1일~13일)", "AI 대화 전문 13건", "AI 분석 요약", "학생관찰일지 태그 2건", "갈등 기록 2건"],
  이서연: ["신호등 색 이력 (9월 1일~13일)", "AI 대화 전문 13건", "AI 분석 요약", "학생관찰일지 태그 1건"],
};

export const DEFAULT_EXPORT_ITEMS = ["신호등 색 이력", "AI 대화 전문", "AI 분석 요약"];

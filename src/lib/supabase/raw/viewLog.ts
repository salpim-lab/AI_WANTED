// 담당: 김현우 (아이 상세 · 상담 리포트 열람 기록용으로 추가. view_log 테이블 자체는 공통 기반)
// 원본(불변) — "누가 언제 무엇을 열람했는지" (기획안 9장 열람 이력, DB 스키마 v0.3 §10.4).
// 상세 화면을 열 때 서버가 1행 기록한다. 목록 조회마다 쓰지 않는다.
// insert만 있다. update/delete 함수를 추가하지 말 것.
// 서버 전용 — 페이지에서는 next/server의 after() 안에서 호출해 응답을 늦추지 않는다.
//
// 지금은 mock 저장소(_mockTeacherData.ts) 구현이다. Supabase 연결 시 view_log insert로 교체한다.

import { mockStore } from "./_mockTeacherData";

export type ViewEntityType = "student_detail" | "consultation_report";

export async function recordView(input: { viewerId: string; entityType: ViewEntityType; entityId: string }): Promise<void> {
  mockStore().viewLog.push({
    id: crypto.randomUUID(),
    viewer_id: input.viewerId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    viewed_at: new Date().toISOString(),
  });
}

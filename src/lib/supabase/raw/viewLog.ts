// 담당: 김현우 (아이 상세 · 상담 리포트 열람 기록용으로 추가. view_log 테이블 자체는 공통 기반)
// 원본(불변) — "누가 언제 무엇을 열람했는지" (기획안 9장 열람 이력, DB 스키마 v0.3 §10.4).
// 상세 화면을 열 때 서버가 1행 기록한다. 목록 조회마다 쓰지 않는다.
// insert만 있다. update/delete 함수를 추가하지 말 것.
// 서버 전용 — 페이지에서는 next/server의 after() 안에서 호출해 응답을 늦추지 않는다.
//
// Supabase 연결 (2026-09-19). entity_id는 DB student_id, viewer_id는 DB 교사 id로 바꿔 저장한다 (recordDb).
// viewed_at은 DB default now().

import { dbTeacherId, MOCK_TEACHER, recordDb } from "./_mockTeacherData";

export type ViewEntityType = "student_detail" | "consultation_report";

export async function recordView(input: { viewerId: string; entityType: ViewEntityType; entityId: string }): Promise<void> {
  // 열람 대상은 모두 아이(student_id)다. 앱이 아는 학급은 아직 mock 교사의 학급 하나뿐이다
  const db = await recordDb(MOCK_TEACHER.classId);
  const studentId = db?.dbStudentOf.get(input.entityId);
  if (!db || !studentId) throw new Error(`열람 기록 대상 학생을 찾을 수 없습니다: ${input.entityId}`);

  const { error } = await db.client.from("view_log").insert({
    viewer_id: dbTeacherId(db, input.viewerId),
    entity_type: input.entityType,
    entity_id: studentId,
  });
  if (error) throw error;
}

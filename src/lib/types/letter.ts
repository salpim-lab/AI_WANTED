// 담당: 이유민
// 등교 홈에 띄우는 선생님 편지의 데이터 계약.
//
// 근거: docs/planning/살핌_DB_스키마_v0.3.md §8 교사 피드백
//   feedback_drafts(enrollment_id, draft_text, final_text, status, sent_at)
//   - draft_text: AI 초안 (불변)
//   - final_text: 교사가 고친 실제 발송문
//   - status: pending | dismissed | sent
//   - "학생 피드백함은 status = 'sent'인 것만 조회한다"
//
// 따라서 학생 화면에 보여줄 문구는 언제나 **final_text** 이고,
// draft_text 는 학생에게 절대 노출하지 않는다 (교사 검토 전 AI 초안이므로).

export type TeacherLetterView = {
  /** feedback_drafts.id — 읽음 처리·중복 표시 방지에 쓴다 */
  id: string;
  /** feedback_drafts.final_text — 교사가 검토·발송한 문구만 */
  text: string;
  /** 보낸 교사 표시명 */
  teacherName: string;
  /** feedback_drafts.sent_at */
  sentAt: string;
  teacherPhotoUrl?: string;
};

/** 오늘 보여줄 편지가 없을 수도 있다. 그 경우가 오히려 일반적이다. */
export type TeacherLetterState =
  | { kind: "letter"; letter: TeacherLetterView }
  | { kind: "none" };

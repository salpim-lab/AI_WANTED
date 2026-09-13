// 담당: 이유민 (단독 소유, ※ 2026-09-13 재배정)
// 해석/버전 데이터 — feedback_drafts(교사 코멘트) upsert. raw와 달리 수정·갱신이 정상 흐름.
// 참고: docs/planning/살핌_DB_스키마_v0.3.md §8.1 feedback_drafts, §13 담당자별 작업 경계
// draft_text(AI 초안)는 불변, final_text(교사 최종본)만 갱신 — 필드 분리 이유는 스키마 문서 참고.
// UI는 김현우의 아이 상세 페이지에 있고, 그쪽은 이 파일을 직접 안 부르고 API route(fetch)로만 접근한다.

// TODO(이유민): upsertTeacherCommentDraft(data: {...}), saveFinalComment(data: {...}): Promise<void>

export {};

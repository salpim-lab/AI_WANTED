# 적용 대기 중인 스키마 변경 제안

여기 있는 `.sql` 은 **아직 적용되지 않았다.**
`supabase/migrations/` 에 두면 `supabase db push` 때 자동 적용되므로,
팀 합의 전까지 이 폴더에 둔다.

합의되면 파일명 앞에 타임스탬프를 붙여 `supabase/migrations/` 로 옮긴다.

| 파일 | 내용 | 상태 |
|---|---|---|
| `feedback_drafts_sent_by.sql` | 편지 작성자 기록 컬럼 | **팀 확인 대기** |

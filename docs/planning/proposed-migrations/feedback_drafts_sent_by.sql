-- 제안: feedback_drafts 에 작성자 기록 추가
-- 작성: 2026-09-16 · 이유민 (Claude 세션)
--
-- ⚠️ 아직 적용하지 않았다. supabase/migrations/ 가 아니라 이 폴더에 둔 이유다.
--    공용 스키마 변경이라 팀 합의 후 migrations/ 로 옮겨 적용할 것.
--
-- 왜 필요한가
--   feedback_drafts 는 지금 누가 편지를 보냈는지 기록하지 않는다
--   (enrollment_id, created_by='ai'|'teacher' 뿐).
--   학생 화면은 담임을 조회해 이름을 표시하는데, 보조교사·상담교사도 보낼 수 있게 되면
--   틀린 이름이 표시된다.
--
-- 왜 지금인가
--   나중에 추가하면 그 전에 쌓인 편지의 작성자를 복원할 방법이 없다.
--   컬럼 하나이고 nullable 이라 기존 데이터에 영향이 없다.

alter table public.feedback_drafts
  add column sent_by uuid references public.profiles(id);

comment on column public.feedback_drafts.sent_by is
  '편지를 발송한 교사. status=''sent'' 로 바꿀 때 채운다. 기존 행은 null(담임으로 간주).';

create index feedback_drafts_sent_by_idx
  on public.feedback_drafts(sent_by)
  where sent_by is not null;

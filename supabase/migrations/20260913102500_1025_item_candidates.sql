-- 살핌 DB 스키마 v0.3: 아이템 후보
-- 3단계 대화 AI가 추론한 후보와 실제 3D 에셋 생성을 분리한다.

create table public.item_candidates (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id),
  source_session_id uuid not null references public.checkin_sessions(id),
  source_message_id uuid references public.conversation_messages(id),
  name text not null check (btrim(name) <> ''),
  reason text not null check (btrim(reason) <> ''),
  dedup_key text not null check (btrim(dedup_key) <> ''),
  style_version text not null check (btrim(style_version) <> ''),
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'failed')),
  asset_id uuid references public.asset_catalog(id),
  created_at timestamptz not null default now(),
  check (status <> 'resolved' or asset_id is not null)
);

create index item_candidates_enrollment_created_idx
  on public.item_candidates(enrollment_id, created_at desc);

create index item_candidates_pending_idx
  on public.item_candidates(status, created_at)
  where status = 'pending';

create unique index item_candidates_source_session_idx
  on public.item_candidates(source_session_id);

comment on table public.item_candidates is
  '3단계 대화 AI가 추론한 대표 아이템. 에셋 생성 전 임시 결과를 보존하고 asset_catalog와 연결한다.';

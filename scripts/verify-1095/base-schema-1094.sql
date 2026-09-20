-- 1095 로컬 검증용 스텁: "1094 적용 직후"의 checkin_sessions·analysis_runs 관련 정의를 재현한 최소 스키마(PGlite에서 실행).
-- analysis_runs 정의는 2026-09-20 공유 DB 조회값(information_schema.columns / pg_constraint / pg_indexes / pg_policies / pg_trigger)에서 그대로 옮겼다.
-- 이 스텁은 검증 전용이며 어떤 DB에도 적용하지 않는다. 다른 테이블(conversation_messages, work_records 등)은 이 검증과 무관해 생략했다
-- (RLS 정책의 message/record/student/class 분기 대신 session 분기만 재현한다).

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key, email text, is_anonymous boolean not null default false);
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;

grant usage on schema public, auth to anon, authenticated, service_role;
-- Supabase 기본값: 새 함수에 세 역할 EXECUTE가 자동으로 붙는다(1095가 가드 함수에서 회수해야 한다).
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create function public.is_enrollment_teacher(p_enrollment_id uuid) returns boolean language sql stable as $$ select true $$;

create table public.checkin_sessions (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  demo_owner_id uuid references auth.users(id),
  session_date date not null default current_date,
  period text not null default 'morning',
  attempt integer not null default 1
);

create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  analysis_type text not null check (btrim(analysis_type) <> ''),
  source_type text not null
    check (source_type in ('session', 'message', 'record', 'student', 'class')),
  source_id uuid not null,
  provider text not null default 'mock' check (btrim(provider) <> ''),
  model text,
  prompt_version text not null check (btrim(prompt_version) <> ''),
  schema_version integer not null default 1 check (schema_version >= 1),
  category_tags text[] not null default '{}',
  moderation_flag boolean not null default false,
  needs_followup boolean not null default false,
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  demo_owner_id uuid references auth.users(id),
  check (model is null or btrim(model) <> ''),
  check (error_message is null or btrim(error_message) <> ''),
  check (status <> 'failed' or error_message is not null)
);
create index analysis_runs_source_idx on public.analysis_runs (source_type, source_id, analysis_type, created_at desc);
create index analysis_runs_demo_owner_idx on public.analysis_runs (demo_owner_id) where demo_owner_id is not null;

alter table public.checkin_sessions enable row level security;
alter table public.analysis_runs enable row level security;
grant select on public.checkin_sessions, public.analysis_runs to anon, authenticated;
grant all on public.checkin_sessions, public.analysis_runs to service_role;

-- 세션 읽기: 담당 교사(permissive) + 방문자 격리(restrictive)
create policy checkin_sessions_teacher_read on public.checkin_sessions for select to authenticated
  using (public.is_enrollment_teacher(enrollment_id));
create policy checkin_sessions_demo_owner_restrict on public.checkin_sessions as restrictive for select to authenticated
  using (demo_owner_id is null or demo_owner_id = (select auth.uid()));

-- analysis_runs 정책(공유 DB 원본의 session 분기)
create policy analysis_runs_teacher_read on public.analysis_runs for select to authenticated
  using (source_type = 'session' and exists (select 1 from public.checkin_sessions cs where cs.id = analysis_runs.source_id and public.is_enrollment_teacher(cs.enrollment_id)));
create policy analysis_runs_demo_owner_restrict on public.analysis_runs as restrictive for select to authenticated
  using (source_type = 'session' and exists (select 1 from public.checkin_sessions cs
          where cs.id = analysis_runs.source_id and (cs.demo_owner_id is null or cs.demo_owner_id = (select auth.uid()))));

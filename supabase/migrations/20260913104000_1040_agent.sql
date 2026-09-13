-- 살핌 DB 스키마 v0.3: 1040_agent
-- AI 해석 결과와 교사용 협진 Agent 대화.

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
  result jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  check (model is null or btrim(model) <> ''),
  check (error_message is null or btrim(error_message) <> ''),
  check (status <> 'failed' or error_message is not null)
);

create index analysis_runs_source_idx
  on public.analysis_runs(source_type, source_id, analysis_type, created_at desc);

create index analysis_runs_category_tags_idx
  on public.analysis_runs using gin(category_tags);

create index analysis_runs_moderation_idx
  on public.analysis_runs(created_at desc)
  where moderation_flag;

create table public.agent_threads (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id),
  class_id uuid not null references public.classes(id),
  enrollment_id uuid references public.enrollments(id),
  thread_type text not null
    check (thread_type in ('collab_meeting', 'counseling_prep')),
  title text,
  created_at timestamptz not null default now(),
  check (title is null or btrim(title) <> '')
);

create index agent_threads_teacher_created_idx
  on public.agent_threads(teacher_id, created_at desc);

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.agent_threads(id) on delete cascade,
  role text not null check (role in ('teacher', 'assistant')),
  domain text check (domain in ('learning', 'emotion', 'home')),
  content text not null check (btrim(content) <> ''),
  evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence) = 'array'),
  created_at timestamptz not null default now()
);

create index agent_messages_thread_created_idx
  on public.agent_messages(thread_id, created_at);

-- 살핌 DB 스키마 v0.3: 1030_work_records
-- 교사 업무기록, 갈등 진술, 학부모 상담과 학생 피드백.

create table public.work_records (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id),
  record_type text not null
    check (record_type in ('general', 'conflict', 'consultation', 'conference')),
  title text not null check (btrim(title) <> ''),
  body text not null check (btrim(body) <> ''),
  body_tsv tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, ''))
  ) stored,
  occurred_at timestamptz not null,
  created_by uuid not null references public.profiles(id),
  status text not null default 'draft' check (status in ('draft', 'sealed')),
  sealed_at timestamptz,
  supersedes_id uuid references public.work_records(id),
  created_at timestamptz not null default now(),
  check (
    (status = 'draft' and sealed_at is null)
    or (status = 'sealed' and sealed_at is not null)
  ),
  check (supersedes_id is null or supersedes_id <> id)
);

create index work_records_class_occurred_idx
  on public.work_records(class_id, occurred_at desc);

create index work_records_body_tsv_idx
  on public.work_records using gin(body_tsv);

create table public.work_record_students (
  work_record_id uuid not null references public.work_records(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id),
  participant_role text check (participant_role in ('participant', 'witness')),
  primary key (work_record_id, enrollment_id)
);

create index work_record_students_enrollment_idx
  on public.work_record_students(enrollment_id, work_record_id);

create table public.conflict_statements (
  id uuid primary key default gen_random_uuid(),
  work_record_id uuid not null references public.work_records(id) on delete cascade,
  enrollment_id uuid references public.enrollments(id),
  speaker_label text not null check (btrim(speaker_label) <> ''),
  content text not null check (btrim(content) <> ''),
  created_at timestamptz not null default now()
);

create index conflict_statements_record_idx
  on public.conflict_statements(work_record_id, created_at);

create table public.parent_consultations (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id),
  teacher_id uuid not null references public.profiles(id),
  work_record_id uuid references public.work_records(id),
  scheduled_at timestamptz,
  status text not null default 'preparing'
    check (status in ('preparing', 'in_progress', 'completed')),
  notes text not null default '',
  evidence_refs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence_refs) = 'array'),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index parent_consultations_enrollment_created_idx
  on public.parent_consultations(enrollment_id, created_at desc);

create table public.feedback_drafts (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id),
  draft_text text not null check (btrim(draft_text) <> ''),
  final_text text,
  status text not null default 'pending'
    check (status in ('pending', 'dismissed', 'sent')),
  created_by text not null check (created_by in ('ai', 'teacher')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check (final_text is null or btrim(final_text) <> ''),
  check (
    (status = 'sent' and sent_at is not null and final_text is not null)
    or (status <> 'sent' and sent_at is null)
  )
);

create index feedback_drafts_enrollment_status_idx
  on public.feedback_drafts(enrollment_id, status, created_at desc);

create table public.feedback_sources (
  feedback_id uuid not null references public.feedback_drafts(id) on delete cascade,
  session_id uuid not null references public.checkin_sessions(id),
  primary key (feedback_id, session_id)
);

-- 살핌 DB 스키마 v0.3: 1010_checkin
-- 학생의 등교·하교 체크인, 확정된 대화 메시지, 면담 신청.
-- 추가 전용·해시 체인·감사 트리거는 9000_integrity에서 적용한다.

create table public.checkin_sessions (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id),
  session_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  period text not null check (period in ('morning', 'afternoon')),
  attempt smallint not null default 1 check (attempt >= 1),
  mood_color text not null check (mood_color in ('green', 'yellow', 'red', 'navy')),
  status text not null default 'started'
    check (status in ('started', 'completed', 'stopped')),
  stop_reason text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (enrollment_id, session_date, period, attempt),
  check (
    (status = 'started' and completed_at is null)
    or (status in ('completed', 'stopped') and completed_at is not null)
  ),
  check (
    (status = 'stopped' and stop_reason is not null and btrim(stop_reason) <> '')
    or (status <> 'stopped' and stop_reason is null)
  )
);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.checkin_sessions(id),
  sequence integer not null check (sequence >= 1),
  speaker text not null check (speaker in ('student', 'assistant', 'system')),
  content text not null check (btrim(content) <> ''),
  input_method text not null check (input_method in ('voice', 'text', 'fixed')),
  prev_hash text,
  content_hash text,
  created_at timestamptz not null default now(),
  unique (session_id, sequence)
);

create table public.meeting_requests (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id),
  source_session_id uuid references public.checkin_sessions(id),
  requested_by text not null check (requested_by in ('student', 'system')),
  note text,
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  status text not null default 'requested'
    check (status in ('requested', 'acknowledged', 'resolved')),
  requested_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  check (note is null or btrim(note) <> ''),
  check (acknowledged_at is null or acknowledged_at >= requested_at),
  check (resolved_at is null or resolved_at >= requested_at),
  check (status = 'requested' or acknowledged_at is not null),
  check (status <> 'resolved' or resolved_at is not null)
);

create index checkin_sessions_enrollment_date_idx
  on public.checkin_sessions(enrollment_id, session_date desc);

create index checkin_sessions_date_period_status_idx
  on public.checkin_sessions(session_date, period, status);

create index meeting_requests_enrollment_status_idx
  on public.meeting_requests(enrollment_id, status);

create index meeting_requests_open_requested_idx
  on public.meeting_requests(status, requested_at desc)
  where status <> 'resolved';

comment on table public.checkin_sessions is
  '학생의 등교·하교 체크인. mood_color는 9000_integrity 적용 후 변경할 수 없다.';

comment on table public.conversation_messages is
  '확정된 전사문과 질문을 행 단위로 저장한다. 원본 음성 파일은 저장하지 않는다.';

comment on table public.meeting_requests is
  '학생 또는 안전 규칙이 생성한 교사 면담 요청. 체크인 외부에서도 생성할 수 있다.';

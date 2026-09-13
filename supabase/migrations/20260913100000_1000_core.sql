-- 살핌 DB 스키마 v0.3: 1000_core
-- 조직·교사·학생·학급·재학·동의의 공통 기반.
-- 무결성 트리거, 감사 로그와 RLS는 9000/9010 마이그레이션에서 추가한다.

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  name text not null check (btrim(name) <> ''),
  school_year integer not null check (school_year between 2000 and 2100),
  grade integer not null check (grade between 1 and 6),
  semester integer not null check (semester in (1, 2)),
  created_at timestamptz not null default now(),
  unique (school_id, school_year, grade, semester, name)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('teacher', 'admin')),
  display_name text not null check (btrim(display_name) <> ''),
  created_at timestamptz not null default now()
);

create table public.class_teachers (
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('homeroom', 'assistant', 'counselor')),
  created_at timestamptz not null default now(),
  primary key (class_id, teacher_id)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  login_code text unique,
  display_name text not null check (btrim(display_name) <> ''),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  check (login_code is null or btrim(login_code) <> '')
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  class_id uuid not null references public.classes(id),
  seat_row integer not null check (seat_row >= 1),
  seat_col integer not null check (seat_col >= 1),
  started_on date not null,
  ended_on date,
  created_at timestamptz not null default now(),
  unique (class_id, student_id, started_on),
  check (ended_on is null or ended_on >= started_on)
);

create unique index enrollments_one_active
  on public.enrollments(student_id)
  where ended_on is null;

create unique index enrollments_one_active_seat
  on public.enrollments(class_id, seat_row, seat_col)
  where ended_on is null;

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  consent_type text not null
    check (consent_type in ('guardian', 'school_approval', 'guardian_withdrawn')),
  consented_at timestamptz not null default now(),
  document_ref text,
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (document_ref is null or btrim(document_ref) <> '')
);

create index classes_school_year_idx
  on public.classes(school_id, school_year, semester);

create index class_teachers_teacher_idx
  on public.class_teachers(teacher_id, class_id);

create index enrollments_class_active_idx
  on public.enrollments(class_id, student_id)
  where ended_on is null;

create index consents_student_created_idx
  on public.consents(student_id, created_at desc);

comment on table public.enrollments is
  '학생과 학급의 학기별 관계. 화면의 student_id를 기록용 enrollment_id로 변환하는 기준.';

comment on table public.consents is
  '보호자 동의와 학교 승인의 추가 전용 이력. 철회는 guardian_withdrawn 행으로 기록.';

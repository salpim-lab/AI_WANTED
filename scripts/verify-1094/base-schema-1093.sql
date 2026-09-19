-- 1094 로컬 검증용 스텁: "1093 적용 직후"의 관련 테이블·인덱스·제약·정책을 재현한 최소 스키마(PGlite에서 실행).
-- 정의는 2026-09-20 공유 DB 조회값(pg_indexes / pg_constraint / pg_policies / pg_trigger)과 마이그레이션 원본(1020, 9000, 9010, 1093)에서
-- 옮겼다. 이 스텁은 검증 전용이며 어떤 DB에도 적용하지 않는다. 다른 테이블(students, enrollments 등)은 FK 없이 uuid 컬럼만 둔다.

-- Supabase 역할·auth 스키마 흉내
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
-- Supabase 기본값: 새 테이블·함수에 세 역할 전체 권한(함수 EXECUTE 포함)이 자동으로 붙는다. 1094가 이걸 명시적으로 회수해야 한다.
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to service_role;

create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;
create function public.reject_mutation() returns trigger language plpgsql set search_path = '' as $$
begin raise exception '% 기록은 수정하거나 삭제할 수 없습니다', TG_TABLE_NAME; end; $$;

-- RLS의 permissive 읽기 정책이 쓰는 헬퍼: 검증에서는 restrictive 계층만 보려고 항상 true.
create function public.is_enrollment_student(p_enrollment_id uuid) returns boolean language sql stable as $$ select true $$;
create function public.is_enrollment_teacher(p_enrollment_id uuid) returns boolean language sql stable as $$ select true $$;

create table public.checkin_sessions (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  demo_owner_id uuid references auth.users(id),
  session_date date not null default current_date,
  period text not null default 'morning',
  attempt integer not null default 1
);

create table public.asset_catalog (
  id uuid primary key default gen_random_uuid(),
  dedup_key text not null,
  style_version text not null default 'procedural-v2',
  asset_type text not null default 'item',
  name text not null,
  model_url text,
  thumbnail_url text,
  source text not null default 'generated',
  generation_metadata jsonb,
  status text not null default 'ready',
  created_at timestamptz not null default now(),
  asset_format text not null default 'procedural',
  geometry_spec jsonb
);
create unique index asset_catalog_dedup_key_style_version_key on public.asset_catalog using btree (dedup_key, style_version);

create table public.student_items (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  asset_id uuid not null references public.asset_catalog(id),
  source_session_id uuid references public.checkin_sessions(id),
  source_message_id uuid,
  earned_on date not null default ((now() at time zone 'Asia/Seoul')::date),
  slot integer not null,
  is_core boolean not null default false,
  earned_at timestamptz not null default now(),
  constraint student_items_slot_check check (slot > 0)
);
create unique index student_items_daily_slot on public.student_items using btree (enrollment_id, earned_on, slot);
create unique index student_items_daily_core on public.student_items using btree (enrollment_id, earned_on) where is_core;
create index student_items_enrollment_earned_idx on public.student_items using btree (enrollment_id, earned_at desc);
create trigger student_items_immutable before update or delete on public.student_items
  for each row execute function public.reject_mutation();

create table public.item_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  source_session_id uuid not null unique references public.checkin_sessions(id),
  status text not null default 'queued',
  generated_asset_id uuid references public.asset_catalog(id),
  fallback_asset_id uuid references public.asset_catalog(id),
  student_item_id uuid references public.student_items(id)
);

create table public.islands (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  name text not null,
  theme text not null,
  created_at timestamptz not null default now(),
  constraint islands_enrollment_id_key unique (enrollment_id),
  constraint islands_name_check check (btrim(name) <> ''),
  constraint islands_theme_check check (btrim(theme) <> '')
);

create table public.island_placements (
  id uuid primary key default gen_random_uuid(),
  island_id uuid not null references public.islands(id) on delete cascade,
  student_item_id uuid not null unique references public.student_items(id),
  position_x real not null default 0,
  position_y real not null default 0,
  position_z real not null default 0,
  rotation_x real not null default 0,
  rotation_y real not null default 0,
  rotation_z real not null default 0,
  scale_x real not null default 1 check (scale_x > 0),
  scale_y real not null default 1 check (scale_y > 0),
  scale_z real not null default 1 check (scale_z > 0),
  updated_at timestamptz not null default now(),
  current_asset_id uuid references public.asset_catalog(id),
  constraint island_placements_island_id_student_item_id_key unique (island_id, student_item_id)
);
create index island_placements_island_idx on public.island_placements using btree (island_id);
create index island_placements_current_asset_idx on public.island_placements using btree (current_asset_id) where current_asset_id is not null;
create trigger island_placements_updated_at before update on public.island_placements
  for each row execute function public.set_updated_at();

-- 실제 DB의 권한: 방문자(authenticated)에게는 이 테이블들에 SELECT만 있다(쓰기는 전부 service_role 서버 경로).
grant select on public.checkin_sessions, public.asset_catalog, public.student_items, public.item_generation_jobs,
  public.islands, public.island_placements to anon, authenticated;

alter table public.student_items enable row level security;
alter table public.islands enable row level security;
alter table public.island_placements enable row level security;
alter table public.asset_catalog enable row level security;

-- 9010 permissive 읽기 정책
create policy islands_read on public.islands for select to authenticated using (
  public.is_enrollment_student(enrollment_id) or public.is_enrollment_teacher(enrollment_id));
create policy asset_catalog_read on public.asset_catalog for select to authenticated using (true);
create policy student_items_read on public.student_items for select to authenticated using (
  public.is_enrollment_student(enrollment_id) or public.is_enrollment_teacher(enrollment_id));
create policy island_placements_read on public.island_placements for select to authenticated using (
  exists (select 1 from public.islands i where i.id = island_placements.island_id
    and (public.is_enrollment_student(i.enrollment_id) or public.is_enrollment_teacher(i.enrollment_id))));

-- 1093 restrictive 정책 (마이그레이션 파일 본문 그대로)
create policy student_items_demo_owner_restrict on public.student_items
as restrictive
for select to authenticated
using (
  source_session_id is not null
  and exists (
    select 1 from public.checkin_sessions cs
    where cs.id = student_items.source_session_id
      and (cs.demo_owner_id is null or cs.demo_owner_id = (select auth.uid()))
  )
);
create policy islands_no_anonymous on public.islands
as restrictive for select to authenticated
using (((select auth.jwt()) ->> 'is_anonymous')::boolean is not true);
create policy island_placements_no_anonymous on public.island_placements
as restrictive for select to authenticated
using (((select auth.jwt()) ->> 'is_anonymous')::boolean is not true);

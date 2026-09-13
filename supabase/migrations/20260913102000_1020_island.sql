-- 살핌 DB 스키마 v0.3: 1020_island
-- 학생별 섬, 재사용 가능한 3D 에셋, 아이템 획득과 배치를 분리한다.

create table public.islands (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null unique references public.enrollments(id),
  name text not null check (btrim(name) <> ''),
  theme text not null check (btrim(theme) <> ''),
  created_at timestamptz not null default now()
);

create table public.asset_catalog (
  id uuid primary key default gen_random_uuid(),
  dedup_key text not null check (btrim(dedup_key) <> ''),
  style_version text not null check (btrim(style_version) <> ''),
  asset_type text not null check (btrim(asset_type) <> ''),
  name text not null check (btrim(name) <> ''),
  model_url text not null check (btrim(model_url) <> ''),
  thumbnail_url text,
  source text not null check (source in ('preset', 'generated')),
  generation_metadata jsonb,
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  unique (dedup_key, style_version),
  check (thumbnail_url is null or btrim(thumbnail_url) <> '')
);

create table public.student_items (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id),
  asset_id uuid not null references public.asset_catalog(id),
  source_session_id uuid references public.checkin_sessions(id),
  source_message_id uuid references public.conversation_messages(id),
  earned_on date not null default ((now() at time zone 'Asia/Seoul')::date),
  slot smallint not null check (slot in (1, 2)),
  is_core boolean not null default false,
  earned_at timestamptz not null default now()
);

create unique index student_items_daily_slot
  on public.student_items(enrollment_id, earned_on, slot);

create unique index student_items_daily_core
  on public.student_items(enrollment_id, earned_on)
  where is_core;

create index student_items_enrollment_earned_idx
  on public.student_items(enrollment_id, earned_at desc);

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
  unique (island_id, student_item_id)
);

create index island_placements_island_idx
  on public.island_placements(island_id);

comment on table public.asset_catalog is
  'dedup_key와 style_version이 같은 3D 에셋은 재사용하여 생성 비용을 제한한다.';

comment on table public.student_items is
  '학생의 아이템 획득 이력. 하루 두 슬롯 중 하나이며 하루 핵심 아이템은 최대 하나다.';

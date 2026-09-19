-- 담당: 이지현 (제안) — 로컬 작성본. 공유 DB에는 아직 적용하지 않았다(별도 승인 후 적용).
-- 롤백 SQL: supabase/rollbacks/1094_demo_shared_island_rollback.sql (문서: docs/데모_방문자_격리_적용_절차.md §13)
--
-- 목적: 3D 섬의 아이템·배치를 "공용 데모(모든 방문자에게 동일, 수정 불가)"와 "방문자 개인(auth.uid() 귀속)"으로 나눈다.
-- 부모(checkin_sessions·conversation_messages·item_generation_jobs)는 열지 않는다 — 공개 판단을 부모 세션 소유자에서
-- 파생하지 않고 행 자신의 컬럼(is_public_demo / demo_owner_id)으로 한다.
--
-- ⚠️ 1093까지와 달리 단순 추가형이 아니다: 아래 5가지를 "교체"한다(롤백 파일이 1093 상태를 그대로 복원한다).
--   student_items_daily_slot / student_items_daily_core (유니크 인덱스), islands_enrollment_id_key (유니크 제약),
--   student_items_demo_owner_restrict / islands_no_anonymous / island_placements_no_anonymous / asset_catalog_read (정책)
-- 기존 student_items 42건(개발 계정 소유 테스트 잔재)은 손대지 않는다 — student_items_immutable 트리거가 UPDATE를 막기도 하고,
-- 보이지 않게 유지하는 것이 목적이다. 이 행들은 "레거시"(demo_owner_id IS NULL AND NOT is_public_demo)로 분류된다.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ============================================================================
-- 1. 컬럼
-- ============================================================================
alter table public.student_items
  add column demo_owner_id uuid references auth.users(id),
  add column is_public_demo boolean not null default false;

alter table public.islands
  add column demo_owner_id uuid references auth.users(id),
  add column is_public_demo boolean not null default false;

-- 서버가 배치할 때 계산한 아이템 점유 반경(씬의 giftRadius와 같은 값). 동시 배치 경합을 RPC 안에서 다시 검사하는 데 쓴다.
alter table public.island_placements
  add column footprint_radius real not null default 0.15
  constraint island_placements_footprint_radius_check check (footprint_radius > 0 and footprint_radius <= 5);

-- 세 부류는 서로 배타적이다: 공용(is_public_demo) / 방문자(demo_owner_id NOT NULL) / 레거시(둘 다 아님).
alter table public.student_items
  add constraint student_items_visibility_kind_check
  check (not is_public_demo or (demo_owner_id is null and source_session_id is null and source_message_id is null));

alter table public.islands
  add constraint islands_visibility_kind_check
  check (not is_public_demo or demo_owner_id is null);

comment on column public.student_items.demo_owner_id is
  '방문자 개인 아이템의 소유자(auth.uid()). issueStudentItem이 부모 세션의 소유자를 그대로 기록하고 트리거가 일치를 검증한다.';
comment on column public.student_items.is_public_demo is
  '모든 방문자에게 동일하게 보이는 공용 데모 아이템. 부모 세션·메시지 링크가 없다(CHECK). 시드 관리 세션에서만 만들 수 있다.';
comment on column public.islands.demo_owner_id is '방문자 개인 섬의 소유자(auth.uid()).';
comment on column public.islands.is_public_demo is '모든 방문자에게 동일하게 보이는 공용 데모 섬(enrollment당 1개). 수정·삭제는 시드 관리 세션에서만.';

-- ============================================================================
-- 2. 유니크 인덱스 교체 — coalesce(zero-uuid) 하나로 만들지 않는다(공용·레거시가 모두 owner NULL이라 충돌).
--    공용 / 방문자 / 레거시 부분 유니크 3개로 분리.
-- ============================================================================
drop index public.student_items_daily_slot;
drop index public.student_items_daily_core;

create unique index student_items_daily_slot_public
  on public.student_items (enrollment_id, earned_on, slot)
  where is_public_demo;
create unique index student_items_daily_slot_owner
  on public.student_items (enrollment_id, demo_owner_id, earned_on, slot)
  where demo_owner_id is not null;
create unique index student_items_daily_slot_legacy
  on public.student_items (enrollment_id, earned_on, slot)
  where demo_owner_id is null and not is_public_demo;

create unique index student_items_daily_core_public
  on public.student_items (enrollment_id, earned_on)
  where is_core and is_public_demo;
create unique index student_items_daily_core_owner
  on public.student_items (enrollment_id, demo_owner_id, earned_on)
  where is_core and demo_owner_id is not null;
create unique index student_items_daily_core_legacy
  on public.student_items (enrollment_id, earned_on)
  where is_core and demo_owner_id is null and not is_public_demo;

alter table public.islands drop constraint islands_enrollment_id_key;

create unique index islands_enrollment_public
  on public.islands (enrollment_id)
  where is_public_demo;
create unique index islands_enrollment_owner
  on public.islands (enrollment_id, demo_owner_id)
  where demo_owner_id is not null;
create unique index islands_enrollment_legacy
  on public.islands (enrollment_id)
  where demo_owner_id is null and not is_public_demo;

-- 조회용: asset 정책의 EXISTS와 "내 아이템 누적" 조회.
create index student_items_asset_id_idx on public.student_items (asset_id);
create index student_items_owner_earned_idx on public.student_items (demo_owner_id, earned_at desc)
  where demo_owner_id is not null;

-- ============================================================================
-- 3. 트리거 — DB가 소유자 일치·공용 행 보호를 직접 강제한다(앱 코드가 실수해도 막힌다).
-- ============================================================================

-- 시드 관리 세션 표식. 공용 행의 생성·수정·삭제는 시드 유지보수 SQL이 같은 트랜잭션에서
-- select set_config('salpim.seed_admin', 'on', true); 를 한 뒤에만 통과한다. PostgREST(앱·방문자)는 이 값을 켤 수 없다.
create or replace function public.demo_seed_admin_enabled()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(current_setting('salpim.seed_admin', true), '') = 'on' $$;

-- student_items INSERT: 방문자 아이템의 demo_owner_id는 부모 체크인 세션(및 그 세션의 생성 job)의 소유자와 같아야 한다.
create or replace function public.student_items_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session record;
  v_job record;
begin
  if new.is_public_demo then
    if not public.demo_seed_admin_enabled() then
      raise exception 'PUBLIC_DEMO_SEED_ADMIN_REQUIRED: 공용 아이템은 시드 관리 세션에서만 만들 수 있습니다' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.source_session_id is null then
    raise exception 'ITEM_PARENT_REQUIRED: 공용이 아닌 아이템은 부모 체크인 세션이 있어야 합니다' using errcode = '23514';
  end if;

  select cs.demo_owner_id, cs.enrollment_id into v_session
  from public.checkin_sessions cs where cs.id = new.source_session_id;
  if not found then
    raise exception 'ITEM_PARENT_NOT_FOUND: 부모 체크인 세션이 없습니다' using errcode = '23503';
  end if;
  if v_session.enrollment_id is distinct from new.enrollment_id then
    raise exception 'ITEM_PARENT_ENROLLMENT_MISMATCH: 부모 세션의 수강 정보와 다릅니다' using errcode = '23514';
  end if;
  if new.demo_owner_id is distinct from v_session.demo_owner_id then
    raise exception 'ITEM_OWNER_MISMATCH: 아이템 소유자가 부모 체크인 세션의 소유자와 다릅니다' using errcode = '23514';
  end if;

  -- 그 세션으로 접수된 생성 job이 있으면 job의 세션 소유자·수강 정보도 같아야 한다.
  select j.enrollment_id, cs2.demo_owner_id as owner_id into v_job
  from public.item_generation_jobs j
  join public.checkin_sessions cs2 on cs2.id = j.source_session_id
  where j.source_session_id = new.source_session_id;
  if found then
    if v_job.enrollment_id is distinct from new.enrollment_id
       or v_job.owner_id is distinct from new.demo_owner_id then
      raise exception 'ITEM_JOB_OWNER_MISMATCH: 생성 job의 소유자와 아이템 소유자가 다릅니다' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger student_items_owner_guard
before insert on public.student_items
for each row execute function public.student_items_owner_guard();

-- islands: 공용 섬은 시드 관리 세션에서만 만들고 고칠 수 있다. 소유 구분·수강 정보는 만든 뒤 바꿀 수 없다.
create or replace function public.islands_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_public_demo and not public.demo_seed_admin_enabled() then
      raise exception 'PUBLIC_DEMO_SEED_ADMIN_REQUIRED: 공용 섬은 시드 관리 세션에서만 만들 수 있습니다' using errcode = '42501';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if not public.demo_seed_admin_enabled() then
      if new.is_public_demo is distinct from old.is_public_demo
         or new.demo_owner_id is distinct from old.demo_owner_id
         or new.enrollment_id is distinct from old.enrollment_id then
        raise exception 'ISLAND_OWNER_IMMUTABLE: 섬의 소유 구분은 바꿀 수 없습니다' using errcode = '42501';
      end if;
      if old.is_public_demo then
        raise exception 'PUBLIC_ISLAND_READONLY: 공용 섬은 수정할 수 없습니다' using errcode = '42501';
      end if;
    end if;
    return new;
  else
    if old.is_public_demo and not public.demo_seed_admin_enabled() then
      raise exception 'PUBLIC_ISLAND_READONLY: 공용 섬은 삭제할 수 없습니다' using errcode = '42501';
    end if;
    return old;
  end if;
end;
$$;

create trigger islands_guard
before insert or update or delete on public.islands
for each row execute function public.islands_guard();

-- island_placements: 아이템과 섬의 소유자가 같아야 하고, 공용 섬의 배치는 시드 관리 세션에서만 바꿀 수 있다.
create or replace function public.island_placements_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_island record;
  v_item record;
  v_public boolean;
begin
  if tg_op = 'DELETE' then
    select i.is_public_demo into v_public from public.islands i where i.id = old.island_id;
    if coalesce(v_public, false) and not public.demo_seed_admin_enabled() then
      raise exception 'PUBLIC_ISLAND_READONLY: 공용 섬의 배치는 삭제할 수 없습니다' using errcode = '42501';
    end if;
    return old;
  end if;

  select i.is_public_demo, i.demo_owner_id, i.enrollment_id into v_island
  from public.islands i where i.id = new.island_id;
  if not found then
    raise exception 'PLACEMENT_ISLAND_NOT_FOUND' using errcode = '23503';
  end if;
  select si.is_public_demo, si.demo_owner_id, si.enrollment_id into v_item
  from public.student_items si where si.id = new.student_item_id;
  if not found then
    raise exception 'PLACEMENT_ITEM_NOT_FOUND' using errcode = '23503';
  end if;

  if v_island.enrollment_id is distinct from v_item.enrollment_id then
    raise exception 'PLACEMENT_ENROLLMENT_MISMATCH: 섬과 아이템의 수강 정보가 다릅니다' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and (new.island_id is distinct from old.island_id or new.student_item_id is distinct from old.student_item_id)
     and not public.demo_seed_admin_enabled() then
    raise exception 'PLACEMENT_KEY_IMMUTABLE: 배치의 섬·아이템은 바꿀 수 없습니다' using errcode = '42501';
  end if;

  if v_island.is_public_demo then
    if not public.demo_seed_admin_enabled() then
      raise exception 'PUBLIC_ISLAND_READONLY: 공용 섬에는 시드 관리 세션에서만 배치할 수 있습니다' using errcode = '42501';
    end if;
    if not v_item.is_public_demo then
      raise exception 'PLACEMENT_OWNER_MISMATCH: 공용 섬에는 공용 아이템만 놓을 수 있습니다' using errcode = '23514';
    end if;
  else
    if v_item.is_public_demo then
      raise exception 'PLACEMENT_OWNER_MISMATCH: 공용 아이템은 개인 섬에 놓을 수 없습니다' using errcode = '23514';
    end if;
    if v_island.demo_owner_id is distinct from v_item.demo_owner_id then
      raise exception 'PLACEMENT_OWNER_MISMATCH: 섬과 아이템의 소유자가 다릅니다' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger island_placements_guard
before insert or update or delete on public.island_placements
for each row execute function public.island_placements_guard();

revoke all on function public.demo_seed_admin_enabled() from public, anon, authenticated;
revoke all on function public.student_items_owner_guard() from public, anon, authenticated;
revoke all on function public.islands_guard() from public, anon, authenticated;
revoke all on function public.island_placements_guard() from public, anon, authenticated;

-- ============================================================================
-- 4. RLS — 방문자는 "공용 + 내 것"만. 정식 로그인 사용자는 기존 범위(레거시 포함)를 그대로 유지한다.
--    (앱 서버 경로는 service_role이라 RLS를 우회한다 — 이 정책은 PostgREST 직접 호출 방어선이다. docs §-1)
-- ============================================================================
drop policy student_items_demo_owner_restrict on public.student_items;
create policy student_items_demo_owner_restrict on public.student_items
as restrictive
for select to authenticated
using (
  is_public_demo
  or (demo_owner_id is not null and demo_owner_id = (select auth.uid()))
  or (
    -- 레거시(1093과 동일한 규칙): 부모 세션이 있고 그 세션 소유자가 null 또는 본인
    demo_owner_id is null
    and source_session_id is not null
    and exists (
      select 1 from public.checkin_sessions cs
      where cs.id = student_items.source_session_id
        and (cs.demo_owner_id is null or cs.demo_owner_id = (select auth.uid()))
    )
  )
);

drop policy islands_no_anonymous on public.islands;
create policy islands_demo_scope on public.islands
as restrictive
for select to authenticated
using (
  is_public_demo
  or (demo_owner_id is not null and demo_owner_id = (select auth.uid()))
  or (demo_owner_id is null and (((select auth.jwt()) ->> 'is_anonymous')::boolean is not true))
);

drop policy island_placements_no_anonymous on public.island_placements;
create policy island_placements_demo_scope on public.island_placements
as restrictive
for select to authenticated
using (
  exists (
    select 1 from public.islands i
    where i.id = island_placements.island_id
      and (
        i.is_public_demo
        or (i.demo_owner_id is not null and i.demo_owner_id = (select auth.uid()))
        or (i.demo_owner_id is null and (((select auth.jwt()) ->> 'is_anonymous')::boolean is not true))
      )
  )
);

-- asset_catalog: 방문자 발화로 만들어진 아이템의 name·geometry_spec이 다른 방문자의 직접 조회에 노출되지 않게 한다.
-- 익명 방문자는 "공용 student_items 또는 본인 demo_owner_id 아이템(또는 본인 배치의 교체 자산)"이 참조하는 자산만 읽는다.
-- 정식 로그인(교사 등)은 기존처럼 전체 조회. dedup_key 때문에 같은 이름 아이템은 한 자산을 공유하므로, 자산을 참조하는
-- 모든 소유자에게 보이는 것은 구조적 한계다(내용이 같고 소유자 귀속이 불가능하다).
drop policy asset_catalog_read on public.asset_catalog;
create policy asset_catalog_read on public.asset_catalog
for select to authenticated
using (
  (((select auth.jwt()) ->> 'is_anonymous')::boolean is not true)
  or exists (
    select 1 from public.student_items si
    where si.asset_id = asset_catalog.id
      and (si.is_public_demo or si.demo_owner_id = (select auth.uid()))
  )
  or exists (
    select 1 from public.island_placements p
    join public.islands i on i.id = p.island_id
    where p.current_asset_id = asset_catalog.id
      and (i.is_public_demo or i.demo_owner_id = (select auth.uid()))
  )
);

-- ============================================================================
-- 5. RPC — 개인 섬 생성 + 배치 저장을 한 트랜잭션으로. 서버(service_role) 전용.
--    호출자가 넘긴 p_owner_id를 그대로 믿지 않는다: 아이템·부모 세션·생성 job의 실제 소유자와 모두 대조한다.
--    (auth.uid()는 쓰지 않는다: 앱 서버는 service_role로 호출하므로 JWT가 없어 NULL이다. 대신 EXECUTE를 service_role에만 준다.)
-- ============================================================================
create or replace function public.place_demo_item(
  p_owner_id uuid,
  p_item_id uuid,
  p_x double precision,
  p_z double precision,
  p_radius double precision
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_session record;
  v_job_asset uuid;
  v_job_owner uuid;
  v_job_found boolean;
  v_asset uuid;
  v_island_id uuid;
  v_placement_id uuid;
  v_overlap uuid;
begin
  if p_owner_id is null then
    raise exception 'OWNER_REQUIRED' using errcode = '22004';
  end if;
  if p_x is null or p_z is null or p_radius is null
     or p_x::text in ('NaN', 'Infinity', '-Infinity') or p_z::text in ('NaN', 'Infinity', '-Infinity')
     or p_radius::text in ('NaN', 'Infinity', '-Infinity')
     or abs(p_x) > 1000 or abs(p_z) > 1000 or p_radius <= 0 or p_radius > 5 then
    raise exception 'INVALID_PLACEMENT_ARGUMENT' using errcode = '22023';
  end if;

  select si.id, si.enrollment_id, si.asset_id, si.demo_owner_id, si.is_public_demo, si.source_session_id into v_item
  from public.student_items si where si.id = p_item_id;
  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_item.is_public_demo then
    raise exception 'PUBLIC_ITEM_IMMUTABLE' using errcode = '42501';
  end if;
  if v_item.demo_owner_id is distinct from p_owner_id then
    raise exception 'ITEM_NOT_OWNED' using errcode = '42501';
  end if;

  -- 아이템의 부모 세션 소유자를 다시 확인(아이템 행만 믿지 않는다)
  select cs.demo_owner_id, cs.enrollment_id into v_session
  from public.checkin_sessions cs where cs.id = v_item.source_session_id;
  if not found then
    raise exception 'ITEM_PARENT_OWNER_MISMATCH' using errcode = '42501';
  end if;
  if v_session.demo_owner_id is distinct from p_owner_id
     or v_session.enrollment_id is distinct from v_item.enrollment_id then
    raise exception 'ITEM_PARENT_OWNER_MISMATCH' using errcode = '42501';
  end if;

  -- 이 아이템을 만든 생성 job(있다면)의 세션 소유자 확인 + 실제로 화면에 쓸 자산(재시도로 교체된 자산 우선)
  select j.generated_asset_id, cs2.demo_owner_id, true into v_job_asset, v_job_owner, v_job_found
  from public.item_generation_jobs j
  join public.checkin_sessions cs2 on cs2.id = j.source_session_id
  where j.student_item_id = p_item_id
  limit 1;
  if coalesce(v_job_found, false) and v_job_owner is distinct from p_owner_id then
    raise exception 'ITEM_JOB_OWNER_MISMATCH' using errcode = '42501';
  end if;
  v_asset := coalesce(v_job_asset, v_item.asset_id);

  -- 개인 섬: 없으면 만들고, 있으면 그 행을 잠가 같은 방문자의 동시 배치를 직렬화한다.
  insert into public.islands (enrollment_id, name, theme, demo_owner_id)
  values (v_item.enrollment_id, '나의 섬', 'meadow', p_owner_id)
  on conflict (enrollment_id, demo_owner_id) where demo_owner_id is not null do nothing;
  select i.id into v_island_id
  from public.islands i
  where i.enrollment_id = v_item.enrollment_id and i.demo_owner_id = p_owner_id and not i.is_public_demo
  for update;
  if v_island_id is null then
    raise exception 'ISLAND_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  -- 잠금 안에서 겹침 재검증: 공용 섬 + 내 섬의 다른 배치와 점유 반경이 겹치면 거부(씬의 규칙과 같은 식).
  select p.id into v_overlap
  from public.island_placements p
  join public.islands i on i.id = p.island_id
  where i.enrollment_id = v_item.enrollment_id
    and (i.id = v_island_id or i.is_public_demo)
    and p.student_item_id <> p_item_id
    and sqrt(power(p.position_x - p_x, 2) + power(p.position_z - p_z, 2)) < (p.footprint_radius + p_radius)
  limit 1;
  if found then
    raise exception 'PLACEMENT_OVERLAP' using errcode = '23P01';
  end if;

  -- 같은 아이템의 중복 배치는 unique(student_item_id)로 막고, 다시 놓으면 이동으로 처리한다(멱등).
  insert into public.island_placements (island_id, student_item_id, position_x, position_y, position_z, current_asset_id, footprint_radius)
  values (v_island_id, p_item_id, p_x, 0, p_z, v_asset, p_radius)
  on conflict (student_item_id) do update
    set position_x = excluded.position_x,
        position_z = excluded.position_z,
        current_asset_id = excluded.current_asset_id,
        footprint_radius = excluded.footprint_radius
    where public.island_placements.island_id = v_island_id
  returning id into v_placement_id;
  if v_placement_id is null then
    raise exception 'PLACEMENT_ISLAND_MISMATCH' using errcode = '42501';
  end if;
  return v_placement_id;
end;
$$;

create or replace function public.remove_demo_placement(p_owner_id uuid, p_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_deleted integer;
begin
  if p_owner_id is null then
    raise exception 'OWNER_REQUIRED' using errcode = '22004';
  end if;
  select si.demo_owner_id, si.is_public_demo into v_item from public.student_items si where si.id = p_item_id;
  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_item.is_public_demo then
    raise exception 'PUBLIC_ITEM_IMMUTABLE' using errcode = '42501';
  end if;
  if v_item.demo_owner_id is distinct from p_owner_id then
    raise exception 'ITEM_NOT_OWNED' using errcode = '42501';
  end if;
  delete from public.island_placements p
  using public.islands i
  where p.island_id = i.id
    and p.student_item_id = p_item_id
    and i.demo_owner_id = p_owner_id
    and not i.is_public_demo;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

-- Supabase 기본값으로 새 함수에 anon/authenticated EXECUTE가 붙으므로 명시적으로 회수하고 service_role에만 허용한다.
revoke all on function public.place_demo_item(uuid, uuid, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function public.remove_demo_placement(uuid, uuid) from public, anon, authenticated;
grant execute on function public.place_demo_item(uuid, uuid, double precision, double precision, double precision) to service_role;
grant execute on function public.remove_demo_placement(uuid, uuid) to service_role;

-- ============================================================================
-- 6. 적용 직후 자기 검증 — 하나라도 어긋나면 예외로 이 마이그레이션 전체가 롤백된다.
-- ============================================================================
do $$
declare
  v_place text := 'public.place_demo_item(uuid,uuid,double precision,double precision,double precision)';
  v_remove text := 'public.remove_demo_placement(uuid,uuid)';
begin
  if has_function_privilege('anon', v_place, 'execute') or has_function_privilege('authenticated', v_place, 'execute')
     or has_function_privilege('anon', v_remove, 'execute') or has_function_privilege('authenticated', v_remove, 'execute') then
    raise exception '1094 검증 실패: RPC EXECUTE가 anon/authenticated에 열려 있다';
  end if;
  if not has_function_privilege('service_role', v_place, 'execute') or not has_function_privilege('service_role', v_remove, 'execute') then
    raise exception '1094 검증 실패: RPC EXECUTE가 service_role에 없다';
  end if;
  if (select count(*) from pg_indexes where schemaname = 'public' and indexname in (
        'student_items_daily_slot_public', 'student_items_daily_slot_owner', 'student_items_daily_slot_legacy',
        'student_items_daily_core_public', 'student_items_daily_core_owner', 'student_items_daily_core_legacy',
        'islands_enrollment_public', 'islands_enrollment_owner', 'islands_enrollment_legacy')) <> 9 then
    raise exception '1094 검증 실패: 부분 유니크 인덱스 9개가 모두 있어야 한다';
  end if;
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname in ('student_items_daily_slot', 'student_items_daily_core', 'islands_enrollment_id_key')) then
    raise exception '1094 검증 실패: 교체 전 인덱스가 남아 있다';
  end if;
  if exists (select 1 from public.student_items where is_public_demo or demo_owner_id is not null)
     or exists (select 1 from public.islands where is_public_demo or demo_owner_id is not null) then
    raise exception '1094 검증 실패: 마이그레이션이 기존 행을 공용/방문자로 바꿔서는 안 된다(모두 레거시여야 한다)';
  end if;
end;
$$;

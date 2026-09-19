-- 1094(demo_shared_island) 롤백 — 1093 적용 직후 상태를 그대로 복원한다. 자동 실행 대상이 아니다(migrations 밖).
-- 문서: docs/데모_방문자_격리_적용_절차.md §13
--
-- 복원 대상(정의는 2026-09-20 공유 DB의 pg_indexes / pg_constraint / pg_policies 조회값과 1093 파일 본문에서 그대로 옮겼다):
--   student_items_daily_slot   CREATE UNIQUE INDEX ... USING btree (enrollment_id, earned_on, slot)
--   student_items_daily_core   CREATE UNIQUE INDEX ... USING btree (enrollment_id, earned_on) WHERE is_core
--   islands_enrollment_id_key  UNIQUE (enrollment_id)                       (제약)
--   student_items_demo_owner_restrict / islands_no_anonymous / island_placements_no_anonymous  (1093 정책)
--   asset_catalog_read         FOR SELECT TO authenticated USING (true)     (9010 정책)
--
-- ⚠️ 방문자 데이터가 생긴 뒤(demo_owner_id가 채워진 행, 공용 시드, 개인 섬·배치가 1건이라도 있음)에는 아래 "전체 롤백"을
--    실행하지 않는다 — 첫 블록이 예외로 막는다. 컬럼·행 삭제 금지(§8-2). 그때는 맨 아래 "부분 롤백(정책 잠금)"만 쓴다.
--
-- 실행 방법(공유 DB 승인 후에만): 한 트랜잭션으로 실행하고, 끝의 검증 쿼리 결과가 모두 true인지 확인한다.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 0. 전체 롤백 가능 여부 확인 — 데이터가 있으면 여기서 멈춘다.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.student_items where demo_owner_id is not null or is_public_demo)
     or exists (select 1 from public.islands)
     or exists (select 1 from public.island_placements) then
    raise exception '전체 롤백 불가: 1094 이후 만들어진 방문자/공용 데이터(student_items·islands·island_placements)가 있다. 컬럼·행을 지우지 말고 맨 아래 부분 롤백(정책 잠금)을 쓴다(§8-2).';
  end if;
  -- 원래 유니크 인덱스를 다시 만들 수 있는지(중복 슬롯이 없는지)
  if exists (select 1 from public.student_items group by enrollment_id, earned_on, slot having count(*) > 1)
     or exists (select 1 from public.student_items where is_core group by enrollment_id, earned_on having count(*) > 1) then
    raise exception '전체 롤백 불가: 원래 student_items 유니크 인덱스를 다시 만들 수 없다(중복 슬롯/코어).';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. RPC·트리거·보조 함수 제거 (의존 순서: 트리거 → 함수)
-- ---------------------------------------------------------------------------
drop function if exists public.place_demo_item(uuid, uuid, double precision, double precision, double precision);
drop function if exists public.remove_demo_placement(uuid, uuid);

drop trigger if exists island_placements_guard on public.island_placements;
drop trigger if exists islands_guard on public.islands;
drop trigger if exists student_items_owner_guard on public.student_items;
drop function if exists public.island_placements_guard();
drop function if exists public.islands_guard();
drop function if exists public.student_items_owner_guard();
drop function if exists public.demo_seed_admin_enabled();

-- ---------------------------------------------------------------------------
-- 2. 정책 복원 — 1094가 만든 정책을 지우고 1093/9010 정책을 되돌린다.
-- ---------------------------------------------------------------------------
drop policy if exists student_items_demo_owner_restrict on public.student_items;
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

drop policy if exists islands_demo_scope on public.islands;
create policy islands_no_anonymous on public.islands
as restrictive for select to authenticated
using (((select auth.jwt()) ->> 'is_anonymous')::boolean is not true);

drop policy if exists island_placements_demo_scope on public.island_placements;
create policy island_placements_no_anonymous on public.island_placements
as restrictive for select to authenticated
using (((select auth.jwt()) ->> 'is_anonymous')::boolean is not true);

drop policy if exists asset_catalog_read on public.asset_catalog;
create policy asset_catalog_read on public.asset_catalog
for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 3. 인덱스·제약 복원
-- ---------------------------------------------------------------------------
drop index if exists public.student_items_daily_slot_public;
drop index if exists public.student_items_daily_slot_owner;
drop index if exists public.student_items_daily_slot_legacy;
drop index if exists public.student_items_daily_core_public;
drop index if exists public.student_items_daily_core_owner;
drop index if exists public.student_items_daily_core_legacy;
drop index if exists public.islands_enrollment_public;
drop index if exists public.islands_enrollment_owner;
drop index if exists public.islands_enrollment_legacy;
drop index if exists public.student_items_asset_id_idx;
drop index if exists public.student_items_owner_earned_idx;

create unique index student_items_daily_slot on public.student_items using btree (enrollment_id, earned_on, slot);
create unique index student_items_daily_core on public.student_items using btree (enrollment_id, earned_on) where is_core;
alter table public.islands add constraint islands_enrollment_id_key unique (enrollment_id);

-- ---------------------------------------------------------------------------
-- 4. 컬럼·CHECK 제거 (위 0번 확인으로 방문자/공용 데이터가 없음이 보장된 경우에만 여기까지 온다)
-- ---------------------------------------------------------------------------
alter table public.student_items drop constraint if exists student_items_visibility_kind_check;
alter table public.islands drop constraint if exists islands_visibility_kind_check;
alter table public.island_placements drop constraint if exists island_placements_footprint_radius_check;
alter table public.island_placements drop column if exists footprint_radius;
alter table public.student_items drop column if exists is_public_demo, drop column if exists demo_owner_id;
alter table public.islands drop column if exists is_public_demo, drop column if exists demo_owner_id;

-- ---------------------------------------------------------------------------
-- 5. 복원 검증 — 모두 true여야 한다. 하나라도 false면 rollback; 하고 원인을 확인한다.
-- ---------------------------------------------------------------------------
select
  (select indexdef from pg_indexes where schemaname='public' and indexname='student_items_daily_slot')
    = 'CREATE UNIQUE INDEX student_items_daily_slot ON public.student_items USING btree (enrollment_id, earned_on, slot)' as slot_index_restored,
  (select indexdef from pg_indexes where schemaname='public' and indexname='student_items_daily_core')
    = 'CREATE UNIQUE INDEX student_items_daily_core ON public.student_items USING btree (enrollment_id, earned_on) WHERE is_core' as core_index_restored,
  exists (select 1 from pg_constraint where conname='islands_enrollment_id_key' and contype='u' and conrelid='public.islands'::regclass) as islands_unique_restored,
  (select count(*) from pg_policies where schemaname='public' and policyname in
     ('student_items_demo_owner_restrict','islands_no_anonymous','island_placements_no_anonymous','asset_catalog_read')) = 4 as policies_restored,
  not exists (select 1 from pg_policies where schemaname='public' and policyname in ('islands_demo_scope','island_placements_demo_scope')) as new_policies_gone,
  not exists (select 1 from information_schema.columns where table_schema='public' and column_name in ('demo_owner_id','is_public_demo') and table_name in ('student_items','islands')) as columns_gone;

commit;

-- ===========================================================================
-- 부분 롤백(정책 잠금) — 방문자/공용 데이터가 이미 있을 때. 컬럼·인덱스·행은 그대로 두고 방문자 직접 접근만 닫는다(§8-2).
-- 위 begin ~ commit 전체 대신 이 블록만 실행한다.
-- ===========================================================================
-- begin;
-- drop policy if exists student_items_demo_owner_restrict on public.student_items;
-- create policy student_items_demo_owner_restrict on public.student_items as restrictive for select to authenticated
--   using (source_session_id is not null and exists (select 1 from public.checkin_sessions cs
--          where cs.id = student_items.source_session_id and (cs.demo_owner_id is null or cs.demo_owner_id = (select auth.uid()))));
--   -- ↑ 방문자 소유 아이템은 부모 세션 소유자가 본인이므로 계속 본인에게만 보인다. 공용(부모 없음) 아이템은 이 정책으로는 아무에게도 안 보인다.
-- drop policy if exists islands_demo_scope on public.islands;
-- create policy islands_no_anonymous on public.islands as restrictive for select to authenticated
--   using (((select auth.jwt()) ->> 'is_anonymous')::boolean is not true);
-- drop policy if exists island_placements_demo_scope on public.island_placements;
-- create policy island_placements_no_anonymous on public.island_placements as restrictive for select to authenticated
--   using (((select auth.jwt()) ->> 'is_anonymous')::boolean is not true);
-- -- asset_catalog_read는 그대로 둔다(익명 방문자 직접 조회 제한 유지). 되돌려야 하면: drop policy asset_catalog_read on public.asset_catalog;
-- --   create policy asset_catalog_read on public.asset_catalog for select to authenticated using (true);
-- commit;

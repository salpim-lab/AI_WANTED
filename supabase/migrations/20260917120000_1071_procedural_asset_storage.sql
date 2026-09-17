-- 절차적 Three.js 에셋과 fallback 교체를 위한 저장 구조
-- 기존 GLB 에셋·불변 student_items·기존 배치를 깨지 않도록 nullable/기본값으로 확장한다.

alter table public.asset_catalog
  add column asset_format text not null default 'glb'
    check (asset_format in ('glb', 'procedural')),
  add column geometry_spec jsonb;

alter table public.asset_catalog
  add constraint asset_catalog_procedural_spec_check
  check (
    (asset_format = 'procedural' and geometry_spec is not null)
    or (asset_format = 'glb')
  );

alter table public.island_placements
  add column current_asset_id uuid references public.asset_catalog(id);

create index island_placements_current_asset_idx
  on public.island_placements(current_asset_id)
  where current_asset_id is not null;

comment on column public.asset_catalog.asset_format is
  'glb는 model_url, procedural은 geometry_spec을 Three.js 제작기로 렌더링한다.';
comment on column public.asset_catalog.geometry_spec is
  'asset_format=procedural일 때의 검증된 AssembledItemSpec JSON. 서버 검증 후 저장한다.';
comment on column public.island_placements.current_asset_id is
  '현재 배치에 표시할 에셋. NULL이면 기존 student_items.asset_id를 사용한다. fallback에서 생성품으로 교체할 때 위치·student_item_id는 유지한다.';

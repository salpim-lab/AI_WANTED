-- fallback과 최종 생성품이 상담별 같은 asset_catalog 행을 사용할 수 있도록 허용
do $$ declare c record; begin
  for c in select conname from pg_constraint
    where conrelid = 'public.item_generation_jobs'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%generated_asset_id <> fallback_asset_id%' loop
    execute format('alter table public.item_generation_jobs drop constraint %I', c.conname);
  end loop;
end $$;

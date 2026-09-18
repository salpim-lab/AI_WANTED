-- 살핌 DB 스키마 v0.3: 1031_work_records_student_consultation (담당: 김현우)
-- 학생관찰일지 "상담" 탭(아이 본인과의 상담)을 work_records에 저장할 수 있게 record_type 허용 값에
-- 'student_consultation'을 추가한다. 학부모 상담은 기존 'consultation' 그대로다.
-- 기존 값은 하나도 빼지 않으므로 이미 저장된 행에는 영향이 없다.

do $$
declare
  constraint_name text;
begin
  -- 1030에서 이름 없이 만든 check라 자동 이름(work_records_record_type_check)을 가정하지 않고 찾아서 지운다.
  select con.conname into constraint_name
  from pg_constraint con
  where con.conrelid = 'public.work_records'::regclass
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%record_type%';

  if constraint_name is not null then
    execute format('alter table public.work_records drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.work_records
  add constraint work_records_record_type_check
  check (record_type in ('general', 'conflict', 'consultation', 'conference', 'student_consultation'));

-- 살핌 DB 스키마 v0.3: 1032_parent_consultations_schedule (담당: 김현우)
-- 학부모상담기록의 "예정된 상담"에 필요한 칸과 무결성 규칙.
--   - 예정된 상담(status='preparing')은 일정·상담 대상·방식을 바꿀 수 있다.
--   - 완료한 상담(status='completed')은 내용이 work_records에 봉인되므로, 이 메타 행도 더 이상 바꾸거나 지울 수 없다.

alter table public.parent_consultations
  add column counterpart text check (counterpart is null or btrim(counterpart) <> ''),
  add column method text check (method is null or method in ('phone', 'visit', 'online'));

comment on column public.parent_consultations.counterpart is '상담 대상 (예: 어머니, 아버지, 보호자)';
comment on column public.parent_consultations.method is '상담 방식: phone(전화) / visit(방문) / online(온라인)';

-- 완료한 상담은 반드시 봉인된 원문(work_records)과 연결돼 있어야 한다.
alter table public.parent_consultations
  add constraint parent_consultations_completed_has_record
  check (status <> 'completed' or work_record_id is not null);

create or replace function public.parent_consultation_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'completed' then
    raise exception '완료한 상담 기록은 수정하거나 삭제할 수 없습니다';
  end if;
  return case when TG_OP = 'DELETE' then old else new end;
end;
$$;

create trigger parent_consultations_guard
before update or delete on public.parent_consultations
for each row execute function public.parent_consultation_guard();

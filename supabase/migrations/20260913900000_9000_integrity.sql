-- 살핌 DB 스키마 v0.3: 9000_integrity
-- 원본 불변, 봉인, 해시 체인, 변경 감사와 상세 열람 기록.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  before jsonb,
  after jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index audit_log_table_row_changed_idx
  on public.audit_log(table_name, row_id, changed_at desc);

create table public.view_log (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references public.profiles(id),
  entity_type text not null check (btrim(entity_type) <> ''),
  entity_id uuid not null,
  viewed_at timestamptz not null default now()
);

create index view_log_entity_viewed_idx
  on public.view_log(entity_type, entity_id, viewed_at desc);

create or replace function public.current_actor()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('app.actor_id', true), '')::uuid,
    auth.uid()
  );
$$;

create or replace function public.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% 기록은 수정하거나 삭제할 수 없습니다', TG_TABLE_NAME;
end;
$$;

create trigger conversation_messages_immutable
before update or delete on public.conversation_messages
for each row execute function public.reject_mutation();

create trigger student_items_immutable
before update or delete on public.student_items
for each row execute function public.reject_mutation();

create trigger consents_immutable
before update or delete on public.consents
for each row execute function public.reject_mutation();

create or replace function public.checkin_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.mood_color is distinct from old.mood_color then
    raise exception 'mood_color는 수정할 수 없습니다';
  end if;

  if old.status in ('completed', 'stopped')
     and new.status is distinct from old.status then
    raise exception '종료된 세션의 상태는 되돌릴 수 없습니다';
  end if;

  return new;
end;
$$;

create trigger checkin_sessions_guard
before update on public.checkin_sessions
for each row execute function public.checkin_guard();

create or replace function public.set_content_hash()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  previous_hash text;
  previous_sequence integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.session_id::text, 0));

  select cm.sequence, cm.content_hash
    into previous_sequence, previous_hash
  from public.conversation_messages cm
  where cm.session_id = new.session_id
  order by cm.sequence desc
  limit 1;

  if new.sequence <> coalesce(previous_sequence, 0) + 1 then
    raise exception '메시지 sequence는 앞 메시지 다음 번호여야 합니다';
  end if;

  new.prev_hash := previous_hash;
  new.content_hash := encode(
    sha256(convert_to(coalesce(previous_hash, '') || new.content, 'utf8')),
    'hex'
  );
  return new;
end;
$$;

create trigger conversation_messages_hash
before insert on public.conversation_messages
for each row execute function public.set_content_hash();

create or replace function public.work_record_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'sealed' then
    raise exception '봉인된 업무 기록은 수정하거나 삭제할 수 없습니다';
  end if;
  return case when TG_OP = 'DELETE' then old else new end;
end;
$$;

create trigger work_records_guard
before update or delete on public.work_records
for each row execute function public.work_record_guard();

create or replace function public.conflict_statement_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_status text;
begin
  select wr.status into parent_status
  from public.work_records wr
  where wr.id = coalesce(new.work_record_id, old.work_record_id);

  if parent_status = 'sealed' then
    raise exception '봉인된 업무 기록의 진술은 변경할 수 없습니다';
  end if;
  return case when TG_OP = 'DELETE' then old else new end;
end;
$$;

create trigger conflict_statements_guard
before insert or update or delete on public.conflict_statements
for each row execute function public.conflict_statement_guard();

create or replace function public.feedback_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'sent' then
    raise exception '발송된 피드백은 수정하거나 삭제할 수 없습니다';
  end if;
  if TG_OP = 'UPDATE' and new.draft_text is distinct from old.draft_text then
    raise exception 'AI 초안은 수정할 수 없습니다';
  end if;
  return case when TG_OP = 'DELETE' then old else new end;
end;
$$;

create trigger feedback_drafts_guard
before update or delete on public.feedback_drafts
for each row execute function public.feedback_guard();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger island_placements_updated_at
before update on public.island_placements
for each row execute function public.set_updated_at();

create trigger parent_consultations_updated_at
before update on public.parent_consultations
for each row execute function public.set_updated_at();

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  if TG_OP = 'DELETE' then
    target_id := old.id;
  else
    target_id := new.id;
  end if;

  insert into public.audit_log (
    table_name,
    row_id,
    before,
    after,
    changed_by
  ) values (
    TG_TABLE_NAME,
    target_id,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end,
    public.current_actor()
  );

  return case when TG_OP = 'DELETE' then old else new end;
end;
$$;

create trigger meeting_requests_audit
after insert or update or delete on public.meeting_requests
for each row execute function public.write_audit_log();

create trigger work_records_audit
after insert or update or delete on public.work_records
for each row execute function public.write_audit_log();

create trigger parent_consultations_audit
after insert or update or delete on public.parent_consultations
for each row execute function public.write_audit_log();

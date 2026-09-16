-- One session stores the complete ordered dialogue in one JSON value.
begin;

alter table public.checkin_sessions add column transcript jsonb;

create function public.valid_checkin_transcript(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare message jsonb;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) > 2000 or octet_length(value::text) > 500000 then return false; end if;
  for message in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(message) <> 'object'
      or jsonb_typeof(message->'speaker') is distinct from 'string'
      or (message->>'speaker') not in ('student', 'assistant', 'system')
      or jsonb_typeof(message->'content') is distinct from 'string'
      or btrim(message->>'content') = ''
      or jsonb_typeof(message->'input_method') is distinct from 'string'
      or (message->>'input_method') not in ('voice', 'text', 'fixed') then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

alter table public.checkin_sessions add constraint checkin_transcript_valid
  check (public.valid_checkin_transcript(transcript));

-- Preserve legacy records and their speaker/order information.
update public.checkin_sessions s set transcript = legacy.transcript
from (
  select session_id, jsonb_agg(jsonb_build_object(
    'speaker', speaker, 'content', content, 'input_method', input_method
  ) order by sequence) as transcript
  from public.conversation_messages group by session_id
) legacy where s.id = legacy.session_id;

create function public.guard_checkin_transcript()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    if old.transcript is not null then raise exception '저장된 상담 전문은 삭제할 수 없습니다'; end if;
    return old;
  end if;
  if TG_OP = 'UPDATE' and old.transcript is not null
     and new.transcript is distinct from old.transcript then
    raise exception '저장된 상담 전문은 수정할 수 없습니다';
  end if;
  if new.transcript is not null and new.status = 'started' then
    -- Legacy sessions may already have a snapshot; permit unrelated updates.
    if TG_OP = 'INSERT' then raise exception '전문은 상담 종료 시 저장합니다'; end if;
    if old.transcript is null then raise exception '전문은 상담 종료 시 저장합니다'; end if;
  end if;
  return new;
end;
$$;

create trigger checkin_transcript_guard before insert or update or delete
on public.checkin_sessions for each row execute function public.guard_checkin_transcript();

comment on column public.checkin_sessions.transcript is
  '상담 종료 시 한 번 저장하는 전체 대화 배열. 배열 순서가 대화 순서이며 각 항목은 speaker, content, input_method를 가진다. []는 발화 없는 종료, NULL은 미저장/이전 기록이다.';
comment on table public.conversation_messages is
  '이전 메시지 단위 원본과 FK 호환용. 새로운 상담 전문은 checkin_sessions.transcript에 한 번 저장한다.';

commit;

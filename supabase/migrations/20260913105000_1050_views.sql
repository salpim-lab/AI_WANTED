-- 살핌 DB 스키마 v0.3: 1050_views
-- 화면용 현재 재학 뷰, 위험 신호 뷰와 Agent 컨텍스트 RPC.

create view public.v_students_current
with (security_invoker = true) as
select
  s.id as student_id,
  e.id as enrollment_id,
  e.class_id,
  s.display_name,
  e.seat_row,
  e.seat_col,
  s.status
from public.students s
join public.enrollments e
  on e.student_id = s.id
 and e.ended_on is null;

create view public.v_signal_flags
with (security_invoker = true) as
select
  e.id as enrollment_id,
  e.class_id,
  a.analysis_type,
  a.category_tags,
  a.moderation_flag,
  a.needs_followup,
  a.result,
  a.created_at
from public.analysis_runs a
join public.checkin_sessions cs
  on a.source_type = 'session'
 and a.source_id = cs.id
join public.enrollments e on e.id = cs.enrollment_id
where a.status = 'completed'
  and (
    a.moderation_flag
    or a.needs_followup
    or a.analysis_type = 'relationship'
  );

create or replace function public.get_student_context(
  p_enrollment_id uuid,
  p_since timestamptz default (now() - interval '14 days')
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'student', (
      select row_to_json(v)
      from public.v_students_current v
      where v.enrollment_id = p_enrollment_id
    ),
    'recent_sessions', (
      select coalesce(jsonb_agg(s order by s.created_at desc), '[]'::jsonb)
      from public.checkin_sessions s
      where s.enrollment_id = p_enrollment_id
        and s.created_at >= p_since
    ),
    'recent_analysis', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'analysis_type', a.analysis_type,
        'category_tags', a.category_tags,
        'needs_followup', a.needs_followup,
        'result', a.result,
        'created_at', a.created_at
      ) order by a.created_at desc), '[]'::jsonb)
      from public.v_signal_flags a
      where a.enrollment_id = p_enrollment_id
        and a.created_at >= p_since
    ),
    'work_records', (
      select coalesce(jsonb_agg(w order by w.occurred_at desc), '[]'::jsonb)
      from public.work_records w
      join public.work_record_students wrs on wrs.work_record_id = w.id
      where wrs.enrollment_id = p_enrollment_id
        and w.created_at >= p_since
    ),
    'open_meeting_requests', (
      select coalesce(jsonb_agg(m order by m.requested_at desc), '[]'::jsonb)
      from public.meeting_requests m
      where m.enrollment_id = p_enrollment_id
        and m.status <> 'resolved'
    )
  );
$$;

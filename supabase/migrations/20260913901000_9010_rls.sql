-- 살핌 DB 스키마 v0.3: 9010_rls
-- 브라우저는 RLS로 제한된 읽기만 하고, 쓰기는 검증을 거친 서버가 담당한다.

create or replace function public.is_class_teacher(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.class_teachers ct
    where ct.class_id = p_class_id
      and ct.teacher_id = auth.uid()
  );
$$;

create or replace function public.is_enrollment_student(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.students s on s.id = e.student_id
    where e.id = p_enrollment_id
      and s.auth_user_id = auth.uid()
  );
$$;

create or replace function public.is_enrollment_teacher(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.class_teachers ct on ct.class_id = e.class_id
    where e.id = p_enrollment_id
      and ct.teacher_id = auth.uid()
  );
$$;

create or replace function public.is_enrollment_homeroom_teacher(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.class_teachers ct on ct.class_id = e.class_id
    where e.id = p_enrollment_id
      and ct.teacher_id = auth.uid()
      and ct.role = 'homeroom'
  );
$$;

revoke all on function public.is_class_teacher(uuid) from public;
revoke all on function public.is_enrollment_student(uuid) from public;
revoke all on function public.is_enrollment_teacher(uuid) from public;
revoke all on function public.is_enrollment_homeroom_teacher(uuid) from public;
grant execute on function public.is_class_teacher(uuid) to authenticated;
grant execute on function public.is_enrollment_student(uuid) to authenticated;
grant execute on function public.is_enrollment_teacher(uuid) to authenticated;
grant execute on function public.is_enrollment_homeroom_teacher(uuid) to authenticated;

alter table public.schools enable row level security;
alter table public.classes enable row level security;
alter table public.profiles enable row level security;
alter table public.class_teachers enable row level security;
alter table public.students enable row level security;
alter table public.enrollments enable row level security;
alter table public.consents enable row level security;
alter table public.checkin_sessions enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.meeting_requests enable row level security;
alter table public.islands enable row level security;
alter table public.asset_catalog enable row level security;
alter table public.student_items enable row level security;
alter table public.island_placements enable row level security;
alter table public.work_records enable row level security;
alter table public.work_record_students enable row level security;
alter table public.conflict_statements enable row level security;
alter table public.parent_consultations enable row level security;
alter table public.feedback_drafts enable row level security;
alter table public.feedback_sources enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.agent_threads enable row level security;
alter table public.agent_messages enable row level security;
alter table public.audit_log enable row level security;
alter table public.view_log enable row level security;

revoke insert, update, delete on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;

create policy schools_read on public.schools
for select to authenticated using (
  exists (
    select 1 from public.classes c
    where c.school_id = schools.id
      and (
        public.is_class_teacher(c.id)
        or exists (
          select 1 from public.enrollments e
          where e.class_id = c.id
            and public.is_enrollment_student(e.id)
        )
      )
  )
);

create policy classes_read on public.classes
for select to authenticated using (
  public.is_class_teacher(id)
  or exists (
    select 1 from public.enrollments e
    where e.class_id = classes.id
      and public.is_enrollment_student(e.id)
  )
);

create policy profiles_read_self on public.profiles
for select to authenticated using (id = auth.uid());

create policy class_teachers_read on public.class_teachers
for select to authenticated using (
  public.is_class_teacher(class_id)
  or exists (
    select 1 from public.enrollments e
    where e.class_id = class_teachers.class_id
      and public.is_enrollment_student(e.id)
  )
);

create policy students_read on public.students
for select to authenticated using (
  auth_user_id = auth.uid()
  or exists (
    select 1 from public.enrollments e
    where e.student_id = students.id
      and public.is_enrollment_teacher(e.id)
  )
);

create policy enrollments_read on public.enrollments
for select to authenticated using (
  public.is_enrollment_student(id)
  or public.is_enrollment_teacher(id)
);

create policy consents_read on public.consents
for select to authenticated using (
  exists (
    select 1 from public.enrollments e
    where e.student_id = consents.student_id
      and (
        public.is_enrollment_student(e.id)
        or public.is_enrollment_teacher(e.id)
      )
  )
);

create policy checkin_sessions_read on public.checkin_sessions
for select to authenticated using (
  public.is_enrollment_student(enrollment_id)
  or public.is_enrollment_teacher(enrollment_id)
);

create policy conversation_messages_read on public.conversation_messages
for select to authenticated using (
  exists (
    select 1 from public.checkin_sessions cs
    where cs.id = conversation_messages.session_id
      and (
        public.is_enrollment_student(cs.enrollment_id)
        or public.is_enrollment_teacher(cs.enrollment_id)
      )
  )
);

create policy meeting_requests_read on public.meeting_requests
for select to authenticated using (
  public.is_enrollment_student(enrollment_id)
  or public.is_enrollment_teacher(enrollment_id)
);

create policy islands_read on public.islands
for select to authenticated using (
  public.is_enrollment_student(enrollment_id)
  or public.is_enrollment_teacher(enrollment_id)
);

create policy asset_catalog_read on public.asset_catalog
for select to authenticated using (true);

create policy student_items_read on public.student_items
for select to authenticated using (
  public.is_enrollment_student(enrollment_id)
  or public.is_enrollment_teacher(enrollment_id)
);

create policy island_placements_read on public.island_placements
for select to authenticated using (
  exists (
    select 1 from public.islands i
    where i.id = island_placements.island_id
      and (
        public.is_enrollment_student(i.enrollment_id)
        or public.is_enrollment_teacher(i.enrollment_id)
      )
  )
);

create policy work_records_teacher_read on public.work_records
for select to authenticated using (public.is_class_teacher(class_id));

create policy work_record_students_teacher_read on public.work_record_students
for select to authenticated using (
  exists (
    select 1 from public.work_records wr
    where wr.id = work_record_students.work_record_id
      and public.is_class_teacher(wr.class_id)
  )
);

create policy conflict_statements_teacher_read on public.conflict_statements
for select to authenticated using (
  exists (
    select 1 from public.work_records wr
    where wr.id = conflict_statements.work_record_id
      and public.is_class_teacher(wr.class_id)
  )
);

create policy parent_consultations_homeroom_read on public.parent_consultations
for select to authenticated using (
  public.is_enrollment_homeroom_teacher(enrollment_id)
);

create policy feedback_drafts_read on public.feedback_drafts
for select to authenticated using (
  public.is_enrollment_teacher(enrollment_id)
  or (
    status = 'sent'
    and public.is_enrollment_student(enrollment_id)
  )
);

create policy feedback_sources_read on public.feedback_sources
for select to authenticated using (
  exists (
    select 1 from public.feedback_drafts fd
    where fd.id = feedback_sources.feedback_id
      and (
        public.is_enrollment_teacher(fd.enrollment_id)
        or (
          fd.status = 'sent'
          and public.is_enrollment_student(fd.enrollment_id)
        )
      )
  )
);

create policy analysis_runs_teacher_read on public.analysis_runs
for select to authenticated using (
  (source_type = 'session' and exists (
    select 1 from public.checkin_sessions cs
    where cs.id = analysis_runs.source_id
      and public.is_enrollment_teacher(cs.enrollment_id)
  ))
  or (source_type = 'message' and exists (
    select 1
    from public.conversation_messages cm
    join public.checkin_sessions cs on cs.id = cm.session_id
    where cm.id = analysis_runs.source_id
      and public.is_enrollment_teacher(cs.enrollment_id)
  ))
  or (source_type = 'record' and exists (
    select 1 from public.work_records wr
    where wr.id = analysis_runs.source_id
      and public.is_class_teacher(wr.class_id)
  ))
  or (source_type = 'student' and exists (
    select 1 from public.enrollments e
    where e.student_id = analysis_runs.source_id
      and public.is_enrollment_teacher(e.id)
  ))
  or (source_type = 'class' and public.is_class_teacher(source_id))
);

create policy agent_threads_owner_read on public.agent_threads
for select to authenticated using (teacher_id = auth.uid());

create policy agent_messages_owner_read on public.agent_messages
for select to authenticated using (
  exists (
    select 1 from public.agent_threads at
    where at.id = agent_messages.thread_id
      and at.teacher_id = auth.uid()
  )
);

create policy view_log_owner_read on public.view_log
for select to authenticated using (viewer_id = auth.uid());

revoke all on function public.get_student_context(uuid, timestamptz) from public;
grant execute on function public.get_student_context(uuid, timestamptz) to authenticated, service_role;

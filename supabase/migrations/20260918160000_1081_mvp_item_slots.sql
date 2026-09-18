-- MVP repeated checkins: remove the two-items-per-day cap, keep acquisition history.
begin;
alter table public.student_items drop constraint if exists student_items_slot_check;
alter table public.student_items alter column slot type integer;
alter table public.student_items add constraint student_items_slot_check check (slot > 0);
comment on column public.student_items.slot is
  'MVP: daily acquisition sequence (1, 2, 3, ...), without a daily issuance cap.';
comment on table public.student_items is
  'Immutable acquisition history. MVP allows unlimited daily acquisitions; one daily core item remains.';
commit;

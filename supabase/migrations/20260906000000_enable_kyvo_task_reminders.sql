create extension if not exists pg_cron with schema extensions;

create or replace function public.generate_task_reminders()
returns integer
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  inserted_count integer;
begin
  insert into public.notifications (user_id, type, message, date, seen)
  select
    t.user_id,
    'task_reminder',
    'Upcoming task: ' || t.name || ' starts in about 10 minutes.',
    to_char((t.date || ' ' || t.start_time)::timestamp without time zone, 'YYYY-MM-DD HH24:MI'),
    false
  from public.tasks t
  where coalesce(t.done, false) = false
    and t.date ~ '^\d{4}-\d{2}-\d{2}$'
    and t.start_time ~ '^\d{2}:\d{2}$'
    and ((t.date || ' ' || t.start_time)::timestamp without time zone)
        between (now() at time zone 'Africa/Lagos') + interval '9 minutes'
            and (now() at time zone 'Africa/Lagos') + interval '11 minutes'
    and not exists (
      select 1 from public.notifications n
      where n.user_id = t.user_id
        and n.type = 'task_reminder'
        and n.date = to_char((t.date || ' ' || t.start_time)::timestamp without time zone, 'YYYY-MM-DD HH24:MI')
        and n.message = 'Upcoming task: ' || t.name || ' starts in about 10 minutes.'
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

select cron.schedule(
  'kyvo-task-reminders',
  '* * * * *',
  $$select public.generate_task_reminders();$$
);

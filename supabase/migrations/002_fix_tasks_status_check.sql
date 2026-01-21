do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_name = 'tasks'
  ) then
    update tasks
    set status = 'INBOX'
    where status is null
      or status not in ('INBOX', 'OPEN', 'DONE');

    alter table tasks
      drop constraint if exists tasks_status_check;

    alter table tasks
      add constraint tasks_status_check
      check (status in ('INBOX', 'OPEN', 'DONE'));
  end if;
end $$;

create extension if not exists "pgcrypto";

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,
  created_at timestamptz not null default now()
);

alter table tasks
  add column if not exists status text not null default 'INBOX',
  add column if not exists priority text,
  add column if not exists project_id uuid references projects(id) on delete set null,
  add column if not exists work_days date[],
  add column if not exists notes text;

update tasks
set status = 'OPEN'
where status is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'tasks' and column_name = 'work_day'
  ) then
    alter table tasks
      alter column work_day drop not null;

    update tasks
    set work_days = array[work_day]::date[]
    where work_day is not null
      and (work_days is null or array_length(work_days, 1) = 0);

    alter table tasks
      drop column if exists work_day;
  end if;
end $$;

alter table tasks
  drop column if exists estimate_minutes;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_status_check'
  ) then
    alter table tasks
      add constraint tasks_status_check
      check (status in ('INBOX', 'OPEN', 'DONE'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_priority_check'
  ) then
    alter table tasks
      add constraint tasks_priority_check
      check (priority in ('P0', 'P1', 'P2', 'P3') or priority is null);
  end if;
end $$;

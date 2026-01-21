do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'projects'
  ) then
    alter table projects
      add column if not exists user_id uuid references auth.users;

    alter table projects
      alter column user_id set default auth.uid();

    if exists (
      select 1
      from pg_constraint
      where conname = 'projects_name_key'
        and conrelid = 'projects'::regclass
    ) then
      alter table projects
        drop constraint projects_name_key;
    end if;

    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'projects_user_id_name_key'
    ) then
      create unique index projects_user_id_name_key
        on projects(user_id, name);
    end if;

    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'projects_user_id_idx'
    ) then
      create index projects_user_id_idx on projects(user_id);
    end if;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'tasks'
  ) then
    alter table tasks
      add column if not exists user_id uuid references auth.users;

    alter table tasks
      alter column user_id set default auth.uid();

    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'tasks_user_id_idx'
    ) then
      create index tasks_user_id_idx on tasks(user_id);
    end if;
  end if;
end $$;

alter table if exists projects enable row level security;
alter table if exists tasks enable row level security;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'projects'
  ) then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'projects'
        and policyname = 'projects_owner_access'
    ) then
      create policy projects_owner_access
        on projects
        for all
        to authenticated
        using (user_id = auth.uid())
        with check (user_id = auth.uid());
    end if;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'tasks'
  ) then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'tasks'
        and policyname = 'tasks_owner_access'
    ) then
      create policy tasks_owner_access
        on tasks
        for all
        to authenticated
        using (user_id = auth.uid())
        with check (
          user_id = auth.uid()
          and (
            project_id is null
            or exists (
              select 1
              from projects
              where projects.id = tasks.project_id
                and projects.user_id = auth.uid()
            )
          )
        );
    end if;
  end if;
end $$;

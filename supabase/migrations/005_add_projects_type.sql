do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'projects'
  ) then
    alter table projects
      add column if not exists type text;

    update projects p
    set type = coalesce(
      (
        select case
          when count(*) filter (where t.type = 'PERSONAL') >
               count(*) filter (where t.type = 'WORK')
            then 'PERSONAL'
          else 'WORK'
        end
        from tasks t
        where t.project_id = p.id
      ),
      'WORK'
    )
    where p.type is null;

    alter table projects
      alter column type set default 'WORK';

    alter table projects
      alter column type set not null;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'projects_type_check'
        and conrelid = 'projects'::regclass
    ) then
      alter table projects
        add constraint projects_type_check
        check (type in ('WORK', 'PERSONAL'));
    end if;

    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'projects_user_id_type_idx'
    ) then
      create index projects_user_id_type_idx
        on projects(user_id, type);
    end if;
  end if;
end $$;

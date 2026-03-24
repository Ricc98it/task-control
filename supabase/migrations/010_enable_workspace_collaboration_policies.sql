do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'projects'
      and policyname = 'projects_workspace_access'
  ) then
    create policy projects_workspace_access
      on projects
      for all
      to authenticated
      using (
        workspace_id is not null
        and (
          exists (
            select 1
            from workspaces w
            where w.id = projects.workspace_id
              and w.owner_user_id = auth.uid()
          )
          or exists (
            select 1
            from workspace_members wm
            where wm.workspace_id = projects.workspace_id
              and wm.user_id = auth.uid()
          )
        )
      )
      with check (
        workspace_id is not null
        and (
          exists (
            select 1
            from workspaces w
            where w.id = projects.workspace_id
              and w.owner_user_id = auth.uid()
          )
          or exists (
            select 1
            from workspace_members wm
            where wm.workspace_id = projects.workspace_id
              and wm.user_id = auth.uid()
          )
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tasks'
      and policyname = 'tasks_workspace_access'
  ) then
    create policy tasks_workspace_access
      on tasks
      for all
      to authenticated
      using (
        (
          tasks.workspace_id is not null
          and (
            exists (
              select 1
              from workspaces w
              where w.id = tasks.workspace_id
                and w.owner_user_id = auth.uid()
            )
            or exists (
              select 1
              from workspace_members wm
              where wm.workspace_id = tasks.workspace_id
                and wm.user_id = auth.uid()
            )
          )
        )
        or exists (
          select 1
          from projects p
          where p.id = tasks.project_id
            and p.workspace_id is not null
            and (
              exists (
                select 1
                from workspaces w
                where w.id = p.workspace_id
                  and w.owner_user_id = auth.uid()
              )
              or exists (
                select 1
                from workspace_members wm
                where wm.workspace_id = p.workspace_id
                  and wm.user_id = auth.uid()
              )
            )
        )
      )
      with check (
        (
          tasks.workspace_id is not null
          and (
            exists (
              select 1
              from workspaces w
              where w.id = tasks.workspace_id
                and w.owner_user_id = auth.uid()
            )
            or exists (
              select 1
              from workspace_members wm
              where wm.workspace_id = tasks.workspace_id
                and wm.user_id = auth.uid()
            )
          )
        )
        or (
          tasks.project_id is not null
          and exists (
            select 1
            from projects p
            where p.id = tasks.project_id
              and (
                p.user_id = auth.uid()
                or (
                  p.workspace_id is not null
                  and (
                    exists (
                      select 1
                      from workspaces w
                      where w.id = p.workspace_id
                        and w.owner_user_id = auth.uid()
                    )
                    or exists (
                      select 1
                      from workspace_members wm
                      where wm.workspace_id = p.workspace_id
                        and wm.user_id = auth.uid()
                    )
                  )
                )
              )
          )
        )
      );
  end if;
end $$;

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, name)
);

create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('OWNER', 'EDITOR', 'VIEWER')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists workspace_members_user_id_idx
  on workspace_members(user_id);

alter table projects
  add column if not exists workspace_id uuid references workspaces(id) on delete set null;

alter table tasks
  add column if not exists workspace_id uuid references workspaces(id) on delete set null;

create index if not exists projects_workspace_id_idx
  on projects(workspace_id);

create index if not exists tasks_workspace_id_idx
  on tasks(workspace_id);

alter table workspaces enable row level security;
alter table workspace_members enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspaces'
      and policyname = 'workspaces_owner_or_member_access'
  ) then
    create policy workspaces_owner_or_member_access
      on workspaces
      for all
      to authenticated
      using (
        owner_user_id = auth.uid()
        or exists (
          select 1
          from workspace_members wm
          where wm.workspace_id = workspaces.id
            and wm.user_id = auth.uid()
        )
      )
      with check (owner_user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_members'
      and policyname = 'workspace_members_access'
  ) then
    create policy workspace_members_access
      on workspace_members
      for all
      to authenticated
      using (
        user_id = auth.uid()
        or exists (
          select 1
          from workspaces w
          where w.id = workspace_members.workspace_id
            and w.owner_user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from workspaces w
          where w.id = workspace_members.workspace_id
            and w.owner_user_id = auth.uid()
        )
      );
  end if;
end $$;

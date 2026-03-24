create or replace function public.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.owner_user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_workspace_owner(uuid) from public;
revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_owner(uuid) to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;

drop policy if exists workspaces_owner_or_member_access on public.workspaces;
create policy workspaces_owner_or_member_access
  on public.workspaces
  for all
  to authenticated
  using (
    owner_user_id = auth.uid()
    or public.is_workspace_member(id)
  )
  with check (owner_user_id = auth.uid());

drop policy if exists workspace_members_access on public.workspace_members;
create policy workspace_members_access
  on public.workspace_members
  for all
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_workspace_owner(workspace_id)
  )
  with check (public.is_workspace_owner(workspace_id));

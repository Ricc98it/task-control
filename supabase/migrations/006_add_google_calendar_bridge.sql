create table if not exists calendar_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  provider text not null check (provider in ('GOOGLE')),
  provider_account_email text,
  calendar_id text not null default 'primary',
  access_token text,
  refresh_token text,
  token_scope text,
  token_expires_at timestamptz,
  channel_id text,
  channel_resource_id text,
  channel_expires_at timestamptz,
  sync_token text,
  connection_status text not null default 'ACTIVE'
    check (connection_status in ('ACTIVE', 'PAUSED', 'ERROR')),
  last_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists calendar_integrations_user_id_idx
  on calendar_integrations(user_id);

create index if not exists calendar_integrations_status_idx
  on calendar_integrations(connection_status);

create table if not exists external_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  integration_id uuid not null references calendar_integrations(id) on delete cascade,
  provider text not null check (provider in ('GOOGLE')),
  provider_event_id text not null,
  calendar_id text not null,
  status text not null default 'confirmed',
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_all_day boolean not null default false,
  meeting_url text,
  meeting_provider text,
  attendees jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_id, provider_event_id)
);

create index if not exists external_calendar_events_user_id_idx
  on external_calendar_events(user_id);

create index if not exists external_calendar_events_starts_at_idx
  on external_calendar_events(starts_at);

create index if not exists external_calendar_events_status_idx
  on external_calendar_events(status);

create table if not exists task_external_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  external_event_id uuid not null references external_calendar_events(id) on delete cascade,
  link_type text not null default 'REFERENCE'
    check (link_type in ('REFERENCE', 'FOLLOW_UP', 'BLOCKING')),
  created_at timestamptz not null default now(),
  unique (task_id, external_event_id)
);

create index if not exists task_external_links_user_id_idx
  on task_external_links(user_id);

alter table calendar_integrations enable row level security;
alter table external_calendar_events enable row level security;
alter table task_external_links enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'calendar_integrations'
      and policyname = 'calendar_integrations_owner_access'
  ) then
    create policy calendar_integrations_owner_access
      on calendar_integrations
      for all
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'external_calendar_events'
      and policyname = 'external_calendar_events_owner_access'
  ) then
    create policy external_calendar_events_owner_access
      on external_calendar_events
      for all
      to authenticated
      using (user_id = auth.uid())
      with check (
        user_id = auth.uid()
        and exists (
          select 1
          from calendar_integrations ci
          where ci.id = external_calendar_events.integration_id
            and ci.user_id = auth.uid()
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
      and tablename = 'task_external_links'
      and policyname = 'task_external_links_owner_access'
  ) then
    create policy task_external_links_owner_access
      on task_external_links
      for all
      to authenticated
      using (user_id = auth.uid())
      with check (
        user_id = auth.uid()
        and exists (
          select 1
          from tasks t
          where t.id = task_external_links.task_id
            and t.user_id = auth.uid()
        )
        and exists (
          select 1
          from external_calendar_events e
          where e.id = task_external_links.external_event_id
            and e.user_id = auth.uid()
        )
      );
  end if;
end $$;

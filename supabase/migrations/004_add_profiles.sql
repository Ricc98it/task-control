create table if not exists profiles (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null,
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_email_key on profiles(email);
create index if not exists profiles_user_id_idx on profiles(user_id);

alter table profiles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_owner_access'
  ) then
    create policy profiles_owner_access
      on profiles
      for all
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

alter table profiles
  add column if not exists timezone text not null default 'Europe/Rome';

alter table calendar_integrations
  drop constraint if exists calendar_integrations_connection_status_check;

alter table calendar_integrations
  add constraint calendar_integrations_connection_status_check
  check (connection_status in ('ACTIVE', 'PAUSED', 'ERROR', 'SYNCING'));

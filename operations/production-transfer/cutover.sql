-- Run ONLY during approved coordinated production cutover, after fuel-sync is
-- deployed and authenticated read has passed. Pause edits and refresh all clients.
-- No test records, user IDs, auth passwords, or business values are imported.
begin;
create schema if not exists fuel_release_backups;
revoke all on schema fuel_release_backups from public, anon, authenticated;
create table if not exists fuel_release_backups.before_secure_rollout_20261018
  (like public.fuel_shared_state including all);
revoke all on table fuel_release_backups.before_secure_rollout_20261018 from public, anon, authenticated;
insert into fuel_release_backups.before_secure_rollout_20261018
select * from public.fuel_shared_state on conflict (id) do nothing;
-- Existing RLS policies are retained so their exact original definitions remain
-- available for reviewed rollback; revoke the direct browser privilege boundary.
revoke all privileges on table public.fuel_shared_state from public, anon, authenticated;
grant select, insert, update, delete on table public.fuel_shared_state to service_role;
commit;

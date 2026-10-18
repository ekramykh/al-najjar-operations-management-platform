-- Emergency rollback ONLY if explicitly approved. Reopens the legacy access
-- model, so it removes the new role separation. Coordinate with client rollback.
-- Never restore old record snapshots: preserve all current records and changes.
begin;
grant all privileges on table public.fuel_shared_state to anon, authenticated;
commit;

-- Phase 2: close direct browser access after the client has moved to fuel-sync.
-- Apply first to a staging project and verify Edge Function secrets/deployment.
-- The fuel-sync Edge Function uses service_role server-side; this key must never
-- be embedded in index.html or exposed to any client.
begin;

revoke all privileges on table public.fuel_shared_state from public, anon, authenticated;
grant select, insert, update, delete on table public.fuel_shared_state to service_role;

commit;

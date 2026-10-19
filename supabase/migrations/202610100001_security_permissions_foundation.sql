-- Security foundation for AL NAJJAR Operations Management Platform
-- Phase 1 only: adds server-managed per-user permissions.
-- This migration intentionally does NOT alter fuel_shared_state policies or grants.
-- Do not consider these permissions enforced until the API/write path is migrated
-- away from whole-snapshot client writes and the Phase 2 policies are deployed.

begin;

create table if not exists public.app_user_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  can_read boolean not null default true,
  can_add boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_manage_users boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_user_permissions_admin_has_all
    check (
      not can_manage_users
      or (can_read and can_add and can_edit and can_delete)
    )
);

comment on table public.app_user_permissions is
  'Server-managed per-user capabilities. Enforcement requires the secure API/write path; see SECURITY_IMPLEMENTATION_PLAN.md.';

alter table public.app_user_permissions enable row level security;

-- Make the browser privilege boundary explicit even if project-wide default
-- privileges would otherwise grant access to newly created public tables.
revoke all on table public.app_user_permissions from anon, authenticated;
grant select on table public.app_user_permissions to authenticated;
grant all on table public.app_user_permissions to service_role;

-- Users can read only their own permission record. Admin management is performed
-- by a trusted server-side function in a later phase, not by browser table writes.
drop policy if exists "Users can read their own permissions" on public.app_user_permissions;
create policy "Users can read their own permissions"
  on public.app_user_permissions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- No INSERT/UPDATE/DELETE policies are intentionally created for browser roles.
-- The table owner / trusted migration role can provision the initial administrators.

-- Optional initial roles are supplied privately by the operator in session
-- settings app.release_admin_email, app.release_add_email, app.release_reader_email.
-- With no settings this seeds nobody. Existing production assignments remain
-- untouched; do not rerun this migration just to release the frontend.
insert into public.app_user_permissions
  (user_id, can_read, can_add, can_edit, can_delete, can_manage_users)
select u.id, true, roles.can_add, roles.is_admin, roles.is_admin, roles.is_admin
from auth.users u
join (values
  (nullif(lower(current_setting('app.release_admin_email', true)), ''), true, true),
  (nullif(lower(current_setting('app.release_add_email', true)), ''), true, false),
  (nullif(lower(current_setting('app.release_reader_email', true)), ''), false, false)
) as roles(email, can_add, is_admin) on lower(u.email) = roles.email
on conflict (user_id) do update set
  can_read = excluded.can_read,
  can_add = excluded.can_add,
  can_edit = excluded.can_edit,
  can_delete = excluded.can_delete,
  can_manage_users = excluded.can_manage_users,
  updated_at = now();

commit;

-- Verification:
-- select u.email, p.can_read, p.can_add, p.can_edit, p.can_delete, p.can_manage_users
-- from public.app_user_permissions p
-- join auth.users u on u.id = p.user_id
-- order by lower(u.email);

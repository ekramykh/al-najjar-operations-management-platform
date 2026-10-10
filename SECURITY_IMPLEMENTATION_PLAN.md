# Security implementation plan

Branch: `security-server-side-auth-2026-10-10`
Base: stable `main` at merge commit `54914d23e7617954e0facaa20e54d5b1225fb171`

## Safety rules

- Do not change `main` directly.
- Do not revoke existing `fuel_shared_state` privileges or replace its policies until the browser's whole-snapshot writes are migrated and tested. The app currently writes the complete `records` array into the single row with `id = 'shared'`; simply blocking UPDATE for the add-only user would also block legitimate additions.
- Never put a Supabase `service_role` key in `index.html`, browser storage, or client configuration.
- Do not store or synchronize an administrator password in `fuel_shared_state`. Supabase Auth credentials and a server-verified permission record must be the source of identity/authorization.
- Do not merge until all acceptance checks below pass on a staging project or a safe test copy.

## Agreed capabilities

| Account | Read | Add | Edit | Delete | Manage users |
| --- | --- | --- | --- | --- | --- |
| ekramykh@gmail.com | yes | yes | yes | yes | yes |
| khaloudalmamri96@gmail.com | yes | yes | no | no | no |
| jaall77@yahoo.com | yes | no | no | no | no |

New accounts must start with least privilege and require an administrator to grant capabilities. Never assign administrator rights based only on an email supplied by the browser.

## Phase 1 (staged)

Migration `supabase/migrations/202610100001_security_permissions_foundation.sql` creates `public.app_user_permissions`, enables RLS, allows authenticated users to read only their own permission row, and seeds the agreed roles for accounts that already exist in Supabase Auth.

This migration intentionally does not modify `fuel_shared_state` access. It is a staged foundation, not a complete security fix: the existing app's data path still needs server-side enforcement.

## Required deployment order

1. Back up the Supabase database and export the current `fuel_shared_state` row and policies.
2. Run the verification query below to check which of the three emails already exist in Auth and which permission rows were seeded. Do not create duplicate Auth users.
3. Review the permission table and migration on a non-production copy first.
4. Implement a trusted server-side data API (for example, Supabase Edge Functions with JWT verification) that reads the caller's permission row and enforces read/add/edit/delete separately. Because the current client writes the whole shared snapshot, an add-only write must be validated as a diff against the server's current snapshot; reject changes to existing records and tombstones. Prefer a normalized per-record table and transactional operations if feasible.
5. Migrate the UI to call that API. Keep read-only users from invoking mutations, but treat UI disabling as convenience only; the server is the security boundary.
6. Move user creation/permission changes to an admin-only server operation. A new user defaults to read-only (or no data access until explicitly assigned); only the authenticated administrator can grant rights.
7. Remove the plaintext administrator password from localStorage and the synced record format. Design a compatibility migration for existing devices; do not silently erase records or overwrite cloud data.
8. Only after server enforcement is live and tested, replace the permissive `fuel_shared_state` policies and revoke unnecessary `anon` grants. Test realtime delivery and every data path before rollout.

## Verification query

Run after applying the migration in a test project:

```sql
select
  u.email,
  p.can_read,
  p.can_add,
  p.can_edit,
  p.can_delete,
  p.can_manage_users
from auth.users u
left join public.app_user_permissions p on p.user_id = u.id
where lower(u.email) in (
  'ekramykh@gmail.com',
  'khaloudalmamri96@gmail.com',
  'jaall77@yahoo.com'
)
order by lower(u.email);
```

A missing permission row means the account was not found/seeding did not happen; investigate before rollout. Never assume a missing account is provisioned.

## Acceptance tests (must pass before merge)

- Admin: read, add, edit, delete, manage users; permission changes take effect on the server.
- Add-only user: read and add; attempts to edit existing records, delete records, write tombstones, change app settings, or manage users are rejected by the server even with direct API calls.
- Read-only user: reads/realtime only; all write attempts rejected by the server.
- Unauthenticated client and `anon`: cannot read or mutate protected business data.
- New user: receives no elevated rights; admin can grant/revoke capabilities.
- Two-device tests: add, edit, delete, add-as-new, concurrent writes, reconnect/offline recovery, and realtime propagation.
- No record loss, duplicate IDs, or regression to localStorage quota failures.
- No secrets or plaintext admin password in the browser bundle, localStorage, or synchronized records.

## Current known blockers

- The current application stores the entire business dataset in one `fuel_shared_state` row, so per-record permissions cannot be safely enforced using browser table policies alone.
- The current client synchronizes a plaintext `adminPassword` setting and stores the admin password in localStorage. This must be removed as part of the auth migration.
- The migration seeds only Auth accounts that already exist; it does not create accounts or change their passwords.

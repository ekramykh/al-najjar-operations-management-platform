# Security implementation plan

Branch: `security-server-side-auth-2026-10-10`
Base: stable `main` at merge commit `54914d23e7617954e0facaa20e54d5b1225fb171`

## Password preservation requirement

- This security work must not change, reset, replace, or migrate the current passwords for any of the three existing accounts.
- The Phase 1 SQL migration does not update Supabase Auth credentials or password hashes. It only seeds/updates permission flags for matching existing Auth users.
- Do not deploy a password migration, call an Auth password-update endpoint, or ask users to change passwords as part of this rollout. Authentication redesign must preserve the existing sign-in method and credentials.
- The legacy application-level `adminPassword` is a separate, insecure shared setting; removing its authority is not the same as changing a Supabase account password. Do not delete or alter this legacy setting in the live app until a tested transition plan is approved, and never treat it as the source of server authorization.

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

This migration intentionally does not modify `fuel_shared_state` access. It is a staged foundation, not a complete security fix.

## Phase 2 (implemented on the security branch; not deployed)

- `supabase/functions/fuel-sync/index.ts` verifies the Supabase access token with `auth.getUser`, reads capabilities using the service role, and enforces read/add/edit/delete on the server.
- `index.html` now routes shared reads and writes through `fuel-sync`; it does not directly query or mutate `fuel_shared_state`.
- The function retains deletion tombstones, rejects reuse of deleted sync IDs, validates record-number conflicts, and uses optimistic concurrency when saving.
- A server-authorized `manage_users` action lists accounts, assigns explicit capabilities, and invites genuinely new email addresses. Existing accounts are matched before invitation and their current passwords are not reset or changed.
- The legacy application password is no longer included in outgoing snapshots or returned by the secure read API. Its local compatibility setting has not been deleted or migrated.
- The browser uses permission-checked polling instead of subscribing to raw table changes, because the old shared row may contain legacy settings.
- Migration `202610100002_secure_fuel_shared_state.sql` revokes direct table access from `PUBLIC`, `anon`, and `authenticated`; the Edge Function accesses the table with its server-only service role.

**Important:** These changes are committed to the security branch only. They have not been deployed to Supabase or verified against a staging database. Do not apply the second migration to production until the function is deployed and the staging acceptance tests pass.

## Required deployment order

1. Back up the Supabase database and export the current `fuel_shared_state` row and policies.
2. Run the verification query below to check which of the three emails already exist in Auth and which permission rows were seeded. Do not create duplicate Auth users.
3. Review the permission table and migration on a non-production copy first.
4. Implement a trusted server-side data API (for example, Supabase Edge Functions with JWT verification) that reads the caller's permission row and enforces read/add/edit/delete separately. Because the current client writes the whole shared snapshot, an add-only write must be validated as a diff against the server's current snapshot; reject changes to existing records and tombstones. Prefer a normalized per-record table and transactional operations if feasible.
5. Deploy the reviewed `fuel-sync` Edge Function to a staging project and configure its server-side secrets. Never expose the service-role key in the browser.
6. Apply the permission foundation migration in staging, then verify all three accounts and the exact permission matrix.
7. Test the secure UI/API, including add-only and read-only rejection paths, new-user invitations, add-as-new, edits, deletions, stale-device tombstones, concurrent writes, and reconnect behavior.
8. Only after the staging tests pass, apply `202610100002_secure_fuel_shared_state.sql` in staging to block direct browser access, then repeat the tests. The UI uses permission-checked polling rather than raw table realtime.
9. Plan a separate compatibility transition for the legacy application password in localStorage. Do not silently erase it or claim it is a Supabase credential.
10. Do not apply the access-revocation migration to production or merge into `main` until the staging acceptance tests pass.

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
- Read-only user: reads through the permission-checked API; all write attempts rejected by the server. Cross-device updates arrive through secure polling, not raw table realtime.
- Unauthenticated client and `anon`: cannot read or mutate protected business data.
- New user: receives no elevated rights; admin can grant/revoke capabilities.
- Two-device tests: add, edit, delete, add-as-new, concurrent writes, reconnect/offline recovery, and realtime propagation.
- No record loss, duplicate IDs, or regression to localStorage quota failures.
- No service-role secrets in the browser bundle or browser storage; no legacy admin password in API responses or synchronized records.
- The old application-level password remains in localStorage for compatibility and is not a cloud authorization credential. A separate approved transition is still required to remove it without changing or losing the current setting.

## Current known blockers

- The current application stores the entire business dataset in one `fuel_shared_state` row, so per-record permissions cannot be safely enforced using browser table policies alone.
- The legacy application password is no longer sent in sync requests or returned by the secure read API, but its existing localStorage setting remains. Do not delete or alter it until the compatibility transition is approved.
- The migration seeds only Auth accounts that already exist; it does not create accounts or change their passwords.

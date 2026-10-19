# Production transfer — prepared, not released

Target: Fuel Consumption (`mykwxfifrjohhjhomegf`). Production GitHub base:
`7fc29ff20a37d2d0c02e77ea2a8dc11274272e71` on `ekramykh/al-najjar-operations-management-platform`.
The owner's supplied HTML plus the fixes completed in this session is the UI source.
The current staging Edge Function source and existing regression tests are included.

## Already completed on production

Only the additive permission foundation migration has been applied. Existing Auth
user IDs are mapped to the agreed admin, add-only, and reader roles. No credentials
were read or changed. The shared row remained at 559 entries / 539 business records
and timestamp `2026-10-18T14:50:00.877+00:00` during the before/after check.
These are observations, not a frozen total: employees may continue adding records.

The old direct-write grants remain in place. **Role separation is not yet enforced
for the legacy production app.** The Edge Function deployment was blocked by
approval review because preparation did not authorize live deployment. It has not
been deployed to production. Main has not been merged or published.

## Data separation

- `defaultInitialRecords` is empty. No test or production business rows are shipped.
- Production URL and public anon key are pinned. Stale staging preferences cannot
  redirect this release to the test project. No service-role key is in the client.
- First login after this rollout backs up any local records, then loads the current
  authorized production cloud snapshot without uploading that cache. Old dirty
  flags and test records are not an upload source. If backup fails, loading stops.
- Normal same-project offline changes resume their existing queue after this
  first cloud load. Unsynced pre-rollout work stays in the local recovery backup;
  review it explicitly if any such real work exists before cutover.
- Production accounts are provisioned by existing email-to-Auth-ID mapping only.
  Test account IDs and permissions are never copied. No invitations or resets sent.

## Validation performed — updated 2026-10-20

`node --test tests/*.test.cjs`: **102 passed, 0 failed**. This includes actual
client merge/queue functions under forced simultaneous reads and an HTTP 409,
number gaps, high-number deleted tombstones, offline retry, all three server roles,
invalid sessions, stale writes, deletion resurrection rejection, Save as New,
trip documents, rendering escapes, and production cloud-first bootstrap.

The owner completed two-machine staging acceptance on 2026-10-19: add, edit,
Save as New, password-protected delete and wrong-password rejection, automatic
propagation, actual offline/reconnect, stale edit, stale deleted form, add-only
and reader restrictions. Final simultaneous additions appeared automatically on
both machines as SN 539 and 540 without refresh, Sync Now, repeat save or errors.
Earlier failures were investigated, not counted as passes. The client first
allocated low gaps, then included high test tombstones; both defects are fixed.
The separately supplied API acceptance report contains 15 passing backend checks.
These live tests preceded the contact/markup cleanup described below; those
cleanup paths have dedicated automated checks, not a new two-machine live run.

### Published-data cleanup

The shipped HTML now has an empty `tableBody`, empty embedded record array, no
hardcoded vehicle plates, driver names/phone numbers, and neutral initial KPI/count text.
Driver choices and phone lookup use the loaded dataset. A missing phone produces
a message instead of silently addressing a different driver's number. No cloud
record, account, password or permission was changed by this cleanup.
All CSS blocks are byte-identical to the pre-cleanup candidate; all DOM IDs remain.
No redesign was performed. A fresh automated visual run at multiple viewport/zoom
sizes could not be performed: the browser binary download was truncated. Prior
owner desktop screenshots and the programmatic checks are the available evidence;
mobile/zoom appearance after cleanup is not newly visually verified.

### Read-only production preflight

At preparation review on 2026-10-20, production had **563 JSON entries / 543 live
business records**, timestamp `2026-10-19T07:41:11.951+00:00`. These are observations,
not a frozen release count. Existing three accounts have the agreed role flags.
Browser permission-table UPDATE is denied. Legacy shared-table UPDATE remains
available so the old live app keeps working. There are still **no production Edge
Functions**; the staging `fuel-sync` is ACTIVE v4 with JWT validation enabled.
Production Auth credentials were neither read nor changed.

Preparation is for an owner-scheduled **coordinated cutover**, not a standalone
merge. At that time deploy the function, verify authenticated production reads,
take the current private snapshot, switch grants, publish, then run production
smoke checks before resuming employee work. These execution checks cannot truthfully
be marked complete before deployment. Keep the PR draft until the owner schedules it.

## Proposed cutover sequence — requires owner authorization

1. Confirm live release approval and a short coordinated edit pause. Employees save
   and sync all pending work, then close old tabs. Do not reset passwords.
2. Recheck main SHA for unrelated changes; rebase/review if it moved. Preserve the
   existing main commit in a backup branch before merge.
3. Deploy `supabase/functions/fuel-sync/index.ts` to production with JWT validation
   enabled and existing server-managed Supabase environment variables. Verify an
   authenticated read with existing accounts, without changing credentials.
4. Run preflight SQL; take the private database snapshot in `cutover.sql` at the
   cutover itself, not an old exported data file. Revoke direct access in the same
   transaction. Do not run the phase-2 migration early while old clients are active.
5. Merge this branch and confirm the GitHub Pages build serves the new client.
   Refresh all clients, sign in with their existing accounts, load cloud-first.
   Keep the edit pause through the publish/permission-switch interval.
6. Test admin add/edit/Save as New/delete and wrong delete password; verify the
   second device and reload. Test add-only and reader UI plus direct API attempts.
   Verify RLS blocks direct table writes and nobody can change their own role.
7. Confirm live data matches the cutover snapshot plus intentional new operations.
   Remove test operations individually only after verifying they are test records.
8. Resume work after gates pass. Keep current backups and main baseline.

## Rollback

Stop edits and preserve current cloud records first. A code rollback and legacy
access-grant rollback must be coordinated. `rollback-access.sql` restores the old
privilege model and its old security weakness; it is not an automatic fallback.
Do not overwrite current records from any old snapshot or embedded HTML.
Do not drop the permission table or change existing account passwords.

Password recovery remains unavailable unless an approved production recovery URL
and Auth redirect allow-list are configured. No SMTP, Auth security settings, or
redirect settings are changed by this preparation.

References: https://supabase.com/docs/guides/database/postgres/row-level-security
and https://supabase.com/docs/guides/functions/auth-headers .

## Publication privacy and local action password

The repository migration now takes optional initial-role emails from private
operator session settings; no account addresses are published in the migration
or its tests. No settings means no seed matches. Production roles were already
provisioned and verified; **do not rerun the foundation during cutover**. This
source-template cleanup was not applied to production and changes no permissions.
The frontend no longer embeds the old email-shaped local password default or
resets a stored value just because it matches that old default. Existing local
passwords are preserved. The existing fresh-device action prompt default remains
local-only; server permissions and signed-in credentials enforce cloud access.

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

## Validation performed

`node --test tests/*.test.cjs`: 92 passed, 0 failed at preparation time.
Covers server authorization, invalid sessions, add-only edit/delete rejection,
reader write rejection, two-client lifecycle in a mocked database, stale writes,
permanent tombstones, unchanged remote records, invoices, UI permission guards,
login, chart, and production cache bootstrap. All inline scripts parse.
Actual RLS read-isolation checks are run against existing production permission rows.
No business writes are performed by these checks.

Browser rendering, real device synchronization, and authenticated production
Edge Function requests remain release gates. Automated mocks are not substitutes
for these checks. No user passwords are available to the preparation workflow.

## Approved cutover sequence (not automatic)

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

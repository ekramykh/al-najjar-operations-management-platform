# Fuel release: coordinated cutover required

This candidate upgrades the existing production UI and authenticated `fuel-sync`
service. It contains code, reference station locations, schema definitions and
synthetic automated tests. No staging business records, accounts, passwords or
permission rows are included in this release.

## Candidate and validation

- Based on the approved pre-fullscreen staging HTML. The rejected header zoom
  compensation and fullscreen record workspace are excluded.
- Production URL/public key are retained from the current main release. Staging
  connection identifiers are absent; embedded initial business records are empty.
- Existing production cloud-first/project-switch safeguards remain enabled.
- Includes dark/light UI, account name/email and private profile photos, record
  audit history with edit reasons, expanded sales order/invoice/delivery details,
  dynamic trip routes and calculated distances, the documented Oman station
  directory, and serialized background polling with explicit reconnect states.
- `npm ci --ignore-scripts && node --test tests/*.test.cjs`: 201 passed locally.
- Recent profile-photo cloud persistence and latest workflows still require final
  two-device staging acceptance. Automated fixtures do not replace that check.
- Production connection and write smoke checks must happen during cutover before
  staff resumes. Do not merge or run deployment independently of this sequence.

## Existing production safeguards

The current production server already enforces the existing administrator,
add-only and read-only permissions. Keep those rows and Auth accounts unchanged.
Do not run old account provisioning or access cutover scripts for this upgrade.
The additional audit table and profile-photo bucket are not present in the
pre-upgrade production project; they must exist before publishing this UI.

## Cutover order

1. Confirm final two-device acceptance, employee edit pause, and zero pending
   production changes on each working device. Close old application tabs.
2. Confirm main has not moved since review. A backup branch retains the prior
   production code. Preserve a fresh private database snapshot and deployed Edge
   Function source separately; never commit those backups or real records here.
3. Review and apply `operations/production-transfer/audit-schema.sql`. This adds
   the audit table and atomic audited commit function; it does not import records
   or rewrite the shared dataset. Inspect existing objects before applying.
4. Review and apply `operations/production-transfer/profile-photo-storage.sql`.
   It creates a private bucket with access restricted to each user's own folder.
   Inspect existing bucket/policies first; this script is for first creation.
5. Deploy the reviewed `supabase/functions/fuel-sync/index.ts` to the existing
   production project, with JWT verification enabled and existing server secrets.
   No credential values or role mappings are changed. Old clients may no longer
   edit without an audit reason, so the edit pause and old-tab closure matter.
6. Verify backend health and authenticated production reads, then merge this PR
   and verify GitHub Pages publishes this exact reviewed artifact. The legacy
   manual deploy workflow is not used for this release.
7. Verify production record count/hash before any new test writes, unchanged
   permissions, login, history, photo save/reload, add/edit/Save as New/delete,
   rejection for restricted roles, and propagation between the two devices.
   Label smoke-test records explicitly and remove them only through authorized
   normal UI operations. Confirm pending changes are zero before staff resumes.

## Rollback

Revert the frontend to the preserved pre-upgrade main commit and redeploy the
saved pre-upgrade Edge Function if backend compatibility requires it. Keep the
current production dataset, including any legitimate post-cutover records.
Do not restore an old shared snapshot merely to revert UI code. Additive audit
and photo objects may remain unused. A full data restore needs a separate
review because it can discard later work.

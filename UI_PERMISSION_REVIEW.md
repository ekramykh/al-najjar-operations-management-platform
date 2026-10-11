# UI permission review — 11 October 2026

Branch: `review-ui-permission-guards-2026-10-11`.
Production baseline reviewed: `7fc29ff20a37d2d0c02e77ea2a8dc11274272e71`.
Original review/security head: `8d80e072f319e62a74c2ff003add0a9a23621107`.

The review branch now includes current main. The only merge conflict was the
manual deployment workflow; main's exact workflow was retained, including its
security-branch-only execution condition. Main was not modified.

## Changes

- Guard new records, Save as New, edits, deletes, and replacement imports before
  local mutation. Keep record viewing and copying available to add-only users.
- Disable existing form save controls according to the server-returned account
  permissions; no stylesheet or desktop layout changes.
- Resolve the open edit by sync identity rather than a stale array index. Reject
  saves if the record changed or disappeared during polling, retaining the form.
- Recheck permissions after password prompts and asynchronous file parsing.
- Stop queued writes/response application after account changes, preserve newer
  local saves during pending writes, and retain HTTP status for 409 retries.
- Refresh permissions on authorized reads and disable writes after read 401/403.
- Start polling only after initial connection reconciliation finishes.
- Run regression CI on this review branch with Node 24.

## Validation

`node --test tests/*.test.cjs`: 40 passing tests, no failures.
`git diff --check`: passes.
Inline JavaScript syntax parsing: passes (included in tests).
Main is an ancestor of the resulting review branch.

Tests execute actual record form functions and queue code with simulated DOM,
network, and storage. Server tests execute the actual Edge Function with mocked
Supabase clients. They include add/edit/delete between simulated devices,
permanent tombstones, duplicate prevention, and preservation of twelve unrelated
synthetic business records. These are not live browser or real device tests and
do not independently verify the twelve real production records.

Read-only inspection of staging `lfmuxtnurxaanixxflwc` confirmed fuel-sync is
ACTIVE, version 1, verify_jwt=true, and one each of administrator, add-only,
and read-only permission profiles. No SQL writes or deployments were performed.
Production Supabase was not accessed. Password values were not modified.

## Required practical test before approving any merge into main

Use this branch's index.html in a separate browser profile on each device.
Configure the staging URL `https://lfmuxtnurxaanixxflwc.supabase.co` and its
publishable/anon key in first-time connection settings. The source retains the
existing production default, so verify the staging URL before signing in.
Use staging accounts, not production data or an old production backup.

1. Administrator: add a clearly labeled temporary record via Save Record. Confirm
   it appears on device 2 after polling (normally about five seconds).
2. Add-only: open an existing record; Update Record must be disabled. Save as New
   must add a distinct record, leaving its source unchanged. Delete must be
   rejected before requesting the system password. Confirm both new records
   appear on the other device and repeated Sync Now does not increase the count.
3. Read-only: viewing and Sync Now work; new save, Save as New, update, deletion,
   and replacement import are blocked without local record changes.
4. Administrator: edit on device 2 and confirm device 1 receives the edit; delete
   the temporary record and confirm it disappears on both devices. A stale device
   must not bring it back on Sync Now.
5. Keep a record form open on device 1; change/delete that record on device 2.
   After polling, saving the old edit must show a conflict and retain the form.
6. Disconnect the network during a save, reconnect, and sync. Confirm the record
   persists once without duplication. Sign out while a save is pending and verify
   a different account does not apply the old request's response.
7. Compare the administrator desktop layout with the stable version and report
   any visible regression. No production merge or deployment is authorized here.

## Follow-up: safe startup and connection (11 October)

Fresh browser startup now uses zero business records. Embedded historical rows
are used only for lookup names and never seed local storage. The obsolete local
520-row automatic recovery has been removed. Unknown legacy caches and caches
from another Supabase project are backed up before authorized cloud data is
loaded; they are never automatically uploaded. If the backup fails, connection
stops without replacing the cache. Known same-project pending saves retain the
existing authorized queue. An absent shared dataset cannot trigger an automatic
initialization upload. Cloud tombstones preserve their original fields/version.

The practical test exposed an unintended upload of 520 embedded rows to staging.
Read-only inspection confirmed 520 active rows plus 6 tombstones in staging.
This fix does not remove or change those cloud rows. They will remain visible
when loading staging, so that count alone does not indicate another upload.
No production database operations or main-branch writes were performed.

# EK Axis production preparation — incomplete, do not merge

## Recoverable sources

- Production and preparation branch both started at `cb5afcff4c97a57cd00240a81a956666ef8200ea`.
- Existing production backup branch: `backup/main-before-ek-axis-ui-20261117`.
- Approved trial source recovered at `d3fdb72bc64fc3be9c9b373613c142bb78c1a8dd` (compact mobile document/trip action icons).
- Frontend source is copied from that trial with production URL/public key and existing production bootstrap marker. PWA assets are included. `rollback.html` is the existing production artifact, not the staging rollback artifact. Production data is not bundled.
- The trial Site and production main have not been changed by this preparation.

## Verification actually performed

`npm ci --ignore-scripts` and `npm test`: **215 tests, 196 passed, 19 failed**. Inline JavaScript syntax and the existing production-transfer data-isolation tests passed. This is not a release acceptance pass. An earlier conversation report of 225 passing tests could not be reproduced from the persisted branches.

Failures require investigation before merging:

- Audio test lacks the new gesture-capture DOM dependency.
- Renderer tests lack the shared VehicleBrand dependency.
- Save/edit tests lack the FuelPurchaseForm and FuelPurchases dependencies introduced by the trial. These must exercise the real purchase modules and validation rather than bypass them.
- Station save assertions expect the old direct fields; the trial now reads purchase fields via FuelPurchaseForm.
- Vehicle-choice expectations predate the approved Mitsubishi Fuso option.
- Polling source assertion expects direct signInWithPassword; trial authentication now uses signInWithExactEmail.
- Independently tested audit asset differs from the inline trial module. Reconcile and test the published module before release.

No browser, viewport/zoom, authenticated production, or two-device tests were performed in this resumed session.

## Backend findings (read-only inspection)

Production currently exposes public tables app_user_permissions, fuel_record_audit and fuel_shared_state; its only Edge Function is fuel-sync v2 with JWT verification enabled. Production has no delivery_entities, delivery_audit or app_layout_preferences tables and no delivery-manage function. Staging has those tables and delivery-manage v7. This contradicts the earlier statement that the new production dependencies had already been prepared.

The recovered delivery-manage source is retained under supabase/functions/delivery-manage for review, **still guarded to staging**. Do not deploy it as-is. The production adapter, schema/RPC/sequence/trigger definitions, private proof bucket and permissions must be inspected and prepared without copying staging entities, audit events, accounts or role rows. layout-preferences.sql is a first-creation proposal only; it has not been executed.

## Remaining release gates

1. Reconcile test dependencies and audit parity; investigate all failures and add meaningful coverage for new purchase validation.
2. Review and prepare missing backend objects and production-only service; preserve existing accounts, permissions and fuel records.
3. Verify the exact source visually on desktop/mobile at relevant zoom levels and authenticate on staging; include two-device sync and role checks.
4. Preserve a fresh private production snapshot and function baseline, coordinate zero pending device edits, deploy reviewed dependencies, then merge and verify publication and authenticated production behavior.

The historical PRODUCTION_TRANSFER.md describes the October release; its schema-absence and test-count statements must not be used as current evidence for this November release.

## Follow-up verification — 17 November 2026

Reproduced the baseline: 215 tests, 196 passed, 19 failed. Updated only test harnesses and expectations for the existing mobile audio gesture capture / silent audio priming, exact-email sign-in, and approved Mitsubishi Fuso option. All 19 tests in the three affected files pass. Full suite: **215 tests, 200 passed, 15 failed**. No application code, production backend, credentials, user permissions or data were changed. Remaining failures and release gates above still apply; no browser or two-device acceptance was performed.

## Automated verification completed — 17 November 2026

Full suite: **218 tests, 218 passed, 0 failed**. The remaining 15 failures were resolved by loading the actual published VehicleBrand, FuelPurchases and FuelPurchaseForm modules into isolated test contexts, providing their DOM/event dependencies, updating the station assertion to the current shared purchase reader, and synchronizing assets/record-audit.js with the already published inline module. The audit differences were the new refueling labels and VehicleBrand rendering; index.html was not changed.

Three additional tests exercise the actual purchase form: required choice / positive liters / positive total; duplicate receipt and copying a source purchase; pending cost and ascending optional odometer readings. Existing stale-record, permission, notes, multi-document and confirmation checks pass. npm test and git diff --check completed successfully. This completes automated verification only. No production backend deployment, browser viewport/zoom, authenticated staging, two-device sync or production acceptance is claimed. Backend and manual acceptance gates remain open.

## Live backend dependency inspection — 17 November 2026

Read-only Supabase inspection reconfirmed production has only fuel_shared_state, fuel_record_audit and app_user_permissions in public, and fuel-sync v2. Staging has delivery_entities, delivery_audit, app_layout_preferences, delivery-manage v7 and fuel-sync v8. No live database, account, policy or function was modified.

Reviewed delivery dependencies:
- delivery_entities: UUID identity, order/trip kind check, generated ALWAYS bigint number (starts 1), revision default 1, JSON object data, updated_at timestamp, primary key and unique number.
- delivery_audit: generated ALWAYS bigint sequence (starts 1), entity foreign key, actor UUID/email, reason, before/after JSON, confirmation timestamp, entity/sequence descending index. No non-internal triggers on these three tables.
- Delivery tables have RLS enabled, no user-facing policies or anon/authenticated table grants. Access is through the service; delivery_commit is invoker and executable only by postgres/service_role. It locks an existing row, checks revision, and commits the entity and audit event in one transaction. Simultaneous new-ID inserts remain protected by the primary key.
- app_layout_preferences exposes SELECT/INSERT/UPDATE to authenticated users, with own/global read policies and administrator checks for global writes. Existing proposal matches that access shape; no preference rows should be copied.
- delivery-proof is private, maximum 1 MiB, restricted to JPEG/PNG/PDF, with no delivery bucket user policies; function handles uploads and 60-second signed reads.
- The deployed delivery-manage v7 source remains explicitly staging-only. Current writes/uploads use can_manage_users (administrator), not fuel can_add/can_edit. This is a release decision to resolve before production rather than silently changing user capabilities.

Missing production delivery tables/RPC/identity sequences/private bucket and production function adapter remain deployment blockers. This inspection is not a schema execution test or an authenticated role acceptance pass.

Interface verification blocker: the connected local browser tool could not obtain the originating browser context. The cloud browser reached the trial URL but displayed the ChatGPT Sites access sign-in gate before the application. Therefore no application viewport, zoom, theme or authenticated workflow pass is claimed. Also, viewing the trial would not by itself verify the exact production-targeted preparatory artifact.

## Approved saved-session restoration — 17 November 2026

Root cause: the startup login gate always locked the app and only the fresh email/password path could initialize the shared client. Persisted Supabase auth alone therefore could not unlock a new page.

The narrowly scoped change adds a restore mode to the existing connection path: load/refresh the configured project's saved session, validate the user online with getUser, require matching user identity and the server fuel-sync read response's can_read permission and actor identity, then initialize data and polling before unlocking. Missing, expired, rejected or offline verification retains the gate and manual sign-in. Sign-out during pending restoration invalidates the attempt and cannot reopen the gate. Existing exact-email/password sign-in remains. No CSS/design, permissions, password or backend schema changes.

Automated checks: full preparatory suite **227 passed / 0 failed** (218 existing plus 9 restore tests). The actual trial HTML passed **27 session/login/poll tests**, and all **68 inline script blocks** parsed. Existing queue source-boundary tests were updated for the new optional connect parameter; their behavior assertions remain.

Applied the same patch to the original staging-targeted trial source (not the production-targeted index). Trial source baseline d3fdb72bc64fc3be9c9b373613c142bb78c1a8dd; patched source 380f15b9ae0c7536da4f8c0b5f2d8b8a0766ae31. Sites version 52 deployed successfully at the existing trial URL with access audience preserved. No main merge or production Supabase changes. Authenticated TinyFish browser verification is tracked at https://agent.tinyfish.ai/runs/e54740ec-6c1c-48ba-9b35-3f0fdd1b2ce4; final observations to be appended after completion.

### Completed authenticated trial browser verification

TinyFish run e54740ec-6c1c-48ba-9b35-3f0fdd1b2ce4 completed: saved session restored without credential entry; header showed Ekramy Kholosy / staging administrator and Connected & Synced, with zero pending changes. One reload restored access again and displayed the same dashboard values. Fuel Consumption displayed 551 entries; the dashboard's period metrics separately displayed 225 fuel records. These are UI observations, not a database integrity or metric-definition audit.

Dashboard, Fuel Consumption and Delivery Management were accessible. New Record tabs (General / Invoices / Trip / Fuel), New Delivery tabs (General / Documents & Planning / Payments / Delivery Proof), and New Trip fields were inspected and cancelled without saving. No clipping was reported at the browser's default desktop zoom (reported approximately 100%; precise viewport dimensions were not supplied). The transient verifying-session text was not observed, so no timing/animation claim is made.

Unverified: 80% zoom, mobile viewport, light theme, sign-out in the live browser, saves/edits/deletes, exports/imports, two-device sync and role acceptance. Automated tests cover sign-out during pending restore and denied/invalid sessions, but these are not live multi-account results. No claim that the production release gates are complete.

## User acceptance and backend candidate preparation

User subsequently reported entry without another password prompt and successful inspection on mobile and desktop. This closes the reported device inspection issue; exact zoom/theme were not specified and are not inferred.

Reproduced all 227 existing tests successfully. Prepared empty delivery schema/RPC/private-bucket SQL and a separate production-only service candidate under operations/production-transfer. Existing staging service, frontend and layout proposal are unchanged. Seven new handler/parity tests pass; full suite is now **234 passed / 0 failed**. These use simulated Supabase responses, not live role/concurrency tests. SQL has not been executed. See DELIVERY_DEPLOYMENT_REVIEW.md for exact scope and remaining gates, including the existing administrator-only delivery write policy. No hosted database changes, production merge or deployment occurred.

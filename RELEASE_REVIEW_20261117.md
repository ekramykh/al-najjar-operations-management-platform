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

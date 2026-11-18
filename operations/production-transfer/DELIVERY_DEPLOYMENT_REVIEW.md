# Delivery backend candidate — not deployed

Baseline: preparation commit `c2cfd59`; production main remains `cb5afcff4c97a57cd00240a81a956666ef8200ea`.

## Prepared changes

- `delivery-schema.sql`: first-creation transaction for empty delivery tables, identity sequences, history index, invoker commit RPC, explicit service-only access and private 1 MiB proof bucket. Matches inspected staging structure and commit behavior; copies no records, accounts, permissions or attachments. Existing objects cause failure rather than replacement.
- `delivery-manage/`: deployment candidate copied from the existing service. Uses an exact production URL and the approved fuel-style add/edit permission checks. Validation and place data are unchanged. Deploy under the existing frontend name `delivery-manage` only after release approval; retain JWT verification. Do not replace the staging function with this candidate.
- Existing `layout-preferences.sql` remains a separate first-creation proposal.

## Approved delivery permission correction

The user explicitly requested fuel-equivalent delivery roles on 17 November. List/history/proof reads still require server `can_read`. Creation requires `can_add`; updates require `can_edit`. Proof uploads resolve the entity on the server and require add permission for a new ID or edit permission for an existing ID. Flags returned by list are separate `canAdd` and `canEdit`; frontend creation, editing and saving use the corresponding flag. No role rows, schema, validation, design or passwords were changed. The existing revision-checked transaction prevents a forged revision-zero request from updating an existing row.

## Verification and limits

- Full Node suite: 234 passed, 0 failed (227 baseline plus 7 new candidate tests).
- New tests execute the candidate handler with simulated Supabase responses: exact project isolation, missing/invalid session, server read permission, reader/add-only write denials, verified actor attribution and stale-revision error propagation. They also verify candidate parity with original service and dependencies.
- Live catalog inspection reconfirmed missing delivery/layout tables in production and existing RLS-protected staging tables. Inspected staging columns, constraints, indexes, RPC and bucket configuration without writes.
- No Postgres or Deno runtime is available locally. Candidate SQL has not been executed, and mocked handler tests do not establish live database concurrency, deployment compatibility, storage policy isolation or multi-account acceptance. Review existing storage policies before deployment.
- User reported saved-session entry without another password prompt and successful mobile/desktop inspection. Exact zoom and theme were not specified; do not infer them.
- No live save/edit/delete, two-device sync, role acceptance or new production backup was performed in this session. No production deployment or main merge is authorized by this preparation.

## Remaining sequence

1. Validate SQL transaction/RPC/sequence privileges and storage isolation in an isolated database; verify rollback and concurrent revision handling.
2. Complete authenticated staging save/edit/conflict/role and two-client sync acceptance with disposable staging records, then clean up only those records.
3. Verify the approved delivery permission correction against live staging roles before final approval.
4. Prepare fresh production recovery snapshot and reviewed deployment request. Apply dependencies and deploy candidate only after explicit production approval. No test rows are to be transferred.

## Permission correction verification

Full Node suite: **244 passed / 0 failed**. Handler tests use simulated Supabase responses for reader, add-only, edit-only and administrator roles, including proof-upload denials on existing entries, lookup errors, actor attribution and revision-conflict propagation. UI tests execute the real create/edit/save entry guards and action-button rendering for all four permission combinations. All inline scripts parse, and `git diff --check` passes. Candidate and staging service remain equivalent except the project guard. The unchanged SQL revision check is inspected but no local Postgres runtime is available to execute it.

This is preparatory source verification. The hosted staging function and Site were not deployed by this correction; production, main and live data remain unchanged. Live multi-account, two-device, storage, viewport and zoom acceptance remain unverified. The frontend requires the corresponding updated service response before deployment; deploy the service before the frontend.

## Staging acceptance and production preflight (18 November 2026)

The staging delivery-manage function is active at version 8 with JWT verification enabled. An add-only account created a test delivery. The staging audit log attributed creation to that account, and the same record appeared on a second computer after Refresh. The UI offered View and History for the saved record. A live direct edit or attachment request with that account remains unverified.

The local working copy passed 245 automated tests, including simulated server-side authorization checks. That count includes separate local Fuel UI work. The staging save and second-device checks used the hosted trial.

Read-only production inspection confirmed that the Delivery tables, commit function, private proof bucket and Delivery Edge Function are absent. The prepared schema and production function still require deployment verification. The release sequence is to validate the SQL in isolation, capture a fresh recovery baseline, apply the schema, deploy the production function, and publish and verify the frontend. Create empty production tables and keep staging records in staging.

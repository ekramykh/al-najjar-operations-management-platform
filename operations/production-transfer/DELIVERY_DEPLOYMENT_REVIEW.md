# Delivery backend candidate — not deployed

Baseline: preparation commit `c2cfd59`; production main remains `cb5afcff4c97a57cd00240a81a956666ef8200ea`.

## Prepared changes

- `delivery-schema.sql`: first-creation transaction for empty delivery tables, identity sequences, history index, invoker commit RPC, explicit service-only access and private 1 MiB proof bucket. Matches inspected staging structure and commit behavior; copies no records, accounts, permissions or attachments. Existing objects cause failure rather than replacement.
- `delivery-manage/`: deployment candidate copied from the existing service. Only project guard changes, using an exact production URL. Validation and place data are unchanged. Deploy under the existing frontend name `delivery-manage` only after release approval; retain JWT verification. Do not replace the staging function with this candidate.
- Existing `layout-preferences.sql` remains a separate first-creation proposal.

## Current permission behavior retained

Delivery list/history/proof reads require server `can_read`; saves and uploads require `can_manage_users`. This means the fuel add-only account cannot create delivery orders or trips. Do not silently broaden it using `can_add` or `can_edit`. Whether delivery should follow the fuel role model needs an explicit release decision and separate implementation/tests if requested.

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
3. Resolve delivery permission policy before final approval.
4. Prepare fresh production recovery snapshot and reviewed deployment request. Apply dependencies and deploy candidate only after explicit production approval. No test rows are to be transferred.

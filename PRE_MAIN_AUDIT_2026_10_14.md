# Review of the approved stable file

Baseline: `dfa80745dc01daf833129e49ed66b1dcfe51400b`, identical to uploaded `index(4).html` (SHA-256 `e57400b7ed7336984d74d0b9d301685980c97b120f73301d4af8b2c0cb33bcf6`). The baseline branch and uploaded file are preserved. Corrections are isolated on `fix-pre-main-audit-2026-10-14`.

## Corrections

- Escape record text and dynamically generated option values before HTML insertion. An offline browser test of the baseline demonstrated script execution from a driver field. No cloud data was used or modified in that test.
- Bind the fuel alert button through a callback instead of placing user-supplied values in an inline JavaScript attribute.
- Escape serialized vehicle names in profile action attributes, fixing broken buttons and quote injection.
- Add regression tests for shared text, callback argument preservation, filter options and vehicle profile actions. Enable the existing test workflow on the isolated review branch.

Validation: 76 Node tests pass. Changes do not alter CSS, HTML layout, credentials, record identities or database writes. The baseline had passed 144 isolated Chrome layout checks and column chooser tests earlier. Browser tooling was not available in the resumed session, so the new corrections have not received a fresh full browser or two-device test. Mock tests do not establish live synchronization.

## Merge readiness

A Git merge simulation against main at `7fc29ff20a37d2d0c02e77ea2a8dc11274272e71` found no textual conflict. This does not establish production readiness. Recheck against the latest main immediately before any approved merge.

Read-only checks performed on 14 October 2026: staging has 526 active records and 8 tombstones, fuel-sync ACTIVE version 4, and authenticated direct table SELECT/INSERT/UPDATE/DELETE privileges are revoked. Production had 535 active records and 19 tombstones and no deployed Edge Functions. Counts can increase after this observation. No production writes, resets or password changes occurred.

Do not merge the secure client while production lacks its server endpoint. Prepare the production permission configuration, function deployment, recovery URL and compatibility transition for old clients before requesting approval for production actions. Do not revoke access used by the current main until the rollout order is agreed. Never replace current production records with the staging snapshot or embedded historical records.

## Practical staging acceptance still required

1. Create one trip containing two invoices: 300 and 700 OMR, with distinct branches and deliveries. Only 300 must warn, and saving must remain allowed. Receive both documents on device B.
2. Edit the second invoice on B, confirm the edit, verify it reaches A; remove one document, save and verify both devices.
3. Save as New: distinct record and sync IDs, source unchanged, exactly one new record on both devices.
4. Delete the test copy with the authorized account; verify deletion on B and no resurrection after reconnect. Do not delete real work records.
5. Repeat role checks: administrator full; add-only may add/copy but not edit/delete; reader may not write. Refresh/reconnect and compare counts and content.
6. Reopen a legacy single-invoice record without saving; verify display compatibility. Check Excel/JSON roundtrip using a test copy without importing into production.
7. Check login/account switching and token refresh after expiry. Earlier switching tests passed; long-session renewal remains unverified.

Email reset delivery succeeded once in staging, but regular production email delivery and rate limits still need verification. Dependencies currently use moving Chart.js/Supabase major-version CDN URLs; pin and validate versions before production rollout. The legacy local application password remains a compatibility prompt, not a server authorization mechanism, and was not changed.

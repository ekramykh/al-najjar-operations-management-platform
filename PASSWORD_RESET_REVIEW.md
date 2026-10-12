# Administrator password-reset workflow

Implemented on feature-trip-invoices-2026-10-12. Production/main are unchanged. No email or password change was performed during implementation.

Existing users have a Reset Password / Send Email button, including the current administrator. Each request requires confirmation, and the Edge Function independently checks can_manage_users and the target account's existence. The request sends a secure recovery link, never a password. No permissions or fuel records are written. Sending a link alone does not change the account password.

password-reset.html accepts recovery/invite links for the known production or staging Supabase projects, validates the session with getUser, and calls updateUser only after the recipient enters matching new passwords. Session persistence is disabled and a separate storage key is used to avoid replacing the application login. URL tokens are removed from browser history after processing. No password/token is logged or exported. Provider password rules still apply.

## Required staging setup before email testing

1. Host password-reset.html on a separate HTTPS staging address. Do not switch the production GitHub Pages source from main or merge this branch.
2. Add that hosted recovery URL to staging Supabase Auth Redirect URLs; account for the project_url and public_key query parameters (Supabase allows redirect patterns). Configure the staging email provider if necessary. The built-in provider may restrict recipients and rate-limit delivery.
3. Set FUEL_PASSWORD_RESET_REDIRECT_URL on staging Edge Function secrets to the HTTPS URL ending in /password-reset.html, without query or fragment. The server adds only its public project URL and anon key. It never accepts a caller-provided redirect URL or password.
4. The reviewed fuel-sync code was deployed to staging as version 2 with verify_jwt=true. No production deployment was performed or authorized.
5. On a dedicated existing staging test account, request reset, receive email, open link, select new password and confirm sign-in. Verify permissions remain unchanged. Also verify expired links and send failures. Do not use the administrator's current password for this test.

Until the hosted redirect secret is configured, reset requests return 503 before attempting email delivery. The new UI can display that configuration error; it must not claim success. Invitations remain the separate existing workflow. This change does not configure invitation links to the new recovery page.

71 automated tests pass, covering server authorization, missing hosting, nonexistent account, provider rate limits, unchanged records, secure server redirect selection, recipient password validation, recovery isolation and admin confirmation. Browser/email end-to-end validation and SMTP setup remain pending.

References:
https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
https://supabase.com/docs/reference/javascript/auth-updateuser
https://supabase.com/docs/guides/auth/redirect-urls

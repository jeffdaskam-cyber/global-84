# Password sign-in: rollout and support runbook

This release is the **compatibility release** from the password sign-in handoff. It adds password sign-in, individually issued temporary passwords, server-verified password setup, a branded reset page, install guidance, and roster-based membership rules. Email-link sign-in still works during the migration window and is removed at final cutover (section D).

Nothing in this change has been deployed. Every step below is yours to run, in order.

## How it works

| Piece | Where |
|---|---|
| Access state per member (`pending`, `issuing`, `temporary`, `ready`, `legacy`, `error`, plus `active`) | `cohorts/{cohort}/access/{uid}`, server-written only |
| Approved roster and delivery status | `cohorts/{cohort}/roster/{email}`, admin-readable |
| Credential operation log (no passwords) | `cohorts/{cohort}/credentialOperations/{id}`, server-only |
| Callables | `functions/src/memberAccess.ts` (logic in `memberAccessOps.ts`, pure rules in `memberAccessCore.ts`) |
| Operator tool | `functions/scripts/memberAccessOperator.ts` |
| Rules | `firestore.rules`, `storage.rules` (`canUseTripData`, `configuredCohort() = 'cohort84'`) |
| App | `AuthGate.jsx` (states), `ChangePasswordForm.jsx`, `ResetPassword.jsx` (`/reset-password`), `MemberAccess.jsx` (`/member-access`), `InstallGuide.jsx` |

Trip data (Firestore, Storage, translate, flight lookup, push notifications, deletePhoto) requires an access record that matches the caller's UID and email, is `active`, and is `ready` (or `legacy` before its `legacyUntil`). A verified `@du.edu` email alone no longer gets in.

Setup completion is decided on the server: when a temporary password is issued, the function records Auth's `passwordUpdatedAt` as a baseline. `completeMyPasswordSetup` marks the member `ready` only when Auth reports a later password change. This covers both the in-app "Choose your password" form and a Firebase reset email, so a member who resets by email is never asked to change the password again.

## A. Preparation (Firebase Console and Google Cloud)

1. **Inventory.** From `functions/` (credentials below):
   ```bash
   npx tsx scripts/memberAccessOperator.ts inventory --project global-84 --cohort cohort84
   ```
   Decide which existing accounts are real cohort members and staff. Save that list as a plain text file of emails, one per line, outside the repo.
2. **Authentication > Sign-in method:** enable **Email/Password**. Leave **Email link** enabled until section D.
3. **Authentication > Settings:**
   - Password policy: minimum length **8** (matches `MIN_PASSWORD_LENGTH` in `src/lib/auth.js`). If you also require character classes, generated passwords already include upper, lower, digit, and hyphens.
   - **Email enumeration protection: on.**
   - **User actions: turn off "Enable create (sign-up)".** Then confirm in a browser console that `createUserWithEmailAndPassword` fails with `auth/admin-restricted-operation`, and that `issue` (below) still creates accounts through the Admin SDK.
   - Authorized domains: `global-84.vercel.app` is present.
4. **Authentication > Templates > Password reset:** set the custom action URL to `https://global-84.vercel.app/reset-password`. (This URL also receives email sign-in links during migration; the page forwards those to `/`.) Send yourself a reset and confirm the delivered email opens the branded page.
5. **IAM for the functions.** The runtime service account (gen 2 default: `PROJECT_NUMBER-compute@developer.gserviceaccount.com`) needs `firebaseauth.users.get` for the `accounts:lookup` call and Auth admin rights for create/update. The default Editor role covers both. If the account has been narrowed, grant **Firebase Authentication Admin**.
6. **Storage cross-service rules.** The first `firebase deploy --only storage` with these rules prompts to let Storage read Firestore; accept it (or grant the Storage service agent `roles/firebaserules.firestoreServiceAgent`).
7. **Integration proof (release prerequisite).** With a throwaway test address on the roster:
   - `issue` it, sign in on a phone, choose a password, and confirm the access record turns `ready`.
   - `reset` it, then use **Forgot password** from the app instead of the form, finish on the reset page, sign in from the icon, and confirm it goes straight to `ready` with no second password prompt.
   - Check function logs for `lookup:` error codes. Record the results in the matrix below.

### Operator credentials

The operator tool uses your own Google login, no service-account key:

1. Copy `%APPDATA%\gcloud\legacy_credentials\jeff.daskam@gmail.com\adc.json` to a temp file outside the repo and add `"quota_project_id": "global-84"`.
2. Run commands from `functions/` with `GOOGLE_APPLICATION_CREDENTIALS=<that file>`.
3. Delete the temp file afterwards (it holds a refresh token).

Every writing command is a dry run until you add `--apply`. `issue`/`reset` print the password once; deliver it individually and clear the terminal.

## B. Bootstrap and compatibility release

Order matters: the rules deny anyone without an access record, so seed first.

1. Deploy functions, then the frontend (merge to `main`; Vercel deploys).
   ```bash
   firebase deploy --only functions
   ```
   The first deploy of new callables can time out on discovery; rerun.
2. Seed existing members with time-limited legacy access. Pick an end date for the migration window (for example, two weeks out). Nothing extends it automatically.
   ```bash
   npx tsx scripts/memberAccessOperator.ts seed-legacy --project global-84 --cohort cohort84 --emails C:\path\approved.txt --legacy-until 2026-11-01T23:59:59-06:00
   npx tsx scripts/memberAccessOperator.ts seed-legacy --project global-84 --cohort cohort84 --emails C:\path\approved.txt --legacy-until 2026-11-01T23:59:59-06:00 --apply
   ```
   Accounts flagged `NEEDS REVIEW` (unverified, disabled, other providers, UID mismatch) are skipped. Look at each one before doing anything with it.
3. Make sure both administrators have enabled allowlist entries (`grant-admin --email ... --apply` if needed).
4. Deploy the rules and indexes as whole files, then spot-check the app as a legacy member and as a non-rostered DU account.
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```
5. Bootstrap the two administrators through the operator path, since no admin is `ready` yet:
   ```bash
   npx tsx scripts/memberAccessOperator.ts issue --project global-84 --cohort cohort84 --email admin.one@du.edu --apply
   ```
   Each admin signs in from their own phone's icon, chooses a password, and reaches `ready`. Record delivery with the printed `mark-delivered` command. Repeat for the second admin. Now Member Access works in the app for both.

## C. Pilot and individual migration

1. Pilot with both admins plus a few members across iPhone Safari, Chrome, and Edge, Android Chrome, existing installs, and links opened from Mail, Gmail, Outlook, and WhatsApp.
2. Send the general group message (below) before changing anyone's password.
3. For each member, when you're ready to deliver: **Member Access > Issue temporary password** (you'll be asked to confirm your own password if your sign-in is older than five minutes). Copy the private setup message into an individual chat, then **Mark delivered and close**. Their legacy access ends at that moment and they see "Choose your password" at next open.
4. Watch statuses: *Ready for delivery*, *Delivered, awaiting setup*, *Ready*, *Needs attention*. Handle failures one member at a time; never rerun a cohort-wide reset.

If a dialog or response is lost, the app shows "Password issued; value no longer available." Issue a replacement if it wasn't delivered. Retries of the same request never change the password twice.

### Messages

General (group):

> Global 84 is ready for easier sign-in.
>
> 1. Open https://global-84.vercel.app on your phone.
> 2. Follow the on-screen steps to add Global 84 to your Home Screen. If you already have the icon, use that one.
> 3. Open Global 84 from the Home Screen icon.
> 4. Sign in with your DU email and the temporary password I send you privately.
> 5. Choose your own password and let your phone save it.
>
> After setup, you should normally just tap the icon and be in. If a link opens inside another app and you can't find Add to Home Screen, copy it into Safari and follow the instructions there.

Private messages are generated by the Member Access dialog. Never send a credential to the group.

## D. Final cutover

1. Every intended member and both admins are `ready`, or their exceptions are resolved.
2. Remove migration code, then search to confirm nothing active remains: `sendDuSignInLink`, `completeEmailLinkSignIn`, `signInWithPastedLink`, `global84EmailForSignIn`, `isSignInWithEmailLink`, `VITE_AUTH_REDIRECT_URL`, `EmailLinkFallback`, the `mode === "signIn"` forward in `ResetPassword.jsx`, and the `legacy` clauses marked `MIGRATION ONLY` in both rules files and `accessAllowsTripData` (functions and `src/lib/access.js`). Also delete the unused `src/pages/FinishSignIn.jsx`.
3. Deploy, then disable **Email link** in Firebase (keep Email/Password). Confirm sign-up is still disabled.
4. Test an old installed client against the new deployment: close and reopen, offline then online.

## Support

| Situation | What to do |
|---|---|
| Forgot password | In the app: **Forgot password?** The reset email's page sends them back to the icon. |
| Reset email never arrives | Check spam; otherwise **Issue replacement password**. |
| "Needs attention" | Operator `status --email ...` shows the last operation and error code. Issue a replacement once resolved. |
| Lost phone / remove someone | **Disable access** (revokes refresh tokens; open sessions lose server access within an hour; cached content on the device can't be wiped remotely). |
| Both admins locked out | Operator `reset --email <admin> --apply`. |
| App stuck on an old version | Close and reopen the app. The Me page shows the build ID. Reinstall only as a last resort. |

Rollback: redeploy the previous frontend and functions if needed, but keep the new rules and access records. Don't restore domain-only rules, re-enable sign-up, or reset the cohort.

## Verification record

Local checks run for this change:

- `npm.cmd run build` (frontend) and `npm.cmd --prefix functions run build`: pass.
- `npm.cmd --prefix functions test`: 19 unit tests for password generation, eligibility, replay, completion, and account review: pass.
- `npm.cmd run test:rules` (Firestore + Storage emulators, needs Java): 18 rules tests: pass.

Not verified (requires deployment or devices):

- `passwordUpdatedAt` behavior against real Firebase for create, `updatePassword`, and email reset (section A.7).
- Function IAM, Storage cross-service permission, reset template and action URL, sign-up disabled.
- Concurrency of simultaneous reset and completion against live Firestore (logic is unit tested; transactions recheck the version).
- Every row of the device matrix below.

### Device matrix

Record device, OS and browser version, entry point, build ID, outcome, time taken, and help needed.

| Scenario | Result |
|---|---|
| iPhone Safari / Chrome / Edge (Firefox if used): instructions, install, standalone launch | |
| Outlook / Gmail / WhatsApp link entry | |
| Android Chrome: native install prompt or manual steps | |
| Fresh install: temporary password, personal password, app; password manager keeps the personal one | |
| Close/reopen, force close, restart, next morning: no sign-in, setup, or splash | |
| Several days unused | |
| Weak Wi-Fi, airplane mode, reconnect | |
| Old installed version upgraded | |
| Browser sign-in then icon launch | |
| Large text with keyboard open | |
| Two devices: password change, reset, and revocation | |
| Returning member: time to usable cached home (target under 2 s) | |

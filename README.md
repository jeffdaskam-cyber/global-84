# Global 84 (Vite + React + Firebase)

A cohort web app for a University of Denver group. Password sign-in for an administrator-approved roster of accounts in a configurable email domain (defaults to `du.edu`), with individually issued temporary passwords, with Firestore-backed members, events, photos, group chat, teams, announcements, and an Explore feed sourced from a Google Sheet. Optional Anthropic-powered image translation runs as a Firebase Function.

Stack: Vite, React 19, React Router 7, Firebase (Auth, Firestore, Storage, Functions), Tailwind, deployed on Vercel with a serverless route under `/api`.

## Quick start

```bash
git clone <your fork>
cd <your fork>
npm install
cp .env.example .env   # fill in Firebase values
npm run dev
```

See `.env.example` for the full list of required environment variables.

## Forking checklist

If you are copying this repo to build your own version, work through these in order:

1. **Create your own Firebase project** at https://console.firebase.google.com.
2. **Update `.firebaserc`** to your project id:
   ```json
   { "projects": { "default": "your-project-id" } }
   ```
3. **Enable Firebase services** in the console:
   - Authentication, with Email/Password turned on, public sign-up turned off, and email enumeration protection on. (Email Link stays on only during a migration from email-link sign-in.)
   - Cloud Firestore (Native mode).
   - Cloud Storage.
4. **Copy `.env.example` to `.env`** and fill in the Firebase web config plus your `VITE_COHORT_ID` and `VITE_ALLOWED_EMAIL_DOMAIN`. The cohort ID is also hardcoded as `configuredCohort()` in `firestore.rules` and `storage.rules` and as `CONFIGURED_COHORT_ID` in `functions/src/memberAccessCore.ts`; change all of them together.
5. **Deploy Firestore rules and indexes** (requires the Firebase CLI):
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```
6. **Set CORS on the Storage bucket.** Gallery downloads `fetch()` photos from Storage, which the browser only allows if the bucket has a CORS policy. `firebase deploy` does not apply it. Edit the origins in `storage-cors.json` to your domains, then run once with the Google Cloud SDK:
   ```bash
   gcloud storage buckets update gs://<VITE_FIREBASE_STORAGE_BUCKET> --cors-file=storage-cors.json
   gcloud storage buckets describe gs://<VITE_FIREBASE_STORAGE_BUCKET> --format="default(cors_config)"
   ```
   Re-run it whenever you add a domain.
7. **Bootstrap your administrators and roster.** Membership comes from server-written access records, so the first admins are set up with the operator tool (`functions/scripts/memberAccessOperator.ts`: `grant-admin`, then `issue`), after which the in-app **Member Access** page handles everyone else. See `docs/password-signin-runbook.md` for the full sequence, Firebase Console settings, and IAM.
8. **(Optional) Configure the image-translation function.** If you want the `translateImage` callable function:
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY
   firebase deploy --only functions
   ```
9. **(Optional) Wire up the Explore feed.** Publish a Google Sheet to the web as CSV, then set `VITE_EXPLORE_SHEET_URL` in your Vercel project (NOT in `.env`, since the proxy at `api/sheets.js` reads it server-side).
10. **Swap branding.** The launch page (`public/launch.html`), splash images in `public/`, and copy referencing "Global 84" or specific cities (Singapore, HCMC) are project-specific. Replace as needed.

## Deploying to Vercel

Vercel project settings:

- **Framework preset**: Vite
- **Build command**: `npm run build`
- **Output directory**: `dist`

In Vercel, add every variable from `.env.example` under Project Settings > Environment Variables (Production and Preview). Don't forget `VITE_EXPLORE_SHEET_URL` if you use Explore.

In the Firebase Console > Authentication > Settings, add your Vercel preview and production domains to **Authorized domains**. Add the same domains to `storage-cors.json` and re-run the `gcloud` command above, or photo downloads fail with a CORS error.

## Routing

`vercel.json` has a catch-all rewrite to `/` so React Router routes like `/explore`, `/events`, and `/me` resolve correctly on refresh and direct open. `/launch` is served as a static HTML page, and `/api/*` is preserved for serverless functions.

## Sign-in and member access

- Members sign in with their DU email and password. First sign-in uses a unique temporary password an admin issues from **Member Access** (`/member-access`) and delivers individually; the app then requires choosing a personal password before any trip content loads.
- Forgotten passwords use Firebase's reset email, which lands on `/reset-password` (set it as the custom action URL under Authentication > Templates).
- Firestore, Storage, and the functions all require an active, set-up access record in `cohorts/{cohort}/access/{uid}`; a verified domain email alone is not enough.
- `docs/password-signin-runbook.md` covers rollout, recovery, and the device test matrix.
- Three exclusive roles: Member, Program Leader, Admin. Admin is `cohorts/{cohort}/admins/{uid}.enabled`; Program Leader is `cohorts/{cohort}/programLeaders/{uid}.enabled`. Admins set roles per roster row on **Member Access** (the `setMemberRole` callable; nobody can change their own role, and the last admin can't be demoted). Program Leaders can post, pin, and archive announcements (badged "Program Leader"), delete cohort chat messages and gallery photos, and delete event chat messages only in events they've joined; every other admin tool stays admin-only. `members/{uid}.role` is self-writable and never used for authorization.

Email-link sign-in remains available only during the migration window (`VITE_AUTH_REDIRECT_URL` sets where those links land) and is removed at final cutover.

## Tests

```bash
npm --prefix functions test     # member-access logic (no emulator needed)
npm run test:rules              # Firestore + Storage rules on the emulators (needs Java)
```

## iPhone test checklist

1. Open your Vercel URL in Safari and follow the Home Screen steps on the sign-in screen.
2. Open the icon and sign in with a test account's temporary password.
3. Choose a new password and confirm the phone offers to save it.
4. Navigate to `/explore`, `/events`, and `/me`; refresh each to verify no 404 on deep links.
5. Close and reopen the icon: you should land in the app without signing in.

## License

MIT. See `LICENSE`.

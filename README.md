# Global 84 (Vite + React + Firebase)

A cohort web app for a University of Denver group. Email-link sign-in restricted to a configurable email domain (defaults to `du.edu`), with Firestore-backed members, events, photos, group chat, teams, announcements, and an Explore feed sourced from a Google Sheet. Optional Anthropic-powered image translation runs as a Firebase Function.

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
   - Authentication, with Email/Password and Email Link sign-in turned on.
   - Cloud Firestore (Native mode).
   - Cloud Storage.
4. **Copy `.env.example` to `.env`** and fill in the Firebase web config plus your `VITE_COHORT_ID` and `VITE_ALLOWED_EMAIL_DOMAIN`.
5. **Deploy Firestore rules and indexes** (requires the Firebase CLI):
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```
6. **Bootstrap your first admin.** Sign in once so your user gets a uid, then in the Firestore console create the document:
   ```
   cohorts/{VITE_COHORT_ID}/admins/{your-uid}
   { "enabled": true }
   ```
   Security rules block client writes to this collection, so it has to be done from the console.
7. **(Optional) Configure the image-translation function.** If you want the `translateImage` callable function:
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY
   firebase deploy --only functions
   ```
8. **(Optional) Wire up the Explore feed.** Publish a Google Sheet to the web as CSV, then set `VITE_EXPLORE_SHEET_URL` in your Vercel project (NOT in `.env`, since the proxy at `api/sheets.js` reads it server-side).
9. **Swap branding.** The launch page (`public/launch.html`), splash images in `public/`, and copy referencing "Global 84" or specific cities (Singapore, HCMC) are project-specific. Replace as needed.

## Deploying to Vercel

Vercel project settings:

- **Framework preset**: Vite
- **Build command**: `npm run build`
- **Output directory**: `dist`

In Vercel, add every variable from `.env.example` under Project Settings > Environment Variables (Production and Preview). Don't forget `VITE_EXPLORE_SHEET_URL` if you use Explore.

In the Firebase Console > Authentication > Settings, add your Vercel preview and production domains to **Authorized domains**.

## Routing

`vercel.json` has a catch-all rewrite to `/` so React Router routes like `/explore`, `/events`, and `/me` resolve correctly on refresh and direct open. `/launch` is served as a static HTML page, and `/api/*` is preserved for serverless functions.

## Email-link redirect behavior

Email-link sign-in uses:

- `VITE_AUTH_REDIRECT_URL` when provided
- otherwise `window.location.origin`

Set `VITE_AUTH_REDIRECT_URL` in production so links return to your deployed domain instead of localhost.

## iPhone Safari test checklist

1. Open your Vercel URL in Safari.
2. Start email-link sign-in with your allowed email.
3. Tap the email link on iPhone.
4. Confirm it opens and completes sign-in on the same deployed domain.
5. Navigate to `/explore`, `/events`, and `/me`.
6. Refresh each page to verify no 404 on deep links.
7. Add to Home Screen and launch from the icon.
8. Repeat navigation and sign-in checks from the Home Screen context.

## License

MIT. See `LICENSE`.

# Global 84 (Vite + React + Firebase)

## Vercel build settings
Use these project settings in Vercel:

- **Framework preset**: Vite
- **Build command**: `npm run build`
- **Output directory**: `dist`

`package.json` already defines the build command. `npm run build` outputs a production build to `dist`.

## React Router deep-link support on Vercel
This repo includes `vercel.json` with a catch-all rewrite to `/` so routes like `/explore`, `/events`, and `/me` work on refresh and direct open:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

## Firebase Authentication settings (required)
In Firebase Console → Authentication → Settings:

1. Add your Vercel domain(s) to **Authorized domains** (both preview and production domains you use).
2. Keep Email Link sign-in enabled.

## Email-link redirect behavior
Email-link sign-in now uses:

- `VITE_AUTH_REDIRECT_URL` when provided
- otherwise `window.location.origin`

This ensures links return to your deployed domain instead of localhost in production.

## iPhone Safari test checklist
1. Open your Vercel URL in Safari.
2. Start email-link sign-in with your allowed email.
3. Tap the email link on iPhone.
4. Confirm it opens and completes sign-in on the same deployed domain.
5. Navigate to `/explore`, `/events`, and `/me`.
6. Refresh each page to verify no 404 on deep links.
7. Add to Home Screen and launch from the icon.
8. Repeat navigation/sign-in checks from Home Screen context.

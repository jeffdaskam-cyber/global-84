# Flight Auto-Fill — Go-Live Setup

Everything in the PR is built and merged-ready, but the feature stays dormant
until you do the operational steps below: get an API key, give it to the Cloud
Function, deploy, and point the app at the function's URL. Until the last step,
flight entry stays fully manual and no errors are shown to anyone.

Do these in order. Each shell command is meant to run from the repo root
(`global-84`) unless noted.

---

## 1. Get the AeroDataBox API key (RapidAPI)

The Cloud Function calls AeroDataBox through RapidAPI (host
`aerodatabox.p.rapidapi.com`), so the key you need is a **RapidAPI** key.

1. Sign in / sign up at https://rapidapi.com.
2. Open the AeroDataBox API: https://rapidapi.com/aedbx-aedbx/api/aerodatabox
3. Click **Subscribe to Test** and pick a plan. The **Basic (free)** plan is
   enough for this trip's volume; you can raise it later without code changes.
4. On any endpoint page, copy the value shown for **`X-RapidAPI-Key`**
   (also visible under your account's *Apps → default-application → Security*).
   That string is the key for the next step.

> While you're there, open the **`GET Flight status by flight number and
> date`** endpoint and note its exact path and the shape of the JSON response —
> you'll confirm our field mapping against it in step 6.

---

## 2. Store the key as a Firebase secret

The key is held in Firebase Secret Manager and never ships to the browser. Set
it once:

```
firebase functions:secrets:set AERODATABOX_API_KEY
```

Paste the RapidAPI key when prompted, press Enter. (If it asks about enabling
the Secret Manager API the first time, say yes.)

Verify it landed:

```
firebase functions:secrets:access AERODATABOX_API_KEY
```

---

## 3. Deploy the Cloud Function

```
firebase deploy --only functions:lookupFlight
```

Notes:
- `lookupFlight` is an **HTTPS** function, not a Firestore/event trigger, so the
  gen-2 first-deploy Eventarc delay we've hit before does **not** apply here — it
  should deploy on the first try.
- A fresh secret only reaches the function when the function is (re)deployed, so
  this deploy is also what grants it access to the key. Any time you rotate the
  key, run step 2 then this deploy again.
- When it finishes, the CLI prints a **Function URL** line for
  `lookupFlight(us-central1)`. Copy that URL — it's what the app POSTs to. You
  can also find it later at
  https://console.firebase.google.com/project/global-84/functions

---

## 4. Point the app at the function URL

The frontend reads the URL from `VITE_LOOKUP_FLIGHT_FUNCTION_URL`. Set it in two
places.

**Local** (`.env` in the repo root — create it from the template if you don't
have one):

```
cp .env.example .env
```

Then fill in your real Firebase web-config values **and** add the function URL
from step 3:

```
VITE_LOOKUP_FLIGHT_FUNCTION_URL=<paste the Function URL here>
```

**Vercel** (production + preview): Project → **Settings → Environment
Variables** → add `VITE_LOOKUP_FLIGHT_FUNCTION_URL` with the same value, for the
Production and Preview environments.

> `VITE_*` variables are inlined at **build** time, so setting it in Vercel does
> nothing until you redeploy. After the PR merges, trigger a new Vercel
> deployment (or push to the branch Vercel builds) so the URL is baked into the
> bundle.

---

## 5. Confirm the CORS allowlist covers your domain

The function currently accepts requests from `localhost:5173` and any
`*.vercel.app` origin. If the cohort uses a **custom domain** (not the
`*.vercel.app` URL), add it to the `cors` origin check near the top of
`functions/src/lookupFlight.ts`, then redeploy (step 3). If you're only on the
Vercel URL, skip this.

---

## 6. Verify the response mapping against the live API

Our adapter (`mapAeroDataBoxFlight` in `functions/src/lookupFlight.ts`) was
written against AeroDataBox's documented v1 field names. API shapes drift, so
confirm these paths against a real response from the endpoint you opened in
step 1, and adjust the readers if any differ:

- `departure.airport.iata`, `departure.airport.name`, `departure.airport.timeZone`
- `departure.scheduledTime.utc` (and the same under `arrival`)
- `departure.terminal`, `departure.gate` (and `arrival`)
- `airline.name`, `airline.iata`
- `aircraft.model`
- `status`

The mapper is deliberately forgiving (missing fields become blank, not errors),
so a small naming difference degrades gracefully rather than breaking — but the
airports and times are the ones worth getting exactly right.

---

## 7. End-to-end test

After the frontend redeploys with the URL set:

1. Open the app, go to **My Flights**, **Add Flight**.
2. Pick an airline, enter a flight number and a departure date for a real,
   near-term flight (e.g. a Singapore Airlines flight in the next few days).
3. Click **Look up flight**.
   - **One match** → airports, times, zones, and (if published) terminal/gate
     fill in, badged "auto". Edit anything to override.
   - **Several matches** → the chooser lists them; pick yours.
   - **No match / bad number** → you get a "enter manually" message and the form
     still saves.
4. Save, and confirm the segment card shows the flight with its status badge.
5. On an auto-filled leg, reopen the editor and try **Refresh from flight data**
   to confirm the live re-fetch path.

If a lookup ever returns an error, check the function logs:

```
firebase functions:log --only lookupFlight
```

---

## Quick reference

| Thing | Value |
|---|---|
| Firebase project | `global-84` |
| Secret name | `AERODATABOX_API_KEY` |
| Function | `lookupFlight` (HTTPS, us-central1) |
| Frontend env var | `VITE_LOOKUP_FLIGHT_FUNCTION_URL` |
| Provider | AeroDataBox via RapidAPI (`aerodatabox.p.rapidapi.com`) |
| Rate limit | 60 lookups/member/hour (cache hits are free) |
| Cache | shared `flightLookups/{designator|date}`, 3h TTL, Refresh bypasses |

# Auditing event and meeting times created before the timezone fixes

One-time cleanup. Events and team meetings created before the timezone fixes
were saved in the author's **device** timezone, not the trip city's. Now that
the app renders every time in the destination city's wall clock (SGT/ICT), a
legacy entry displays the wrong hour — often the wrong day.

## Why the stored times are wrong

Before the fixes, typing "7:00 PM" into the form stored 7:00 PM *in whatever
timezone the device was in*. An event entered from Denver as "dinner at 7:00 PM"
was stored as 7:00 PM Mountain time — which the app now correctly renders as
**9:00 AM the next morning, SGT**. The stored instant is wrong; the display is
faithfully showing the wrong instant.

Entries made from a device already set to the city's timezone are fine (the
device offset matched the city offset), but before departure almost everything
was entered from the US.

## What's in scope

Both fixes merged on **July 28, 2026** (US Mountain time):

| Data | Firestore path | Time field | Suspect if `createdAt` before |
| --- | --- | --- | --- |
| Events | `cohorts/{cohortId}/events` | `startTime` | ~3:40 PM MDT, Jul 28 2026 |
| Team meetings | `cohorts/{cohortId}/teams/{teamId}/meetings` | `dateTime` | ~7:30 PM MDT, Jul 28 2026 |

`cohortId` is the value of `VITE_COHORT_ID`.

**The cutoffs are soft.** This is a PWA with a service worker: a member whose
installed app hadn't yet picked up the new build kept writing device-local
times *after* the merge. Treat anything created within a day or two after the
cutoff as suspect too, and rely on the plausibility sweep (step 4) as the
backstop.

Legacy meetings also have no `city` field — the app falls back to displaying
them in Singapore time. Meetings that will happen in Ho Chi Minh City need the
city set during the same edit.

## Audit steps

### 1. Make sure your client is up to date first

Do the whole audit from one device running the current build, otherwise your
"fix" re-saves a device-local time and makes things worse. The tell: open any
meeting's Add/Edit form — the new build shows **city chips (Singapore / HCMC)**
and a "local time in {city} (SGT/ICT)" label on the date field. If you don't
see them, close all app tabs and reopen (or hard-refresh) until the service
worker updates.

### 2. List the suspects

In the Firebase console → Firestore:

- `cohorts/{cohortId}/events` — note every doc whose `createdAt` is before the
  cutoff: title, creator (`createdByName`), `startTime`, `city`.
- `cohorts/{cohortId}/teams/{teamId}/meetings` — repeat per team. Legacy docs
  are easy to spot: they have **no `city` field**.

With 25 users this is likely a short list.

### 3. Recover the intended time — no math needed

The wall-clock time the author typed **is** the stored instant rendered in the
author's home timezone. The Firestore console displays timestamps in *your
browser's* timezone — so if you and the author are both on US Mountain time,
the value you see in the console is exactly what they meant. ("Aug 5, 7:00 PM"
in the console → they meant Aug 5, 7:00 PM in the trip city.)

If the author was in a different timezone than you, either ask them, or render
the stored instant in their zone.

### 4. Fix through the app, not the console

For each suspect, open its edit form in the app (event creator or admin):

1. The date field shows the currently-stored time in the city's wall clock —
   this is the wrong value.
2. Retype the intended wall-clock time from step 3.
3. Confirm the correct city chip is selected (for legacy meetings, actively
   choose it — this also backfills the missing `city` field).
4. Save. The current build stores the instant correctly via
   `wallClockToInstant`.

Avoid editing timestamps directly in the Firestore console; you'd have to
compute the UTC instant by hand, which is exactly the error-prone step the app
now does for you.

Then do a plausibility sweep of every card in Events and each team's meetings:
dinners should read as evenings SGT/ICT, morning activities as mornings.
Anything at 3:00 AM is a missed legacy entry (a Denver-entered evening shows up
+14 h in SGT, +13 h in ICT).

### 5. Verify

Pick one corrected event. Check it from two devices in different timezones (or
flip one device's timezone manually between America/Denver and Asia/Singapore).
Both must show the identical wall-clock time with the zone label. If they
differ, the client that differs is running a stale build — go back to step 1.

## Done when

- Every event and meeting with pre-cutoff `createdAt` has been opened, its time
  confirmed or corrected, and (for meetings) a `city` set.
- The plausibility sweep shows no impossible hours.
- One spot-check renders identically across two device timezones.

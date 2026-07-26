/**
 * backfillFavoriteCounts.mjs — ONE-TIME backfill. Delete this file once it has
 * been run against production.
 *
 * Existing favorite docs predate the `favoriteCount` field, so every explore
 * item would read as 0 until its next favorite/unfavorite event. This walks
 * every member's favorites subcollection, tallies per explore item, and writes
 * the totals onto cohorts/{cohortId}/explore/{itemId}.
 *
 * Members are iterated directly rather than via a collectionGroup query, which
 * keeps this index-free (same pattern as pushNotifications.ts) and is fine at
 * cohort scale. Favorite docs are keyed by exploreId, so the doc id is the key.
 *
 * Run from the `functions` directory so firebase-admin resolves:
 *
 *   # dry run first — prints what it would write, changes nothing
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     COHORT_ID=default node scripts/backfillFavoriteCounts.mjs --dry-run
 *
 *   # then for real
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     COHORT_ID=default node scripts/backfillFavoriteCounts.mjs
 *
 * On PowerShell, set the env vars first:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\service-account.json"
 *   $env:COHORT_ID = "default"
 *   node scripts/backfillFavoriteCounts.mjs --dry-run
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const COHORT_ID = process.env.COHORT_ID;
const DRY_RUN = process.argv.includes("--dry-run");

if (!COHORT_ID) {
  console.error("Set COHORT_ID (the Firestore doc id under cohorts/).");
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function main() {
  console.log(`Backfilling favoriteCount for cohort "${COHORT_ID}"${DRY_RUN ? " (DRY RUN)" : ""}...`);

  // ── Tally favorites across every member ───────────────────────────────────
  const membersSnap = await db.collection(`cohorts/${COHORT_ID}/members`).get();
  const counts = new Map(); // exploreId → count

  for (const member of membersSnap.docs) {
    const favSnap = await member.ref.collection("favorites").get();
    for (const fav of favSnap.docs) {
      counts.set(fav.id, (counts.get(fav.id) || 0) + 1);
    }
  }

  console.log(`Scanned ${membersSnap.size} members, found favorites on ${counts.size} items.`);

  // ── Write the total onto every explore item ───────────────────────────────
  // Items with zero favorites get an explicit 0 so the field exists everywhere.
  const exploreSnap = await db.collection(`cohorts/${COHORT_ID}/explore`).get();
  const exploreIds = new Set(exploreSnap.docs.map((d) => d.id));

  let written = 0;
  let unchanged = 0;
  const BATCH_SIZE = 400;
  let batch = db.batch();
  let pending = 0;

  for (const item of exploreSnap.docs) {
    const count = counts.get(item.id) || 0;
    if (item.data().favoriteCount === count) {
      unchanged += 1;
      continue;
    }
    if (!DRY_RUN) {
      batch.update(item.ref, { favoriteCount: count });
      pending += 1;
      if (pending >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
    written += 1;
  }

  if (!DRY_RUN && pending > 0) await batch.commit();

  // Favorites can point at items an admin has since deleted. Nothing to write
  // for those — just report them so the count is explainable.
  const orphans = [...counts.keys()].filter((id) => !exploreIds.has(id));

  console.log(`${DRY_RUN ? "Would write" : "Wrote"} favoriteCount on ${written} items.`);
  console.log(`${unchanged} items already correct.`);
  if (orphans.length > 0) {
    console.log(`${orphans.length} favorites point at deleted explore items (ignored):`, orphans);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });

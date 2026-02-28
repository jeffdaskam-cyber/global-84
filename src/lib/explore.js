import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db, COHORT_ID } from "./firebase";

export function exploreCol() {
  return collection(db, "cohorts", COHORT_ID, "explore");
}

export function exploreDoc(id) {
  return doc(db, "cohorts", COHORT_ID, "explore", id);
}

export function subscribeExplore({ city, category }, cb) {
  // Filter by city and category in Firestore; type filtering is done client-side
  // in the PlaceList component for instant pill-switching without extra queries.
  const constraints = [
    where("status", "==", "active"),
    orderBy("name", "asc"),
    limit(250),
  ];
  if (city)     constraints.unshift(where("city", "==", city));
  if (category) constraints.unshift(where("category", "==", category));

  const q = query(exploreCol(), ...constraints);

  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function archiveExploreItem(id) {
  await updateDoc(exploreDoc(id), { status: "archived" });
}

// Permanently deletes a single explore item. Admin-only — enforced by Firestore rules.
export async function deleteExploreItem(id) {
  await deleteDoc(exploreDoc(id));
}

function normalizeCity(s) {
  const v = (s || "").trim();
  if (!v) return "";
  const low = v.toLowerCase();
  if (low === "singapore") return "Singapore";
  if (low === "hcmc" || low === "ho chi minh" || low === "ho chi minh city") return "Ho Chi Minh City";
  return v;
}

function normalizeType(s) {
  const v = (s || "").trim().toLowerCase();
  if (!v) return "";
  // Dining
  if (v === "restaurant") return "Restaurant";
  if (v === "coffee" || v === "cafe") return "Coffee";
  if (v === "bar" || v === "drinks" || v === "pub") return "Bar";
  if (v === "rooftop bar" || v === "rooftop") return "Rooftop Bar";
  if (v === "hawker center" || v === "hawker centre" || v === "hawker" || v === "food court") return "Hawker Center";
  // Activity
  if (v === "museum" || v === "gallery") return "Museum";
  if (v === "temple" || v === "church" || v === "mosque" || v === "pagoda") return "Temple";
  if (v === "market" || v === "bazaar" || v === "night market") return "Market";
  if (v === "shopping" || v === "mall") return "Shopping";
  if (v === "spa" || v === "wellness" || v === "massage") return "Spa";
  if (v === "nightlife" || v === "club" || v === "lounge") return "Nightlife";
  if (v === "nature" || v === "park" || v === "garden") return "Nature";
  if (v === "tour" || v === "experience") return "Tour";
  if (v === "adventure" || v === "sport" || v === "activity") return "Adventure";
  // Return title-cased original if no match
  return s.trim().replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function normalizePrice(s) {
  const v = (s || "").trim();
  if (!v) return "";
  if (v === "$" || v === "$$" || v === "$$$") return v;
  return "";
}

function parseTags(s) {
  const raw = (s || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeName(name) {
  return (name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function makeExploreStableKey({ city, type, name }) {
  return `${city}::${type}::${normalizeName(name)}`;
}

function normalizeCategory(s) {
  const v = (s || "").trim().toLowerCase();
  if (v === "dining") return "dining";
  if (v === "activity" || v === "activities") return "activity";
  // Infer from type if category is missing
  return "";
}

function inferCategory(type) {
  const DINING_TYPES = ["restaurant", "coffee", "bar", "rooftop bar", "hawker center"];
  return DINING_TYPES.includes((type || "").toLowerCase()) ? "dining" : "activity";
}

function cleanExploreRow(r) {
  const city = normalizeCity(r.city);
  const type = normalizeType(r.type);
  const name = (r.name || "").trim();
  const rawCategory = normalizeCategory(r.category);
  // If category column is missing or blank, infer it from type
  const category = rawCategory || inferCategory(type);

  return {
    valid: !!(city && type && name),
    city,
    type,
    category,
    name,
    neighborhood: (r.neighborhood || "").trim(),
    hours: (r.hours || "").trim(),
    price: normalizePrice(r.price),
    tags: parseTags(r.tags),
    googleMapsUrl: (r.googlemapsurl || r.googleMapsUrl || "").trim(),
    reservationUrl: (r.reservationurl || r.reservationUrl || "").trim(),
    notes: (r.notes || "").trim(),
    recommendedBy: (r.recommendedby || r.recommendedBy || "").trim(),
  };
}

export function getExploreImportPreview(rows, previewLimit = 10) {
  const preparedRows = rows.map((row, index) => ({
    rowNumber: index + 1,
    ...cleanExploreRow(row),
  }));
  const validRows = preparedRows.filter((row) => row.valid);

  return {
    previewRows: preparedRows.slice(0, previewLimit),
    validRows,
    importableCount: validRows.length,
    skippedCount: preparedRows.length - validRows.length,
  };
}

export async function importExploreItems(rows, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");

  if (!COHORT_ID || !String(COHORT_ID).trim()) {
    throw new Error("Import blocked: missing VITE_COHORT_ID.");
  }

  const cohortId = String(COHORT_ID).trim();
  const adminRef = doc(db, "cohorts", cohortId, "admins", user.uid);
  const adminSnap = await getDoc(adminRef);
  const adminEnabled = !!adminSnap.exists() && adminSnap.data()?.enabled === true;

  if (!adminEnabled) {
    throw new Error(`Import blocked: user ${user.uid} is not an enabled admin for cohort ${cohortId}.`);
  }

  const exploreColRef = collection(db, "cohorts", cohortId, "explore");
  const preview = getExploreImportPreview(rows);
  if (preview.validRows.length === 0) throw new Error("No valid rows found (need city, type, name).");

  // Fetch ALL existing docs (not just active) so we can match and clean up
  // legacy duplicates that predate the stableKey field.
  const existingSnap = await getDocs(exploreColRef);

  // Build a map of stableKey → array of doc IDs.
  // We keep arrays because duplicates may exist under the same key.
  const existingByKey = new Map();
  existingSnap.forEach((existingDoc) => {
    const data = existingDoc.data();
    if (!data?.city || !data?.type || !data?.name) return;
    const key = makeExploreStableKey(data);
    if (!existingByKey.has(key)) existingByKey.set(key, []);
    existingByKey.get(key).push(existingDoc.id);
  });

  // Dedupe incoming CSV rows by stableKey (last row wins if CSV has its own dupes)
  const dedupedByKey = new Map();
  for (const row of preview.validRows) {
    dedupedByKey.set(makeExploreStableKey(row), row);
  }

  // For each incoming key: keep the first existing doc ID to update, delete the rest
  const upsertRows = [];
  const idsToDelete = [];

  for (const [stableKey, row] of dedupedByKey.entries()) {
    const existingIds = existingByKey.get(stableKey) || [];
    const [keepId, ...extraIds] = existingIds;
    upsertRows.push({ stableKey, row, existingId: keepId || null });
    idsToDelete.push(...extraIds);
  }

  // Delete the surplus duplicate docs first
  let removedDuplicates = 0;
  const DELETE_BATCH_SIZE = 500;
  for (let i = 0; i < idsToDelete.length; i += DELETE_BATCH_SIZE) {
    const chunk = idsToDelete.slice(i, i + DELETE_BATCH_SIZE);
    const batch = writeBatch(db);
    for (const id of chunk) {
      batch.delete(doc(exploreColRef, id));
    }
    await batch.commit();
    removedDuplicates += chunk.length;
  }

  // Upsert the canonical doc for each place
  const BATCH_SIZE = 10;
  let imported = 0;
  let updated = 0;

  for (let i = 0; i < upsertRows.length; i += BATCH_SIZE) {
    const chunk = upsertRows.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const upsert of chunk) {
      const ref = upsert.existingId ? doc(exploreColRef, upsert.existingId) : doc(exploreColRef);

      batch.set(
        ref,
        {
          city: upsert.row.city,
          type: upsert.row.type,
          category: upsert.row.category,
          name: upsert.row.name,
          neighborhood: upsert.row.neighborhood,
          hours: upsert.row.hours,
          price: upsert.row.price,
          tags: upsert.row.tags,
          googleMapsUrl: upsert.row.googleMapsUrl,
          reservationUrl: upsert.row.reservationUrl,
          notes: upsert.row.notes,
          recommendedBy: upsert.row.recommendedBy,
          stableKey: upsert.stableKey,  // written here so future imports always match
          status: "active",
          updatedAt: serverTimestamp(),
          updatedByUid: user.uid,
        },
        { merge: true }
      );

      if (upsert.existingId) {
        updated += 1;
      } else {
        imported += 1;
        batch.set(
          ref,
          {
            createdAt: serverTimestamp(),
            createdByUid: user.uid,
            createdByName: user.displayName || "Admin",
          },
          { merge: true }
        );
      }
    }

    await batch.commit();
  }

  // Write import audit log
  const logRef = doc(collection(db, "cohorts", cohortId, "importLogs"));
  await writeBatch(db)
    .set(logRef, {
      timestamp: serverTimestamp(),
      adminUid: user.uid,
      fileName: options.fileName || "CSV import",
      importedCount: imported,
      updatedCount: updated,
      skippedCount: preview.skippedCount,
      removedDuplicates,
    })
    .commit();

  return { imported, updated, skipped: preview.skippedCount, removedDuplicates };
}

// Standalone cleanup: finds and removes duplicate docs in Firestore without
// requiring a CSV upload. Keeps the doc with the earliest createdAt per key.
export async function cleanupExploreDuplicates() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");

  const cohortId = String(COHORT_ID).trim();
  const adminRef = doc(db, "cohorts", cohortId, "admins", user.uid);
  const adminSnap = await getDoc(adminRef);
  const adminEnabled = !!adminSnap.exists() && adminSnap.data()?.enabled === true;
  if (!adminEnabled) throw new Error("Admin access required.");

  const exploreColRef = collection(db, "cohorts", cohortId, "explore");
  const snap = await getDocs(exploreColRef);

  // Group all docs by their stableKey (computed from city+type+name)
  const byKey = new Map();
  snap.forEach((d) => {
    const data = d.data();
    if (!data?.city || !data?.type || !data?.name) return;
    const key = makeExploreStableKey(data);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ id: d.id, createdAt: data.createdAt?.toMillis?.() ?? 0 });
  });

  // For each key with more than one doc, keep the oldest and delete the rest
  const idsToDelete = [];
  for (const docs of byKey.values()) {
    if (docs.length <= 1) continue;
    const sorted = [...docs].sort((a, b) => a.createdAt - b.createdAt);
    const [, ...extras] = sorted;
    idsToDelete.push(...extras.map((d) => d.id));
  }

  let removedDuplicates = 0;
  const BATCH_SIZE = 500;
  for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
    const chunk = idsToDelete.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const id of chunk) batch.delete(doc(exploreColRef, id));
    await batch.commit();
    removedDuplicates += chunk.length;
  }

  return { removedDuplicates };
}

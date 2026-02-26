import {
  collection,
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

export function subscribeExplore({ city, type }, cb) {
  let q = query(exploreCol(), where("status", "==", "active"), orderBy("name", "asc"), limit(250));

  if (city) q = query(exploreCol(), where("status", "==", "active"), where("city", "==", city), orderBy("name", "asc"), limit(250));
  if (city && type) q = query(exploreCol(), where("status", "==", "active"), where("city", "==", city), where("type", "==", type), orderBy("name", "asc"), limit(250));
  if (!city && type) q = query(exploreCol(), where("status", "==", "active"), where("type", "==", type), orderBy("name", "asc"), limit(250));

  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function archiveExploreItem(id) {
  await updateDoc(exploreDoc(id), { status: "archived" });
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
  if (["restaurant", "activity", "bar", "cafe"].includes(v)) return v;
  if (v === "coffee") return "cafe";
  if (v === "drinks") return "bar";
  return v;
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

function cleanExploreRow(r) {
  const city = normalizeCity(r.city);
  const type = normalizeType(r.type);
  const name = (r.name || "").trim();

  return {
    valid: !!(city && type && name),
    city,
    type,
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

  const existingSnap = await getDocs(exploreColRef);
  const existingByKey = new Map();
  existingSnap.forEach((existingDoc) => {
    const data = existingDoc.data();
    if (!data?.city || !data?.type || !data?.name) return;
    existingByKey.set(makeExploreStableKey(data), existingDoc.id);
  });

  const dedupedByKey = new Map();
  for (const row of preview.validRows) {
    dedupedByKey.set(makeExploreStableKey(row), row);
  }

  const upsertRows = Array.from(dedupedByKey.entries()).map(([stableKey, row]) => ({
    stableKey,
    row,
    existingId: existingByKey.get(stableKey) || null,
  }));

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
          name: upsert.row.name,
          neighborhood: upsert.row.neighborhood,
          hours: upsert.row.hours,
          price: upsert.row.price,
          tags: upsert.row.tags,
          googleMapsUrl: upsert.row.googleMapsUrl,
          reservationUrl: upsert.row.reservationUrl,
          notes: upsert.row.notes,
          recommendedBy: upsert.row.recommendedBy,
          stableKey: upsert.stableKey,
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

  const logRef = doc(collection(db, "cohorts", cohortId, "importLogs"));
  await writeBatch(db)
    .set(logRef, {
      timestamp: serverTimestamp(),
      adminUid: user.uid,
      fileName: options.fileName || "CSV import",
      importedCount: imported,
      updatedCount: updated,
      skippedCount: preview.skippedCount,
    })
    .commit();

  return { imported, updated, skipped: preview.skippedCount };
}

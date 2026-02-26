import {
  addDoc,
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
import { getIdTokenResult } from "firebase/auth";

export function exploreCol() {
  return collection(db, "cohorts", COHORT_ID, "explore");
}

export function exploreDoc(id) {
  return doc(db, "cohorts", COHORT_ID, "explore", id);
}

export function subscribeExplore({ city, type }, cb) {
  // Start simple: filter by city and/or type, always status=active
  // If you add more filters later (tags, price), we can do client-side filtering to avoid indexes.
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
  // Allow a few friendly aliases:
  if (v === "coffee") return "cafe";
  if (v === "drinks") return "bar";
  return v; // if unknown, still store; you can filter later
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

/**
 * Import a list of explore items into Firestore using batch writes.
 * rows: array of raw row objects from CSV with headers matching the sheet.
 */
export async function importExploreItems(rows) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  const u = user;

  // 🔎 ADMIN PREFLIGHT CHECK
  const adminRef = doc(db, "cohorts", COHORT_ID, "admins", u.uid);
  const adminSnap = await getDoc(adminRef);
 console.warn("=== ADMIN PREFLIGHT ===");
 console.warn("Admin doc path:", adminRef.path);
 console.warn("Exists:", adminSnap.exists());
 const data = adminSnap.data();
 console.warn("Admin data:", data);
 console.warn("enabled value/type:", data?.enabled, typeof data?.enabled);
 console.warn("=== END ADMIN PREFLIGHT ===");

  // 🔍 AUTH / PATH DEBUG
  console.warn("=== FIRESTORE IMPORT DEBUG ===");
  console.warn("COHORT_ID:", COHORT_ID);
  console.warn("Project ID:", db.app.options.projectId);
  console.warn("Signed in:", !!user);
  console.warn("UID:", user?.uid);
  console.warn("Email:", user?.email);

  const token = await user.getIdTokenResult(true);
  console.warn("token.email:", token?.claims?.email);
  console.warn("sign_in_provider:", token?.claims?.firebase?.sign_in_provider);

  const exploreColRef = collection(db, "cohorts", COHORT_ID, "explore");
  console.warn("Writing to path:", exploreColRef.path);
  console.warn("=== END FIRESTORE IMPORT DEBUG ===");

  // Validate minimal fields; skip empty rows
  const cleaned = rows
    .map((r) => {
      const city = normalizeCity(r.city);
      const type = normalizeType(r.type);
      const name = (r.name || "").trim();
      if (!city || !type || !name) return null;

      return {
        city,
        type,
        name,
        neighborhood: (r.neighborhood || "").trim(),
        price: normalizePrice(r.price),
        tags: parseTags(r.tags),
        googleMapsUrl: (r.googlemapsurl || r.googleMapsUrl || "").trim(),
        reservationUrl: (r.reservationurl || r.reservationUrl || "").trim(),
        notes: (r.notes || "").trim(),
        recommendedBy: (r.recommendedby || r.recommendedBy || "").trim(),
      };
    })
    .filter(Boolean);

  if (cleaned.length === 0) throw new Error("No valid rows found (need city, type, name).");

  // Firestore batch limit: 500 ops per batch
  const BATCH_SIZE = 400;
  let imported = 0;

  for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
    const chunk = cleaned.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const item of chunk) {
      const ref = doc(exploreColRef); // auto id
      batch.set(ref, {
        ...item,
        status: "active",
        createdAt: serverTimestamp(),
        createdByUid: user.uid,
        createdByName: user.displayName || "Admin",
      });
    }

    await batch.commit();
    imported += chunk.length;
  }

  return { imported, skipped: rows.length - cleaned.length };
}
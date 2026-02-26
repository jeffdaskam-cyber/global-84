import {
  collection,
  doc,
  getDoc,  
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

/**
 * Import a list of explore items into Firestore using batch writes.
 * rows: array of raw row objects from CSV with headers matching the sheet.
 */
export async function importExploreItems(rows) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  const u = user;

  if (!COHORT_ID || !String(COHORT_ID).trim()) {
    throw new Error("Import blocked: missing VITE_COHORT_ID.");
  }

  const cohortId = String(COHORT_ID).trim();

  // 🔎 ADMIN PREFLIGHT CHECK
  const adminRef = doc(db, "cohorts", cohortId, "admins", u.uid);
  const adminSnap = await getDoc(adminRef);
  const data = adminSnap.data();
  const adminEnabled = !!adminSnap.exists() && data?.enabled === true;

  console.info("[explore import] admin preflight", {
    path: adminRef.path,
    exists: adminSnap.exists(),
    enabled: data?.enabled,
    enabledType: typeof data?.enabled,
  });

  if (!adminEnabled) {
    throw new Error(`Import blocked: user ${u.uid} is not an enabled admin for cohort ${cohortId}.`);
  }

  // 🔍 AUTH / PATH DEBUG
  console.info("[explore import] auth context", {
    cohortId,
    projectId: db.app.options.projectId,
    signedIn: !!user,
    uid: user?.uid,
    email: user?.email,
  });

  const token = await user.getIdTokenResult(true);
  console.info("[explore import] token context", {
    tokenEmail: token?.claims?.email,
    signInProvider: token?.claims?.firebase?.sign_in_provider,
  });

  const exploreColRef = collection(db, "cohorts", cohortId, "explore");
  console.info("[explore import] writing path", { path: exploreColRef.path });

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

  // Keep chunks small to avoid Firestore security-rules doc-access limits
  // during batched writes when rules evaluate admin checks.
  const BATCH_SIZE = 10;
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

    try {
      await batch.commit();
    } catch (error) {
      console.error("[explore import] batch commit failed", {
        code: error?.code,
        message: error?.message,
        cohortId,
        path: exploreColRef.path,
        uid: user?.uid,
        email: user?.email,
        chunkStart: i,
        chunkSize: chunk.length,
      });
      if (error?.code === "permission-denied") {
        throw new Error(
          `Permission denied writing ${exploreColRef.path}. Confirm firestore.rules are deployed to project ${db.app.options.projectId} and allow create for isAdmin(${cohortId}).`
        );
      }
      throw error;
    }
    imported += chunk.length;
  }

  return { imported, skipped: rows.length - cleaned.length };
}

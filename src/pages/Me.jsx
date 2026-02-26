import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import { signOutUser } from "../lib/auth";
import { subscribeMember, updateMyProfile } from "../lib/members";

const CITIES = ["Singapore", "Ho Chi Minh City"];

export default function Me() {
  const [user, setUser] = useState(null);

  const [member, setMember] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [defaultCity, setDefaultCity] = useState("Singapore");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // React to auth state (fixes refresh timing issue)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => unsub();
  }, []);

  // Subscribe to member doc once user is available
  useEffect(() => {
    if (!user?.uid) return;

    const unsub = subscribeMember(user.uid, (m) => {
      setMember(m);
      setDisplayName(m?.displayName || user.displayName || "Member");
      setDefaultCity(m?.defaultCity || "Singapore");
    });

    return () => unsub();
  }, [user?.uid]);

  const canSave = useMemo(() => {
    const dn = displayName.trim();
    return dn.length > 0 && CITIES.includes(defaultCity);
  }, [displayName, defaultCity]);

  async function handleSave() {
    setErr("");
    setMsg("");
    if (!user?.uid || !canSave) return;

    setSaving(true);
    try {
      await updateMyProfile(user.uid, { displayName, defaultCity });
      setMsg("Saved.");
    } catch (e) {
      setErr(e?.message || "Could not save profile.");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 2000);
    }
  }

  // Optional: simple loading state while auth hydrates
  if (!user) {
    return (
      <div className="p-5">
        <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5">
          <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">
            Loading profile…
          </div>
          <div className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark">
            (This can take a moment after refresh.)
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      <div className="text-xl font-semibold text-ink-main dark:text-ink-onDark">
        Me <span className="text-du-gold">•</span>
      </div>
      <div className="h-1 w-10 rounded-full bg-du-gold" />

      {/* Account */}
      <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5">
        <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">Account</div>
        <div className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark">
          <div>{member?.email || user?.email || "—"}</div>
          <div className="mt-1 text-xs text-ink-muted dark:text-ink-subOnDark">
            UID: {user?.uid || "—"}
          </div>
        </div>
      </div>

      {/* Profile */}
      <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5 space-y-4">
        <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">Profile</div>

        <label className="block">
          <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">
            Display name
          </div>
          <input
            className="w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </label>

        <label className="block">
          <div className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark mb-1">
            Default city
          </div>
          <select
            className="w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold"
            value={defaultCity}
            onChange={(e) => setDefaultCity(e.target.value)}
          >
            {CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        {err ? <div className="text-sm text-du-crimson">{err}</div> : null}
        {msg ? <div className="text-sm text-ink-sub dark:text-ink-subOnDark">{msg}</div> : null}

        <div className="flex gap-3">
          <button
            className="w-full rounded-lg bg-du-crimson text-white py-3 text-sm font-semibold hover:bg-du-crimsonDark transition disabled:opacity-40"
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            Save
          </button>

          <button
            className="w-full rounded-lg border border-du-crimson text-du-crimson py-3 text-sm font-semibold hover:bg-du-crimsonSoft transition disabled:opacity-40"
            onClick={signOutUser}
            disabled={saving}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Role */}
      <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5">
        <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">Role</div>
        <div className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark">
          {member?.role || "member"}
        </div>
      </div>
    </div>
  );
}
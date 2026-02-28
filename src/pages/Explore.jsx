import { useEffect, useMemo, useState } from "react";
import { auth } from "../lib/firebase";
import { subscribeMember } from "../lib/members";
import { deleteExploreItem, subscribeExplore } from "../lib/explore";

const CITIES = ["Singapore", "Ho Chi Minh City"];
const TYPES = ["all", "restaurant", "activity", "bar", "cafe"];

function labelType(t) {
  if (t === "all") return "All";
  return t[0].toUpperCase() + t.slice(1);
}

export default function Explore({ isAdmin }) {
  const user = auth.currentUser;

  const [member, setMember] = useState(null);
  const [city, setCity] = useState("Singapore");
  const [type, setType] = useState("all");

  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  // member default city
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeMember(user.uid, setMember);
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (member?.defaultCity) setCity(member.defaultCity);
  }, [member?.defaultCity]);

  // Firestore subscription (city + optional type)
  useEffect(() => {
    const unsub = subscribeExplore(
      { city, type: type === "all" ? "" : type },
      setItems
    );
    return () => unsub();
  }, [city, type]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((it) => {
      const hay = [
        it.name,
        it.neighborhood,
        it.notes,
        it.recommendedBy,
        ...(it.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [items, search]);

  async function handleDelete(id, name) {
    if (!window.confirm(`Remove "${name}" from Explore? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await deleteExploreItem(id);
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-5 space-y-4">
      <div>
        <div className="text-xl font-semibold text-ink-main dark:text-ink-onDark">
          Explore <span className="text-du-gold">•</span>
        </div>
        <div className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark">
          Curated places and activities for the cohort.
        </div>
      </div>

      {/* City */}
      <div className="flex gap-2">
        {CITIES.map((c) => (
          <button
            key={c}
            onClick={() => setCity(c)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              city === c
                ? "bg-du-crimson text-white"
                : "bg-surface-border/60 text-ink-sub hover:bg-surface-border dark:bg-surface-darkBorder dark:text-ink-subOnDark"
            }`}
          >
            {c === "Ho Chi Minh City" ? "HCMC" : "Singapore"}
          </button>
        ))}
      </div>

      {/* Type + search */}
      <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                type === t
                  ? "bg-du-crimson text-white"
                  : "bg-surface-border/60 text-ink-sub hover:bg-surface-border dark:bg-surface-darkBorder dark:text-ink-subOnDark"
              }`}
            >
              {labelType(t)}
            </button>
          ))}
        </div>

        <input
          className="w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold"
          placeholder="Search name, tags, notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5">
          <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">
            No results
          </div>
          <div className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark">
            If you're an admin, import a CSV to populate Explore.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((it) => (
            <div
              key={it.id}
              className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">
                    {it.name}
                  </div>
                  <div className="mt-1 text-xs text-ink-sub dark:text-ink-subOnDark">
                    {it.type ? labelType(it.type) : "—"} •{" "}
                    {it.neighborhood || "—"}{" "}
                    {it.price ? `• ${it.price}` : ""}
                  </div>
                  {it.tags?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {it.tags.slice(0, 8).map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-surface-border/60 dark:bg-surface-darkBorder px-2 py-1 text-[10px] font-bold text-ink-sub dark:text-ink-subOnDark"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  {it.googleMapsUrl ? (
                    <a
                      className="text-xs font-semibold text-du-crimson hover:underline"
                      href={it.googleMapsUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Map
                    </a>
                  ) : null}
                  {it.reservationUrl ? (
                    <a
                      className="text-xs font-semibold text-du-crimson hover:underline"
                      href={it.reservationUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Reserve
                    </a>
                  ) : null}

                  {/* Admin-only delete button */}
                  {isAdmin ? (
                    <button
                      onClick={() => handleDelete(it.id, it.name)}
                      disabled={deletingId === it.id}
                      className="text-xs font-semibold text-ink-muted dark:text-ink-subOnDark hover:text-du-crimson dark:hover:text-du-crimson transition disabled:opacity-40"
                      title="Remove this place"
                    >
                      {deletingId === it.id ? "Removing…" : "Remove"}
                    </button>
                  ) : null}
                </div>
              </div>

              {it.notes ? (
                <div className="mt-3 text-sm text-ink-sub dark:text-ink-subOnDark whitespace-pre-wrap">
                  {it.notes}
                </div>
              ) : null}

              {it.recommendedBy ? (
                <div className="mt-2 text-xs text-ink-muted dark:text-ink-subOnDark">
                  Recommended by {it.recommendedBy}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

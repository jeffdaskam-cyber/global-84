import { useEffect, useState } from "react";
import { subscribeAnnouncements } from "../lib/announcements";
import AnnouncementCard from "../components/features/AnnouncementCard.jsx";
import AnnouncementEditorModal from "../components/features/AnnouncementEditorModal.jsx";
import { subscribeIsAdmin } from "../lib/admins";

export default function Home() {
  const [items, setItems] = useState([]);
  const [openNew, setOpenNew] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Admin allowlist subscription (keeps UI aligned with Firestore rules)
  useEffect(() => {
    const unsub = subscribeIsAdmin(setIsAdmin);
    return () => unsub();
  }, []);

  // Announcements feed subscription
  useEffect(() => {
    const unsub = subscribeAnnouncements(setItems);
    return () => unsub();
  }, []);

  return (
    <div>
      <div className="bg-gradient-to-b from-du-crimson to-du-crimsonDark text-white px-6 pt-8 pb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Global 84</h1>
            <p className="text-sm opacity-90">Cohort Travel Hub</p>
            <div className="mt-4 h-1 w-12 rounded-full bg-du-gold" />
          </div>

          {isAdmin ? (
            <button
              className="rounded-lg bg-du-gold text-ink-main px-4 py-2 text-sm font-semibold hover:opacity-90 transition"
              onClick={() => setOpenNew(true)}
            >
              + Announce
            </button>
          ) : null}
        </div>
      </div>

      <div className="p-6 space-y-4 bg-surface-light dark:bg-surface-dark min-h-[calc(100vh-160px)]">
        <div>
          <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">
            Announcements
          </div>
          <div className="text-xs text-ink-sub dark:text-ink-subOnDark">
            Pinned items appear first.
          </div>
        </div>

        {items.length === 0 ? (
          <div className="bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder rounded-xl shadow-card p-4">
            <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark">
              No announcements yet
            </div>
            <div className="mt-2 text-sm text-ink-sub dark:text-ink-subOnDark">
              {isAdmin
                ? "Post the first update for the cohort."
                : "Admins will post updates here."}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((a) => (
              <AnnouncementCard key={a.id} item={a} isAdmin={isAdmin} />
            ))}
          </div>
        )}
      </div>

      <AnnouncementEditorModal open={openNew} onClose={() => setOpenNew(false)} />
    </div>
  );
}
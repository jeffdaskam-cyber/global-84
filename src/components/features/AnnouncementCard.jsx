import { useState } from "react";
import { archiveAnnouncement, setAnnouncementPinned } from "../../lib/announcements";

export default function AnnouncementCard({ item, isAdmin }) {
  const [saving, setSaving] = useState(false);

  async function togglePin() {
    setSaving(true);
    try {
      await setAnnouncementPinned(item.id, !item.pinned);
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    setSaving(true);
    try {
      await archiveAnnouncement(item.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder rounded-xl shadow-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-ink-main dark:text-ink-onDark truncate">
              {item.title}
            </h3>
            {item.pinned ? (
              <span className="rounded-full bg-du-goldSoft px-2 py-1 text-[10px] font-bold text-ink-main">
                PINNED
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-ink-muted dark:text-ink-subOnDark">
            by {item.createdByName || "—"}
          </div>
        </div>

        {isAdmin ? (
          <div className="flex gap-2 shrink-0">
            <button
              className="rounded-lg border border-surface-border dark:border-surface-darkBorder px-3 py-2 text-xs font-semibold text-ink-sub dark:text-ink-subOnDark hover:bg-surface-border/40 dark:hover:bg-surface-darkBorder/60 transition disabled:opacity-40"
              onClick={togglePin}
              disabled={saving}
            >
              {item.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              className="rounded-lg border border-du-crimson px-3 py-2 text-xs font-semibold text-du-crimson hover:bg-du-crimsonSoft transition disabled:opacity-40"
              onClick={archive}
              disabled={saving}
            >
              Archive
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-3 text-sm text-ink-sub dark:text-ink-subOnDark whitespace-pre-wrap">
        {item.body}
      </div>
    </div>
  );
}
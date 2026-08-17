import { useState } from "react";
import { archiveAnnouncement, setAnnouncementPinned } from "../../lib/announcements";

// "40 min ago" / "3 hours ago" / "2 days ago" from a Firestore Timestamp.
// Falls back to empty while a serverTimestamp write is still pending (null).
function formatAgo(ts) {
  const ms = ts?.toMillis?.() ?? (ts ? new Date(ts).getTime() : NaN);
  if (Number.isNaN(ms)) return "";
  const diff = Date.now() - ms;
  if (diff < 60 * 1000) return "just now";
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const d = Math.floor(hr / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export default function AnnouncementCard({ item, isAdmin }) {
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

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

  const ago = formatAgo(item.createdAt);

  return (
    <div className="relative bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder rounded-xl shadow-card p-4">
      {/* Unread dot for pinned items */}
      {item.pinned ? (
        <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-du-crimson" />
      ) : null}

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
            {ago ? <span> · {ago}</span> : null}
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

      <div
        className="mt-3 text-sm text-ink-sub dark:text-ink-subOnDark whitespace-pre-wrap"
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
        }
      >
        {item.body}
      </div>
      {/* Only offer the toggle when the body is long enough to plausibly clamp. */}
      {(item.body || "").length > 120 ? (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-semibold"
          style={{ color: "#c4862a" }}
        >
          {expanded ? "Read less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}

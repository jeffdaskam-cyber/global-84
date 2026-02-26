import { useEffect, useMemo, useState } from "react";
import { auth } from "../../lib/firebase";
import { fmtDateTime } from "../../lib/format";
import { setRsvp, subscribeRsvps } from "../../lib/events";

export default function EventCard({ event, onEdit }) {
  const me = auth.currentUser;

  const [rsvps, setRsvpsState] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = subscribeRsvps(event.id, setRsvpsState);
    return () => unsub();
  }, [event.id]);

  const counts = useMemo(() => {
    let going = 0;
    let interested = 0;
    for (const r of rsvps) {
      if (r.status === "going") going++;
      if (r.status === "interested") interested++;
    }
    return { going, interested };
  }, [rsvps]);

  const myStatus = useMemo(() => {
    if (!me) return null;
    return rsvps.find((r) => r.uid === me.uid)?.status || null;
  }, [rsvps, me]);

  async function handle(status) {
    setSaving(true);
    try {
      await setRsvp(event.id, status);
    } finally {
      setSaving(false);
    }
  }

  const chipBase =
    "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold transition";
  const chipOff =
    "bg-surface-border/60 text-ink-sub hover:bg-surface-border dark:bg-surface-darkBorder dark:text-ink-subOnDark";
  const chipOn = "bg-du-crimson text-white";
  const disabled = saving ? "opacity-50 cursor-not-allowed" : "";

  return (
    <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark truncate">
            {event.title}
          </div>
          <div className="mt-1 text-xs text-ink-sub dark:text-ink-subOnDark">
            {fmtDateTime(event.startTime)}
          </div>
          <div className="mt-1 text-xs text-ink-sub dark:text-ink-subOnDark truncate">
            {event.locationName}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex gap-2">
            <span className="rounded-full bg-du-goldSoft px-2 py-1 text-[10px] font-bold text-ink-main">
              {counts.going} GOING
            </span>
            <span className="rounded-full bg-surface-border/60 dark:bg-surface-darkBorder px-2 py-1 text-[10px] font-bold text-ink-sub dark:text-ink-subOnDark">
              {counts.interested} INT.
            </span>
          </div>
          <div className="text-[10px] text-ink-muted dark:text-ink-subOnDark">
            by {event.createdByName || "—"}
          </div>
        </div>
      </div>

      {event.description ? (
        <div className="text-sm text-ink-sub dark:text-ink-subOnDark">
          {event.description}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={saving}
          className={`${chipBase} ${myStatus === "going" ? chipOn : chipOff} ${disabled}`}
          onClick={() => handle("going")}
        >
          Going
        </button>
        <button
          disabled={saving}
          className={`${chipBase} ${myStatus === "interested" ? chipOn : chipOff} ${disabled}`}
          onClick={() => handle("interested")}
        >
          Interested
        </button>
        <button
          disabled={saving}
          className={`${chipBase} ${myStatus === "not_going" ? chipOn : chipOff} ${disabled}`}
          onClick={() => handle("not_going")}
        >
          Not going
        </button>
      </div>

      {/* Creator-only action */}
      {me?.uid === event.createdByUid ? (
        <div className="pt-2 flex gap-2">
          <button
            className="rounded-lg border border-surface-border dark:border-surface-darkBorder px-3 py-2 text-xs font-semibold text-ink-sub dark:text-ink-subOnDark hover:bg-surface-border/40 dark:hover:bg-surface-darkBorder/60 transition"
            onClick={() => onEdit?.(event)}
            disabled={saving}
          >
            Edit
          </button>
        </div>
      ) : null}
    </div>
  );
}
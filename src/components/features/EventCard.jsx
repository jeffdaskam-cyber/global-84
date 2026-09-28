import { useEffect, useMemo, useRef, useState } from "react";
import { auth } from "../../lib/firebase";
import { fmtDateTime } from "../../lib/format";
import { setRsvp, eventKind } from "../../lib/events";
import { subscribeEventChat, sendEventMessage, deleteEventMessage } from "../../lib/eventChat";
import { listenerErrorMessage } from "../../lib/subscribe";

// Retry delay for a chat listener that was denied right after joining. See the
// chat effect below.
const CHAT_RETRY_MS = 1500;

function LockIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function formatNames(names) {
  const MAX = 5;
  if (names.length <= MAX) return names.join(", ");
  const shown = names.slice(0, MAX).join(", ");
  const remaining = names.length - MAX;
  return `${shown} …and ${remaining} more`;
}

/**
 * `rsvps` is supplied by the Events page rather than fetched here. Both used to
 * listen to the same RSVP collection — the page to group events into "New for
 * You", the card to render attendee names — which meant every event's RSVPs
 * crossed the wire twice. With the database in a US multi-region that duplicate
 * is a second trans-Pacific query per event, so the page owns the listener and
 * passes results down.
 */
export default function EventCard({ event, rsvps = [], onEdit, isAdmin }) {
  const me = auth.currentUser;
  const isAdhoc = eventKind(event) === "adhoc";

  const [saving, setSaving]           = useState(false);
  const [showChat, setShowChat]       = useState(false);
  const [messages, setMessages]       = useState([]);
  const [chatText, setChatText]       = useState("");
  const [sending, setSending]         = useState(false);
  const [chatError, setChatError]     = useState("");
  const bottomRef                     = useRef(null);

  // Scroll to bottom when messages load or new message arrives
  useEffect(() => {
    if (showChat) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [messages, showChat]);

  const counts = useMemo(() => {
    const goingNames = [];
    const interestedNames = [];
    for (const r of rsvps) {
      const name = r.name || "Member";
      if (r.status === "going") goingNames.push(name);
      else if (r.status === "interested") interestedNames.push(name);
    }
    const byName = (a, b) => a.localeCompare(b);
    goingNames.sort(byName);
    interestedNames.sort(byName);
    return {
      going: goingNames.length,
      interested: interestedNames.length,
      goingNames,
      interestedNames,
    };
  }, [rsvps]);

  const myStatus = useMemo(() => {
    if (!me) return null;
    return rsvps.find((r) => r.uid === me.uid)?.status || null;
  }, [rsvps, me]);

  // Event chats are private to attendees: going/interested can read and post;
  // admins can also read (and delete) for moderation. Mirrors firestore.rules.
  const canPost = myStatus === "going" || myStatus === "interested";
  const canReadChat = canPost || !!isAdmin;

  // Subscribe to chat only while the thread is open *and* the member may read
  // it. Losing access (e.g. switching to Not going) tears the listener down and
  // clears the thread so earlier messages don't linger on screen.
  //
  // Joining races the rules: setRsvp resolves locally (latency compensation)
  // before the server has the RSVP, so a listener attached in that window is
  // denied by the rules' get() on the RSVP. The first permission-denied is
  // therefore retried once after a short delay before any error is shown.
  useEffect(() => {
    if (!canReadChat) setMessages([]);
    if (!showChat || !canReadChat) return;
    setChatError("");

    let unsub = () => {};
    let retryTimer = null;
    let cancelled = false;

    function attach(isRetry) {
      unsub = subscribeEventChat(event.id, setMessages, (err) => {
        if (cancelled) return;
        if (!isRetry && err?.code === "permission-denied") {
          retryTimer = setTimeout(() => {
            if (!cancelled) attach(true);
          }, CHAT_RETRY_MS);
          return;
        }
        setChatError(listenerErrorMessage(err));
      });
    }

    attach(false);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      unsub();
    };
  }, [showChat, canReadChat, event.id]);

  async function handle(status) {
    setSaving(true);
    try {
      await setRsvp(event.id, status);
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    if (!chatText.trim() || sending) return;
    setChatError("");
    setSending(true);
    try {
      await sendEventMessage(event.id, chatText);
      setChatText("");
    } catch (e) {
      setChatError(e?.message || "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleDelete(messageId) {
    if (!window.confirm("Delete this message?")) return;
    try {
      await deleteEventMessage(event.id, messageId);
    } catch (e) {
      console.error("Delete failed:", e);
    }
  }

  const chipBase =
    "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold transition";
  const chipOff =
    "bg-surface-border/60 text-ink-sub hover:bg-surface-border dark:bg-surface-darkBorder dark:text-ink-subOnDark";
  const chipOn = "bg-du-crimson text-white";
  const disabled = saving ? "opacity-50 cursor-not-allowed" : "";

  return (
    <div className="rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder overflow-hidden">
      <div className="p-5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark truncate">
                {event.title}
              </div>
              {isAdhoc ? (
                <span className="shrink-0 rounded-full bg-du-gold/15 text-du-gold px-2 py-0.5 text-[10px] font-semibold uppercase">
                  Ad hoc
                </span>
              ) : null}
            </div>
            {event.startTime ? (
              <div className="mt-1 text-xs text-ink-sub dark:text-ink-subOnDark">
                {fmtDateTime(event.startTime, event.city)}
              </div>
            ) : (
              <div className="mt-1 text-xs text-ink-muted dark:text-ink-subOnDark/70">
                Time TBD
              </div>
            )}
            {event.locationName ? (
              <div className="mt-1 text-xs text-ink-sub dark:text-ink-subOnDark truncate">
                {event.locationName}
              </div>
            ) : null}
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

        {/* Description */}
        {event.description ? (
          <div className="text-sm text-ink-sub dark:text-ink-subOnDark">
            {event.description}
          </div>
        ) : null}

        {/* Attendee names */}
        {(counts.goingNames.length > 0 || counts.interestedNames.length > 0) && (
          <div className="space-y-0.5">
            {counts.goingNames.length > 0 && (
              <p className="text-xs text-ink-sub dark:text-ink-subOnDark">
                <span className="text-du-crimson font-medium">Going: </span>
                {formatNames(counts.goingNames)}
              </p>
            )}
            {counts.interestedNames.length > 0 && (
              <p className="text-xs text-ink-sub dark:text-ink-subOnDark">
                <span className="text-yellow-400 font-medium">Interested: </span>
                {formatNames(counts.interestedNames)}
              </p>
            )}
          </div>
        )}

        {/* RSVP chips */}
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

        {/* Footer row — Edit + Discussion toggle */}
        <div className="pt-1 flex items-center justify-between gap-2">
          {me?.uid === event.createdByUid ? (
            <button
              className="rounded-lg border border-surface-border dark:border-surface-darkBorder px-3 py-2 text-xs font-semibold text-ink-sub dark:text-ink-subOnDark hover:bg-surface-border/40 dark:hover:bg-surface-darkBorder/60 transition"
              onClick={() => onEdit?.(event)}
              disabled={saving}
            >
              Edit
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={() => setShowChat((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              showChat
                ? "bg-du-crimson/10 text-du-crimson dark:bg-du-crimson/20"
                : "text-ink-sub dark:text-ink-subOnDark hover:bg-surface-border/40 dark:hover:bg-surface-darkBorder/60"
            }`}
          >
            <span>💬</span>
            <span>{showChat ? "Hide discussion" : "Discussion"}</span>
            {!canReadChat && (
              <LockIcon className="h-3 w-3" />
            )}
            {messages.length > 0 && !showChat && (
              <span className="ml-0.5 rounded-full bg-du-crimson text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                {messages.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Inline chat thread ── */}
      {showChat && !canReadChat && (
        <div className="border-t border-surface-border dark:border-surface-darkBorder px-4 py-6 flex flex-col items-center gap-2 text-center">
          <LockIcon className="h-5 w-5 text-ink-muted dark:text-ink-subOnDark" />
          <div className="text-xs text-ink-sub dark:text-ink-subOnDark">
            Tap Going or Interested to join the chat.
          </div>
        </div>
      )}

      {showChat && canReadChat && (
        <div className="border-t border-surface-border dark:border-surface-darkBorder">
          {/* Message list */}
          <div className="max-h-64 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-6 text-xs text-ink-sub dark:text-ink-subOnDark">
                No messages yet. {canPost ? "Start the discussion!" : ""}
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.createdByUid === me?.uid;
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}
                  >
                    {/* Avatar */}
                    {!isMe && (
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-du-crimson flex items-center justify-center text-white text-xs font-bold">
                        {(msg.createdByName || "?")[0].toUpperCase()}
                      </div>
                    )}

                    <div className={`flex flex-col gap-0.5 max-w-[75%] ${isMe ? "items-end" : "items-start"}`}>
                      {!isMe && (
                        <span className="text-[10px] text-ink-sub dark:text-ink-subOnDark font-medium px-1">
                          {msg.createdByName}
                        </span>
                      )}
                      <div
                        className={`rounded-2xl px-3 py-2 text-sm leading-snug ${
                          isMe
                            ? "bg-du-crimson text-white rounded-tr-sm"
                            : "bg-surface-border/60 dark:bg-surface-darkBorder text-ink-main dark:text-ink-onDark rounded-tl-sm"
                        }`}
                      >
                        {msg.text}
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(msg.id)}
                          className="text-[10px] text-ink-sub dark:text-ink-subOnDark hover:text-du-crimson transition px-1"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="px-4 pb-4 pt-2 border-t border-surface-border dark:border-surface-darkBorder">
            {canPost ? (
              <>
                <div className="flex gap-2 items-end">
                  <textarea
                    rows={1}
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add to the discussion…"
                    maxLength={1000}
                    disabled={sending}
                    className="flex-1 resize-none rounded-xl border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-crimson disabled:opacity-50"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!chatText.trim() || sending}
                    className="flex-shrink-0 rounded-xl bg-du-crimson text-white px-4 py-2 text-sm font-semibold hover:bg-du-crimsonDark transition disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
                {chatError && (
                  <div className="mt-1 text-xs text-du-crimson">{chatError}</div>
                )}
              </>
            ) : (
              <div className="text-center py-2 text-xs text-ink-sub dark:text-ink-subOnDark">
                RSVP as Going or Interested to join the discussion.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

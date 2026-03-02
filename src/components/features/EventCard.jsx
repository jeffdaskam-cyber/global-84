import { useEffect, useMemo, useRef, useState } from "react";
import { auth } from "../../lib/firebase";
import { fmtDateTime } from "../../lib/format";
import { setRsvp, subscribeRsvps } from "../../lib/events";
import { subscribeEventChat, sendEventMessage, deleteEventMessage } from "../../lib/eventChat";

export default function EventCard({ event, onEdit, isAdmin }) {
  const me = auth.currentUser;

  const [rsvps, setRsvpsState]       = useState([]);
  const [saving, setSaving]           = useState(false);
  const [showChat, setShowChat]       = useState(false);
  const [messages, setMessages]       = useState([]);
  const [chatText, setChatText]       = useState("");
  const [sending, setSending]         = useState(false);
  const [chatError, setChatError]     = useState("");
  const bottomRef                     = useRef(null);

  useEffect(() => {
    const unsub = subscribeRsvps(event.id, setRsvpsState);
    return () => unsub();
  }, [event.id]);

  // Subscribe to chat only when thread is open
  useEffect(() => {
    if (!showChat) return;
    const unsub = subscribeEventChat(event.id, setMessages);
    return () => unsub();
  }, [showChat, event.id]);

  // Scroll to bottom when messages load or new message arrives
  useEffect(() => {
    if (showChat) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [messages, showChat]);

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

  // Can post if RSVP is going or interested
  const canPost = myStatus === "going" || myStatus === "interested";

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

        {/* Description */}
        {event.description ? (
          <div className="text-sm text-ink-sub dark:text-ink-subOnDark">
            {event.description}
          </div>
        ) : null}

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
            {messages.length > 0 && !showChat && (
              <span className="ml-0.5 rounded-full bg-du-crimson text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                {messages.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Inline chat thread ── */}
      {showChat && (
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

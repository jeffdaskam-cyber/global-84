import { useEffect, useRef, useState } from "react";
import { auth } from "../lib/firebase";
import { subscribeCohortChat, sendCohortMessage, deleteCohortMessage } from "../lib/chat";

function formatTime(ts) {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts) {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export default function Chat({ isAdmin }) {
  const user = auth.currentUser;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Subscribe to real-time messages
  useEffect(() => {
    const unsub = subscribeCohortChat(setMessages);
    return () => unsub();
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!text.trim()) return;
    setError("");
    setSending(true);
    try {
      await sendCohortMessage(text);
      setText("");
      inputRef.current?.focus();
    } catch (err) {
      setError(err.message || "Failed to send.");
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

  async function handleDelete(id) {
    if (!window.confirm("Delete this message?")) return;
    setDeletingId(id);
    try {
      await deleteCohortMessage(id);
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  // Group messages by date for date separators
  const grouped = [];
  let lastDate = null;
  for (const msg of messages) {
    const dateStr = formatDate(msg.createdAt);
    if (dateStr && dateStr !== lastDate) {
      grouped.push({ type: "date", label: dateStr, key: `date-${dateStr}` });
      lastDate = dateStr;
    }
    grouped.push({ type: "message", ...msg });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 shrink-0">
        <div className="text-xl font-semibold text-ink-main dark:text-ink-onDark">
          Chat <span className="text-du-gold">•</span>
        </div>
        <div className="mt-1 text-sm text-ink-sub dark:text-ink-subOnDark">
          Global 84 cohort chat
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-5 space-y-1 pb-2">
        {grouped.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-ink-sub dark:text-ink-subOnDark text-center">
              No messages yet. Say hello!
            </div>
          </div>
        ) : (
          grouped.map((item) => {
            if (item.type === "date") {
              return (
                <div key={item.key} className="flex items-center gap-3 py-3">
                  <div className="flex-1 h-px bg-surface-border dark:bg-surface-darkBorder" />
                  <span className="text-[10px] font-semibold text-ink-muted dark:text-ink-subOnDark uppercase tracking-wide">
                    {item.label}
                  </span>
                  <div className="flex-1 h-px bg-surface-border dark:bg-surface-darkBorder" />
                </div>
              );
            }

            const isOwn = item.createdByUid === user?.uid;

            return (
              <div
                key={item.id}
                className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"}`}
              >
                {/* Avatar initial */}
                {!isOwn && (
                  <div className="shrink-0 w-7 h-7 rounded-full bg-du-crimson flex items-center justify-center text-white text-[10px] font-bold mb-1">
                    {(item.createdByName || "?")[0].toUpperCase()}
                  </div>
                )}

                <div className={`group max-w-[75%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                  {/* Sender name (others only) */}
                  {!isOwn && (
                    <div className="text-[10px] font-semibold text-ink-sub dark:text-ink-subOnDark mb-1 ml-1">
                      {item.createdByName || "Member"}
                    </div>
                  )}

                  <div className="flex items-end gap-1.5">
                    {/* Admin delete button — appears on hover */}
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className={`opacity-0 group-hover:opacity-100 transition text-[10px] text-ink-muted dark:text-ink-subOnDark hover:text-du-crimson shrink-0 mb-1 ${isOwn ? "order-first" : "order-last"}`}
                        title="Delete message"
                      >
                        ✕
                      </button>
                    )}

                    {/* Bubble */}
                    <div
                      className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                        isOwn
                          ? "bg-du-crimson text-white rounded-br-sm"
                          : "bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder text-ink-main dark:text-ink-onDark rounded-bl-sm"
                      }`}
                    >
                      {item.text}
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div className={`text-[10px] text-ink-muted dark:text-ink-subOnDark mt-0.5 ${isOwn ? "mr-1" : "ml-1"}`}>
                    {formatTime(item.createdAt)}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 px-4 py-3 border-t border-surface-border dark:border-surface-darkBorder bg-white/90 dark:bg-surface-darkCard/90 backdrop-blur">
        {error ? (
          <div className="text-xs text-du-crimson mb-2">{error}</div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the cohort…"
            className="flex-1 resize-none rounded-xl border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-dark px-3 py-2 text-sm text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold leading-relaxed"
            style={{ maxHeight: "120px" }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className="shrink-0 rounded-xl bg-du-crimson text-white px-4 py-2 text-sm font-semibold hover:bg-du-crimsonDark transition disabled:opacity-40"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
        <div className="text-[10px] text-ink-muted dark:text-ink-subOnDark mt-1.5 ml-1">
          Press Enter to send · Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}

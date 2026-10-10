import { useEffect, useId, useMemo, useState } from "react";
import { useAuthGate } from "../components/AuthGate.jsx";
import ListenerError from "../components/ListenerError.jsx";
import { ALLOWED_DOMAIN } from "../lib/firebase";
import { friendlyAuthError, reauthenticateWithPassword } from "../lib/auth";
import {
  addRosterMembers,
  callableReason,
  getCredentialOperationStatus,
  issueMemberTemporaryPassword,
  loadCurrentMemberEmails,
  markCredentialDelivered,
  newOperationId,
  resetMemberPassword,
  setMemberAccess,
  subscribeAllAccess,
  subscribeRoster,
} from "../lib/access";
import { listenerErrorMessage } from "../lib/subscribe";
import { CANONICAL_APP_URL } from "../lib/platform";

/**
 * Member Access (admin): approve DU emails onto the roster, then issue each
 * member a unique temporary password for individual delivery.
 *
 * A newly issued password is shown once, in one dialog, and lives only in that
 * dialog's state. It is cleared when the dialog closes or this page unmounts
 * and is never written to storage, logs, or any list. The backend enforces
 * every rule here; the UI only makes the safe path the obvious one.
 */

const card = "rounded-xl bg-surface-card dark:bg-surface-darkCard shadow-card border border-surface-border dark:border-surface-darkBorder p-5";
const inputClass =
  "w-full rounded-lg border border-surface-border dark:border-surface-darkBorder bg-white dark:bg-surface-darkCard px-3 py-2.5 text-base text-ink-main dark:text-ink-onDark focus:outline-none focus:ring-2 focus:ring-du-gold";
const primaryButton =
  "rounded-lg bg-du-crimson text-white px-4 py-2.5 text-sm font-semibold hover:bg-du-crimsonDark transition disabled:opacity-50 min-h-[44px]";
const secondaryButton =
  "rounded-lg border border-surface-border dark:border-surface-darkBorder px-4 py-2.5 text-sm font-semibold text-ink-main dark:text-ink-onDark disabled:opacity-50 min-h-[44px]";

const LOST_VALUE_COPY = "Password issued; value no longer available. Issue a replacement if it was not delivered.";

const FLAG_LABELS = {
  "unverified": "email not verified",
  "disabled": "Auth account disabled",
  "unexpected-provider": "unexpected sign-in provider",
  "uid-mismatch": "account ID mismatch",
  "email-mismatch": "email mismatch",
  "auth-missing": "Auth account missing",
};

function parseEmails(text) {
  const valid = [];
  const invalid = [];
  const seen = new Set();
  let duplicates = 0;
  const re = new RegExp(`^[^\\s@]+@${ALLOWED_DOMAIN.replace(/\./g, "\\.")}$`);
  for (const raw of text.split(/[\s,;]+/)) {
    if (!raw) continue;
    const email = raw.toLowerCase();
    if (!re.test(email)) { invalid.push(raw); continue; }
    if (seen.has(email)) { duplicates++; continue; }
    seen.add(email);
    valid.push(email);
  }
  return { valid, invalid, duplicates };
}

function fmt(ts) {
  const d = ts?.toDate?.();
  return d ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
}

function rowStatus(roster, access, now) {
  if (access && access.active === false) return { label: "Disabled", tone: "muted" };
  if (roster.reviewFlags?.length) {
    return { label: "Needs attention", tone: "alert", detail: roster.reviewFlags.map((f) => FLAG_LABELS[f] || f).join(", ") };
  }
  if (!access) return { label: "Not issued", tone: "muted" };
  switch (access.credentialState) {
    case "ready":
      return { label: "Ready", tone: "good" };
    case "temporary":
      return access.credentialVersion === roster.deliveredVersion
        ? { label: "Delivered, awaiting setup", tone: "pending" }
        : { label: "Ready for delivery", tone: "pending" };
    case "legacy": {
      const until = access.legacyUntil?.toDate?.();
      return until && until.getTime() > now
        ? { label: `Legacy access until ${until.toLocaleDateString()}`, tone: "muted" }
        : { label: "Legacy access ended", tone: "alert" };
    }
    case "issuing":
      return (access.leaseExpiresMs || 0) > now
        ? { label: "Issuing…", tone: "pending" }
        : { label: "Needs attention", tone: "alert", detail: "an earlier password operation did not finish" };
    case "error":
      return { label: "Needs attention", tone: "alert", detail: "the last password operation failed" };
    default:
      return { label: "Not issued", tone: "muted" };
  }
}

const TONE_CLASS = {
  good: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200",
  pending: "bg-du-goldSoft text-ink-main dark:bg-amber-900/40 dark:text-amber-100",
  alert: "bg-du-crimsonSoft text-du-crimsonDark dark:bg-red-900/40 dark:text-red-200",
  muted: "bg-surface-light text-ink-sub dark:bg-surface-dark dark:text-ink-subOnDark",
};

function setupMessage(email, password, isReplacement) {
  const opening = isReplacement
    ? "Here is your replacement temporary password. Your previous password has been replaced."
    : "Your Global 84 account is ready.";
  return [
    opening,
    "",
    `App: ${CANONICAL_APP_URL}`,
    `DU email: ${email}`,
    `Temporary password: ${password}`,
    "",
    "Add Global 84 to your Home Screen, then open the icon and sign in there. You'll choose your own password next. Let your phone save that new password. Please keep this message private.",
    "",
    "Already have the icon? Open it to sign in. No need to install again.",
  ].join("\n");
}

// ── Password delivery dialog ───────────────────────────────────────────────────

function PasswordDialog({ issued, onClose }) {
  const titleId = useId();
  const [copyStatus, setCopyStatus] = useState("");
  const [showMessage, setShowMessage] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState("");
  const message = setupMessage(issued.email, issued.password, issued.isReplacement);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopyStatus("Copied. Paste it into a private text or WhatsApp chat with this member only.");
    } catch {
      setShowMessage(true);
      setCopyStatus("Couldn't copy automatically. Select the message below and copy it.");
    }
  }

  async function markAndClose() {
    setMarking(true);
    setError("");
    try {
      await markCredentialDelivered(issued.operationId);
      onClose();
    } catch (err) {
      setMarking(false);
      setError(err?.message || "Couldn't record delivery. Try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`${card} w-full max-w-md max-h-[90vh] overflow-y-auto`}>
        <h2 id={titleId} className="text-lg font-semibold text-ink-main dark:text-ink-onDark">
          {issued.isReplacement ? "Replacement password issued" : "Temporary password issued"}
        </h2>
        <p className="mt-1 text-sm text-ink-sub dark:text-ink-subOnDark">
          Shown once. It can&apos;t be retrieved after you close this dialog.
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark">DU email</dt>
            <dd className="text-ink-main dark:text-ink-onDark break-all">{issued.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-ink-sub dark:text-ink-subOnDark">Temporary password</dt>
            <dd className="font-mono text-xl tracking-wider text-ink-main dark:text-ink-onDark select-all">{issued.password}</dd>
          </div>
        </dl>
        <button type="button" onClick={copyMessage} className={`mt-4 w-full ${primaryButton}`}>
          Copy private setup message
        </button>
        <div role="status" aria-live="polite" className="mt-2 text-xs text-ink-sub dark:text-ink-subOnDark">{copyStatus}</div>
        {showMessage && (
          <textarea
            readOnly
            value={message}
            rows={10}
            aria-label="Private setup message"
            onFocus={(e) => e.target.select()}
            className={`mt-2 ${inputClass} text-sm font-mono`}
          />
        )}
        <p className="mt-3 text-xs text-ink-sub dark:text-ink-subOnDark leading-relaxed">
          Send it only in an individual conversation, never the group chat. Your device&apos;s clipboard may keep a copy.
          &quot;Mark delivered&quot; records your confirmation; it is not a delivery receipt.
        </p>
        {error && <div role="alert" className="mt-2 text-sm text-du-crimson">{error}</div>}
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" onClick={markAndClose} disabled={marking} className={`w-full ${primaryButton}`}>
            {marking ? "Saving…" : "Mark delivered and close"}
          </button>
          <button type="button" onClick={onClose} disabled={marking} className={`w-full ${secondaryButton}`}>
            Close without marking
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm / reauth / outcome dialog for one action ──────────────────────────

const ACTION_COPY = {
  issue: {
    title: "Issue temporary password?",
    body: "A unique temporary password will be created and shown once for you to deliver individually.",
    confirm: "Issue temporary password",
  },
  reset: {
    title: "Issue replacement password?",
    body: "The member's current password will be replaced right away. Other devices may need to sign in again, and they'll need to choose a new password.",
    confirm: "Issue replacement password",
  },
  disable: {
    title: "Disable access?",
    body: "The member will lose access to trip content. Cached content already on their phone can't be erased remotely. Their password is not changed.",
    confirm: "Disable access",
  },
  enable: {
    title: "Re-enable access?",
    body: "Access returns with the same password setup status as before. This does not reset the password.",
    confirm: "Re-enable access",
  },
};

function ActionDialog({ action, adminEmail, onChange, onIssued, onClose }) {
  const titleId = useId();
  const pwId = useId();
  const [password, setPassword] = useState("");
  const copy = ACTION_COPY[action.kind];
  const busy = action.phase === "running";

  async function run(current) {
    onChange({ ...current, phase: "running", error: "" });
    try {
      let res;
      if (current.kind === "issue") res = await issueMemberTemporaryPassword(current.row.email, current.operationId);
      else if (current.kind === "reset") res = await resetMemberPassword(current.row.uid, current.operationId);
      else {
        await setMemberAccess(current.row.uid, current.kind === "enable", current.operationId);
        onClose();
        return;
      }
      if (res.status === "issued") {
        onIssued({
          email: res.email,
          password: res.temporaryPassword,
          operationId: res.operationId,
          isReplacement: current.kind === "reset",
        });
        return;
      }
      onChange({
        ...current,
        phase: "outcome",
        error: res.phase === "completed" ? LOST_VALUE_COPY : `An earlier attempt with this request stopped (${res.phase}). Check the member's status.`,
      });
    } catch (err) {
      const reason = callableReason(err);
      if (reason === "recent-login-required") {
        onChange({ ...current, phase: "reauth", error: "" });
        return;
      }
      // The response may have been lost after the server acted. Ask what
      // happened instead of retrying blindly.
      if (["functions/unavailable", "functions/deadline-exceeded", "functions/internal"].includes(err?.code) &&
          (current.kind === "issue" || current.kind === "reset")) {
        try {
          const status = await getCredentialOperationStatus(current.operationId);
          if (status.phase === "completed") {
            onChange({ ...current, phase: "outcome", error: LOST_VALUE_COPY });
            return;
          }
          if (status.phase === "not-found") {
            onChange({ ...current, phase: "confirm", error: "The request didn't reach the server. Retrying is safe." });
            return;
          }
        } catch {
          onChange({ ...current, phase: "confirm", error: "No connection. Retry when connected; the same request won't run twice." });
          return;
        }
      }
      const changed = err?.details?.passwordChanged === true
        ? " The member's password was changed, so issue a replacement password before delivering anything."
        : "";
      onChange({ ...current, phase: "outcome", error: `${err?.message || "That didn't work."}${changed}` });
    }
  }

  async function handleReauth(e) {
    e.preventDefault();
    try {
      await reauthenticateWithPassword(password);
      setPassword("");
      await run(action);
    } catch (err) {
      onChange({ ...action, phase: "reauth", error: friendlyAuthError(err) });
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`${card} w-full max-w-md`}>
        <h2 id={titleId} className="text-lg font-semibold text-ink-main dark:text-ink-onDark">{copy.title}</h2>
        <p className="mt-1 text-sm font-semibold text-ink-main dark:text-ink-onDark break-all">{action.row.email}</p>

        {action.phase === "reauth" ? (
          <form onSubmit={handleReauth} noValidate className="mt-3 space-y-3">
            <p className="text-sm text-ink-sub dark:text-ink-subOnDark">Confirm your own password to continue.</p>
            <input type="email" name="username" autoComplete="username" value={adminEmail || ""} readOnly className="sr-only" tabIndex={-1} aria-hidden="true" />
            <label htmlFor={pwId} className="block text-xs font-semibold text-ink-sub dark:text-ink-subOnDark">Your password</label>
            <input
              id={pwId}
              name="current-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className={inputClass}
            />
            {action.error && <div role="alert" className="text-sm text-du-crimson">{action.error}</div>}
            <div className="flex gap-2">
              <button type="submit" disabled={!password} className={`flex-1 ${primaryButton}`}>Confirm</button>
              <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
            </div>
          </form>
        ) : action.phase === "outcome" ? (
          <>
            <div role="alert" className="mt-3 text-sm text-ink-main dark:text-ink-onDark leading-relaxed">{action.error}</div>
            <button type="button" onClick={onClose} className={`mt-4 w-full ${secondaryButton}`}>Close</button>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-ink-sub dark:text-ink-subOnDark leading-relaxed">{copy.body}</p>
            {action.error && <div role="alert" className="mt-2 text-sm text-du-crimson">{action.error}</div>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => run(action)} disabled={busy} className={`flex-1 ${primaryButton}`}>
                {busy ? "Working…" : copy.confirm}
              </button>
              <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Roster import ──────────────────────────────────────────────────────────────

function RosterImport() {
  const textId = useId();
  const [text, setText] = useState("");
  const [operationId, setOperationId] = useState(newOperationId);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const parsed = useMemo(() => parseEmails(text), [text]);

  function updateText(value) {
    setText(value);
    // A different list is a different request.
    setOperationId(newOperationId());
    setResults(null);
  }

  async function loadMembers() {
    setError("");
    try {
      const emails = await loadCurrentMemberEmails();
      const present = new Set(parseEmails(text).valid);
      const additions = emails.filter((e) => !present.has(e));
      updateText([text.trim(), ...additions].filter(Boolean).join("\n"));
    } catch {
      setError("Couldn't load current members. Check your connection.");
    }
  }

  async function approve() {
    setBusy(true);
    setError("");
    try {
      const res = await addRosterMembers([...parsed.valid, ...parsed.invalid], operationId);
      setResults(res.results);
    } catch (err) {
      setError(err?.message || "Couldn't update the roster. Retrying is safe.");
    } finally {
      setBusy(false);
    }
  }

  const tooMany = parsed.valid.length + parsed.invalid.length > 100;

  return (
    <section className={`${card} space-y-3`} aria-labelledby={`${textId}-title`}>
      <h2 id={`${textId}-title`} className="text-base font-semibold text-ink-main dark:text-ink-onDark">Approved roster</h2>
      <p className="text-sm text-ink-sub dark:text-ink-subOnDark leading-relaxed">
        Paste DU emails (one per line, or separated by commas or spaces). Adding to the roster approves access
        but doesn&apos;t create or change any password.
      </p>
      <label htmlFor={textId} className="sr-only">Emails to approve</label>
      <textarea
        id={textId}
        rows={6}
        value={text}
        onChange={(e) => updateText(e.target.value)}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={`first.last@${ALLOWED_DOMAIN}`}
        className={`${inputClass} text-sm font-mono`}
      />
      <div className="text-xs text-ink-sub dark:text-ink-subOnDark">
        {parsed.valid.length} valid
        {parsed.duplicates ? `, ${parsed.duplicates} duplicate${parsed.duplicates === 1 ? "" : "s"} removed` : ""}
        {parsed.invalid.length ? `, ${parsed.invalid.length} not a @${ALLOWED_DOMAIN} address: ${parsed.invalid.slice(0, 5).join(", ")}` : ""}
      </div>
      {tooMany && <div role="alert" className="text-sm text-du-crimson">Up to 100 addresses at a time.</div>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={loadMembers} className={secondaryButton}>Load current members</button>
        <button type="button" onClick={approve} disabled={busy || !parsed.valid.length || tooMany} className={primaryButton}>
          {busy ? "Adding…" : `Approve/add to roster (${parsed.valid.length})`}
        </button>
      </div>
      {error && <div role="alert" className="text-sm text-du-crimson">{error}</div>}
      {results && (
        <ul role="status" className="text-sm space-y-1">
          {results.map((r) => (
            <li key={`${r.email}-${r.status}`} className="text-ink-main dark:text-ink-onDark break-all">
              <span className="font-semibold">{r.email}</span>:{" "}
              {r.status === "added" && "added"}
              {r.status === "skipped" && "already on the roster, skipped"}
              {r.status === "invalid" && "not a valid DU email"}
              {r.status === "needs-review" && `added, needs review (${(r.flags || []).map((f) => FLAG_LABELS[f] || f).join(", ")})`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function MemberAccess() {
  const { user } = useAuthGate();
  const [roster, setRoster] = useState([]);
  const [accessList, setAccessList] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [action, setAction] = useState(null);
  const [issued, setIssued] = useState(null);
  const [filter, setFilter] = useState("");
  // Re-evaluated periodically so an expired operation lease shows up as
  // "Needs attention" without a reload.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => subscribeRoster(setRoster, (err) => setLoadError(listenerErrorMessage(err))), []);
  useEffect(() => subscribeAllAccess(setAccessList, (err) => setLoadError(listenerErrorMessage(err))), []);
  // Never keep a password around after leaving the page.
  useEffect(() => () => setIssued(null), []);

  const accessByUid = useMemo(() => new Map(accessList.map((a) => [a.id, a])), [accessList]);
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return roster
      .filter((r) => !q || r.email.includes(q))
      .map((r) => ({ ...r, access: r.uid ? accessByUid.get(r.uid) || null : null }));
  }, [roster, accessByUid, filter]);

  function startAction(kind, row) {
    if (issued) return; // one password dialog at a time
    setAction({ kind, row, operationId: newOperationId(), phase: "confirm", error: "" });
  }

  const counts = rows.reduce((acc, r) => {
    const label = rowStatus(r, r.access, now).label;
    const key = label.startsWith("Legacy") ? "Legacy" : label;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-5 space-y-4 pb-24">
      <div>
        <h1 className="text-xl font-bold text-ink-main dark:text-ink-onDark">Member Access</h1>
        <p className="text-sm text-ink-sub dark:text-ink-subOnDark">
          Approve members, then issue each one a temporary password to send individually.
        </p>
      </div>

      <ListenerError message={loadError} />
      <RosterImport />

      <section className={`${card} space-y-3`} aria-labelledby="roster-status-title">
        <h2 id="roster-status-title" className="text-base font-semibold text-ink-main dark:text-ink-onDark">
          Roster status ({roster.length})
        </h2>
        <div className="text-xs text-ink-sub dark:text-ink-subOnDark">
          {Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(" · ") || "No one on the roster yet."}
        </div>
        <label className="block">
          <span className="sr-only">Filter by email</span>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by email"
            autoCapitalize="none"
            autoCorrect="off"
            className={inputClass}
          />
        </label>

        <ul className="space-y-2">
          {rows.map((r) => {
            const a = r.access;
            const status = rowStatus(r, a, now);
            const isSelf = r.uid && r.uid === user?.uid;
            const leased = a?.credentialState === "issuing" && (a.leaseExpiresMs || 0) > now;
            const flagged = !!r.reviewFlags?.length;
            const canIssue = !isSelf && !flagged && !leased && !(r.issuedVersion > 0) &&
              (!a || (a.active !== false && ["pending", "legacy", "error", "issuing"].includes(a.credentialState)));
            const canReset = !isSelf && !flagged && !leased && r.issuedVersion > 0 && a && a.active !== false;
            const canMarkDelivered = !isSelf && a?.credentialState === "temporary" &&
              r.deliveredVersion !== a.credentialVersion && r.currentOperationId;
            return (
              <li key={r.id} className="rounded-lg border border-surface-border dark:border-surface-darkBorder p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-ink-main dark:text-ink-onDark break-all">
                    {r.email}{isSelf ? " (you)" : ""}
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[status.tone]}`}>
                    {status.label}
                  </span>
                </div>
                {status.detail && <div className="mt-1 text-xs text-du-crimson">{status.detail}</div>}
                <div className="mt-1 text-xs text-ink-sub dark:text-ink-subOnDark space-x-2">
                  {fmt(r.issuedAt) && <span>Issued {fmt(r.issuedAt)}</span>}
                  {fmt(r.deliveredAt) && <span>· Delivered {fmt(r.deliveredAt)}</span>}
                  {fmt(r.readyAt) && <span>· Set up {fmt(r.readyAt)}</span>}
                </div>
                {!isSelf && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {canIssue && (
                      <button type="button" onClick={() => startAction("issue", r)} className={primaryButton}>
                        Issue temporary password
                      </button>
                    )}
                    {canReset && (
                      <button type="button" onClick={() => startAction("reset", r)} className={secondaryButton}>
                        Issue replacement password
                      </button>
                    )}
                    {canMarkDelivered && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await markCredentialDelivered(r.currentOperationId);
                          } catch (err) {
                            setLoadError(err?.message || "Couldn't record delivery.");
                          }
                        }}
                        className={secondaryButton}
                      >
                        Mark delivered
                      </button>
                    )}
                    {a && a.active !== false && (
                      <button type="button" onClick={() => startAction("disable", r)} className={secondaryButton}>
                        Disable access
                      </button>
                    )}
                    {a && a.active === false && (
                      <button type="button" onClick={() => startAction("enable", r)} className={secondaryButton}>
                        Re-enable access
                      </button>
                    )}
                  </div>
                )}
                {isSelf && (
                  <div className="mt-1 text-xs text-ink-sub dark:text-ink-subOnDark">
                    Another administrator manages your own access and password.
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {action && !issued && (
        <ActionDialog
          action={action}
          adminEmail={user?.email}
          onChange={setAction}
          onIssued={(value) => { setAction(null); setIssued(value); }}
          onClose={() => setAction(null)}
        />
      )}
      {issued && <PasswordDialog issued={issued} onClose={() => setIssued(null)} />}
    </div>
  );
}

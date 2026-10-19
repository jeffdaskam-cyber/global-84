import { useEffect, useState, useRef } from "react";
import { auth, db, COHORT_ID } from "../lib/firebase.js";
import { collection, query, orderBy, doc, getDoc } from "firebase/firestore";
import {
  subscribeTeams,
  subscribeMyTeam,
  subscribeTeamMembers,
  subscribeTeamMessages,
  subscribeTeamMeetings,
  createTeam,
  updateTeam,
  deleteTeam,
  assignMember,
  removeMember,
  sendTeamMessage,
  deleteTeamMessage,
  createMeeting,
  updateMeeting,
  deleteMeeting,
} from "../lib/teams.js";
import { watch, listenerErrorMessage } from "../lib/subscribe.js";
import ListenerError from "../components/ListenerError.jsx";
import { fmtDateTime } from "../lib/format.js";
import {
  CITY_TIME_ZONES,
  DEFAULT_TRIP_CITY,
  instantToWallClock,
  wallClockToInstant,
  zoneForCity,
} from "../config/timezones.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

// Meeting times are anchored to the trip city's wall clock like events are
// (see src/config/timezones.js). Meetings created before this field existed
// carry no city; zoneForCity falls back to the default trip city, never to
// the device.
const CITIES = Object.keys(CITY_TIME_ZONES);

function AvatarInitial({ name, size = 32 }) {
  const initial = (name || "?")[0].toUpperCase();
  return (
    <div
      className="flex items-center justify-center rounded-full flex-shrink-0 font-bold text-white"
      style={{
        width: size, height: size, fontSize: size * 0.4,
        background: "linear-gradient(135deg, #BA0C2F, #8a0922)",
      }}
    >
      {initial}
    </div>
  );
}

// ── Shared UI primitives ───────────────────────────────────────────────────────

function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3
        className="text-[15px] font-bold tracking-[0.02em] text-ink-main dark:text-ink-onDark"
        style={{ fontFamily: "Georgia, serif" }}
      >
        {title}
      </h3>
      {action}
    </div>
  );
}

function Card({ children, className = "", style }) {
  return (
    <div
      className={`rounded-xl bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder shadow-card px-4 py-3.5 ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

function GoldButton({ onClick, children, small, danger, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg font-bold whitespace-nowrap transition ${
        small ? "px-3 py-1.5 text-xs" : "px-5 py-2.5 text-sm"
      } ${
        danger
          ? "bg-du-crimsonSoft text-du-crimson border border-du-crimson/30 hover:bg-du-crimson/15"
          : "bg-du-crimson text-white hover:bg-du-crimsonDark"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
}

function GhostButton({ onClick, children, small }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg font-semibold whitespace-nowrap transition bg-transparent border border-surface-border dark:border-surface-darkBorder text-ink-sub dark:text-ink-subOnDark hover:bg-surface-light dark:hover:bg-surface-dark ${
        small ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm"
      }`}
    >
      {children}
    </button>
  );
}

const fieldClass =
  "w-full rounded-lg px-3 py-2.5 text-sm outline-none bg-surface-light dark:bg-surface-dark border border-surface-border dark:border-surface-darkBorder text-ink-main dark:text-ink-onDark placeholder:text-ink-muted focus:border-du-gold";

const fieldLabelClass = "block mb-1 text-xs font-semibold text-ink-sub dark:text-ink-subOnDark";

// Pill toggle shared by the admin tabs, city picker and team list.
function pillClass(active) {
  return `rounded-full px-4 py-1.5 text-[13px] font-semibold cursor-pointer transition ${
    active
      ? "bg-du-crimson text-white"
      : "bg-surface-border/60 text-ink-sub hover:bg-surface-border dark:bg-surface-darkBorder dark:text-ink-subOnDark"
  }`;
}

function Input({ value, onChange, placeholder, type = "text" }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={fieldClass}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      className={`${fieldClass} resize-y`}
    />
  );
}

// ── Modal wrapper ──────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-[440px] max-h-[90vh] overflow-y-auto p-6 rounded-xl bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder shadow-card">
        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-lg font-bold text-ink-main dark:text-ink-onDark"
            style={{ fontFamily: "Georgia, serif" }}
          >
            {title}
          </h2>
          <button onClick={onClose} className="text-xl text-ink-muted hover:text-ink-main dark:hover:text-ink-onDark">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Team Chat ──────────────────────────────────────────────────────────────────

function TeamChat({ teamId, isAdmin }) {
  const user = auth.currentUser;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!teamId) return;
    setLoadError("");
    return subscribeTeamMessages(teamId, setMessages, (err) =>
      setLoadError(listenerErrorMessage(err))
    );
  }, [teamId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || !user) return;
    setSending(true);
    try {
      const memberSnap = await getDoc(doc(db, "cohorts", COHORT_ID, "members", user.uid));
      const displayName = memberSnap.exists() ? memberSnap.data().displayName : "Member";
      await sendTeamMessage(teamId, trimmed, user.uid, displayName);
      setText("");
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
    await deleteTeamMessage(teamId, messageId);
  }

  return (
    <div>
      <SectionHeader title="💬 Team Chat" />
      <div className="flex flex-col gap-2 h-80 overflow-y-auto p-3 rounded-xl bg-surface-card dark:bg-surface-darkCard border border-surface-border dark:border-surface-darkBorder shadow-card">
        {loadError ? (
          <p className="mt-10 text-[13px] text-center text-amber-800 dark:text-amber-300">
            {loadError}
          </p>
        ) : messages.length === 0 && (
          <p className="mt-10 text-[13px] text-center text-ink-muted">
            No messages yet. Say hello!
          </p>
        )}
        {messages.map((msg) => {
          const isOwn = msg.createdByUid === user?.uid;
          return (
            <div key={msg.id}
              className="flex items-end gap-2"
              style={{ flexDirection: isOwn ? "row-reverse" : "row" }}>
              {!isOwn && <AvatarInitial name={msg.createdByName} size={28} />}
              <div style={{ maxWidth: "75%" }}>
                {!isOwn && (
                  <p className="mb-0.5 pl-1 text-[10px] font-semibold text-ink-sub dark:text-ink-subOnDark">
                    {msg.createdByName}
                  </p>
                )}
                <div
                  className={`px-3 py-2 text-sm break-words ${
                    isOwn
                      ? "bg-du-crimson text-white"
                      : "bg-surface-light dark:bg-surface-dark border border-surface-border dark:border-surface-darkBorder text-ink-main dark:text-ink-onDark"
                  }`}
                  style={{ borderRadius: isOwn ? "14px 14px 4px 14px" : "14px 14px 14px 4px" }}
                >
                  {msg.text}
                </div>
              </div>
              {isAdmin && (
                <button onClick={() => handleDelete(msg.id)}
                  className="flex-shrink-0 text-[11px] opacity-40 hover:opacity-80">
                  🗑
                </button>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 mt-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message your team…"
          maxLength={1000}
          rows={2}
          className={`${fieldClass} flex-1 resize-none bg-surface-card dark:bg-surface-darkCard`}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className={`w-11 rounded-lg text-lg font-bold bg-du-crimson text-white hover:bg-du-crimsonDark transition ${
            !text.trim() || sending ? "opacity-40" : ""
          }`}
        >
          ↑
        </button>
      </div>
    </div>
  );
}

// ── Meetings list ──────────────────────────────────────────────────────────────

function MeetingsList({ teamId, isAdmin }) {
  const [meetings, setMeetings] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [form, setForm] = useState({ title: "", dateTime: "", city: DEFAULT_TRIP_CITY, location: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const user = auth.currentUser;

  useEffect(() => {
    if (!teamId) return;
    setLoadError("");
    return subscribeTeamMeetings(teamId, setMeetings, (err) =>
      setLoadError(listenerErrorMessage(err))
    );
  }, [teamId]);

  function openNew() {
    setForm({ title: "", dateTime: "", city: DEFAULT_TRIP_CITY, location: "", notes: "" });
    setEditingMeeting(null);
    setShowForm(true);
  }

  function openEdit(meeting) {
    const city = CITIES.includes(meeting.city) ? meeting.city : DEFAULT_TRIP_CITY;
    setForm({
      title: meeting.title || "",
      dateTime: instantToWallClock(meeting.dateTime, city),
      city,
      location: meeting.location || "",
      notes: meeting.notes || "",
    });
    setEditingMeeting(meeting);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !wallClockToInstant(form.dateTime, form.city)) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        dateTime: wallClockToInstant(form.dateTime, form.city),
        city: form.city,
        location: form.location.trim(),
        notes: form.notes.trim(),
      };
      if (editingMeeting) {
        await updateMeeting(teamId, editingMeeting.id, payload);
      } else {
        await createMeeting(teamId, payload, user.uid);
      }
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(meetingId) {
    if (!window.confirm("Delete this meeting?")) return;
    await deleteMeeting(teamId, meetingId);
  }

  const now = new Date();
  const upcoming = meetings.filter((m) => {
    const d = m.dateTime?.toDate ? m.dateTime.toDate() : new Date(m.dateTime);
    return d >= now;
  });
  const past = meetings.filter((m) => {
    const d = m.dateTime?.toDate ? m.dateTime.toDate() : new Date(m.dateTime);
    return d < now;
  });

  return (
    <div>
      <SectionHeader
        title="📋 Meeting Schedule"
        action={isAdmin && <GoldButton small onClick={openNew}>+ Meeting</GoldButton>}
      />

      {loadError ? (
        <p className="py-5 text-[13px] text-center text-amber-800 dark:text-amber-300">
          {loadError}
        </p>
      ) : meetings.length === 0 && (
        <p className="py-5 text-[13px] text-center text-ink-muted">
          No meetings scheduled yet.
        </p>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-2 mb-4">
          {upcoming.map((m) => (
            <MeetingCard key={m.id} meeting={m} isAdmin={isAdmin} onEdit={openEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            Past
          </p>
          <div className="space-y-2 opacity-50">
            {past.map((m) => (
              <MeetingCard key={m.id} meeting={m} isAdmin={isAdmin} onEdit={openEdit} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingMeeting ? "Edit Meeting" : "Add Meeting"}
      >
        <div className="space-y-3">
          <div>
            <label className={fieldLabelClass}>Title *</label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Meeting title" />
          </div>
          <div>
            <label className={fieldLabelClass}>City *</label>
            <div className="flex gap-2">
              {CITIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, city: c })}
                  className={pillClass(form.city === c)}
                >
                  {c === "Ho Chi Minh City" ? "HCMC" : c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={fieldLabelClass}>
              Date & Time * — local time in {form.city} ({zoneForCity(form.city).label})
            </label>
            <Input type="datetime-local" value={form.dateTime} onChange={(e) => setForm({ ...form, dateTime: e.target.value })} />
          </div>
          <div>
            <label className={fieldLabelClass}>Location</label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Where?" />
          </div>
          <div>
            <label className={fieldLabelClass}>Notes</label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" rows={2} />
          </div>
          <div className="flex gap-2 pt-2">
            <GoldButton onClick={handleSave} disabled={saving || !form.title.trim() || !form.dateTime}>
              {saving ? "Saving…" : editingMeeting ? "Save Changes" : "Add Meeting"}
            </GoldButton>
            <GhostButton onClick={() => setShowForm(false)}>Cancel</GhostButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function MeetingCard({ meeting, isAdmin, onEdit, onDelete }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div style={{ flex: 1 }}>
          <p className="text-sm font-bold text-ink-main dark:text-ink-onDark">{meeting.title}</p>
          <p className="mt-0.5 text-xs font-semibold text-du-crimson">
            🕐 {fmtDateTime(meeting.dateTime, meeting.city)}
          </p>
          {meeting.location && (
            <p className="mt-0.5 text-xs text-ink-sub dark:text-ink-subOnDark">
              📍 {meeting.location}
            </p>
          )}
          {meeting.notes && (
            <p className="mt-1 text-xs italic text-ink-muted">
              {meeting.notes}
            </p>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => onEdit(meeting)} className="px-1 py-0.5 text-sm">
              ✏️
            </button>
            <button onClick={() => onDelete(meeting.id)} className="px-1 py-0.5 text-sm">
              🗑
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Admin panel ────────────────────────────────────────────────────────────────

function AdminPanel({ user }) {
  const [teams, setTeams] = useState([]);
  const [cohortMembers, setCohortMembers] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [error, setError] = useState("");

  // Derive selectedTeam from the live teams list so it always stays in sync
  const selectedTeam = teams.find((t) => t.id === selectedTeamId) || null;

  // Create team modal
  const [showCreate, setShowCreate] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);

  // Rename modal
  const [showRename, setShowRename] = useState(false);
  const [renameName, setRenameName] = useState("");

  // Assign member modal
  const [showAssign, setShowAssign] = useState(false);
  const [assignUid, setAssignUid] = useState("");

  useEffect(() => {
    return subscribeTeams(setTeams, (err) => setError(listenerErrorMessage(err)));
  }, []);

  // Load all cohort members for the assign dropdown
  useEffect(() => {
    const q = query(
      collection(db, "cohorts", COHORT_ID, "members"),
      orderBy("displayName", "asc")
    );
    return watch("cohort-members", q, (snap) => {
      setCohortMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    }, (err) => setError(listenerErrorMessage(err)));
  }, []);

  // Subscribe to selected team's members
  useEffect(() => {
    if (!selectedTeamId) { setTeamMembers([]); return; }
    return subscribeTeamMembers(selectedTeamId, setTeamMembers, (err) =>
      setError(listenerErrorMessage(err))
    );
  }, [selectedTeamId]);

  async function handleCreateTeam() {
    if (!newTeamName.trim()) return;
    setCreating(true);
    try {
      const id = await createTeam(newTeamName.trim(), user.uid);
      setSelectedTeamId(id);
      setShowCreate(false);
      setNewTeamName("");
    } finally {
      setCreating(false);
    }
  }

  async function handleRenameTeam() {
    if (!renameName.trim() || !selectedTeam) return;
    await updateTeam(selectedTeam.id, renameName.trim());
    setShowRename(false);
  }

  async function handleDeleteTeam() {
    if (!selectedTeam) return;
    if (!window.confirm(`Delete "${selectedTeam.name}" and all its messages and meetings? This cannot be undone.`)) return;
    await deleteTeam(selectedTeam.id);
    setSelectedTeamId(null);
  }

  async function handleAssign() {
    if (!assignUid || !selectedTeam) return;
    const member = cohortMembers.find((m) => m.uid === assignUid);
    if (!member) return;
    await assignMember(selectedTeam.id, assignUid, member.displayName || member.email);
    setAssignUid("");
    setShowAssign(false);
  }

  async function handleRemoveMember(uid) {
    if (!window.confirm("Remove this member from the team?")) return;
    await removeMember(selectedTeam.id, uid);
  }

  // Members not yet on this team (for assign dropdown)
  const assignableMembers = cohortMembers.filter(
    (cm) => !teamMembers.some((tm) => tm.uid === cm.uid)
  );

  return (
    <div className="space-y-5">
      {error && <ListenerError message={error} />}

      {/* Team list */}
      <div>
        <SectionHeader
          title="Teams"
          action={<GoldButton small onClick={() => setShowCreate(true)}>+ New Team</GoldButton>}
        />
        {teams.length === 0 ? (
          <p className="py-4 text-[13px] text-center text-ink-muted">
            No teams yet. Create one above.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {teams.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTeamId(t.id)}
                className={pillClass(selectedTeam?.id === t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected team detail */}
      {selectedTeam && (
        <div className="space-y-4">
          {/* Team header */}
          <Card>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-base font-bold text-ink-main dark:text-ink-onDark" style={{ fontFamily: "Georgia, serif" }}>
                {selectedTeam.name}
              </h3>
              <div className="flex gap-2">
                <GhostButton small onClick={() => { setRenameName(selectedTeam.name); setShowRename(true); }}>
                  Rename
                </GhostButton>
                <GoldButton small danger onClick={handleDeleteTeam}>
                  Delete
                </GoldButton>
              </div>
            </div>
          </Card>

          {/* Members */}
          <div>
            <SectionHeader
              title="Members"
              action={
                assignableMembers.length > 0
                  ? <GoldButton small onClick={() => setShowAssign(true)}>+ Add Member</GoldButton>
                  : null
              }
            />
            {teamMembers.length === 0 ? (
              <p className="text-[13px] text-ink-muted">No members assigned yet.</p>
            ) : (
              <div className="space-y-2">
                {teamMembers.map((m) => (
                  <Card key={m.uid} className="!py-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AvatarInitial name={m.displayName} size={30} />
                        <span className="text-sm text-ink-main dark:text-ink-onDark">{m.displayName}</span>
                      </div>
                      <button onClick={() => handleRemoveMember(m.uid)}
                        className="text-xs font-semibold text-du-crimson hover:text-du-crimsonDark">
                        Remove
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Meetings for this team */}
          <MeetingsList teamId={selectedTeam.id} isAdmin={true} />

          {/* Chat preview not shown in admin panel — admins can only chat from their own team view */}
          <Card className="!bg-du-crimsonSoft !border-du-crimson/20 !shadow-none dark:!bg-du-crimson/10">
            <p className="text-xs text-center text-du-crimsonDark dark:text-ink-subOnDark">
              🔒 Team chat is private to assigned members only.<br />
              To view a team's chat, you must be assigned to that team.
            </p>
          </Card>
        </div>
      )}

      {/* Create team modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Team">
        <div className="space-y-4">
          <div>
            <label className={fieldLabelClass}>
              Team Name *
            </label>
            <Input value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="e.g. Team A" />
          </div>
          <div className="flex gap-2">
            <GoldButton onClick={handleCreateTeam} disabled={creating || !newTeamName.trim()}>
              {creating ? "Creating…" : "Create Team"}
            </GoldButton>
            <GhostButton onClick={() => setShowCreate(false)}>Cancel</GhostButton>
          </div>
        </div>
      </Modal>

      {/* Rename modal */}
      <Modal open={showRename} onClose={() => setShowRename(false)} title="Rename Team">
        <div className="space-y-4">
          <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} placeholder="New team name" />
          <div className="flex gap-2">
            <GoldButton onClick={handleRenameTeam} disabled={!renameName.trim()}>Save</GoldButton>
            <GhostButton onClick={() => setShowRename(false)}>Cancel</GhostButton>
          </div>
        </div>
      </Modal>

      {/* Assign member modal */}
      <Modal open={showAssign} onClose={() => setShowAssign(false)} title="Add Member">
        <div className="space-y-4">
          <div>
            <label className={fieldLabelClass}>
              Select Member
            </label>
            <select
              value={assignUid}
              onChange={(e) => setAssignUid(e.target.value)}
              className={fieldClass}
            >
              <option value="">— Choose a member —</option>
              {assignableMembers.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.displayName || m.email}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <GoldButton onClick={handleAssign} disabled={!assignUid}>Add to Team</GoldButton>
            <GhostButton onClick={() => setShowAssign(false)}>Cancel</GhostButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Member view ────────────────────────────────────────────────────────────────

function MemberView({ user, isAdmin }) {
  const [myTeam, setMyTeam] = useState(undefined); // undefined = loading
  const [teamMembers, setTeamMembers] = useState([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!user) return;
    return subscribeMyTeam(
      user.uid,
      (team) => setMyTeam(team),
      // Leave myTeam undefined and report the failure instead: falling through
      // to null would render "Not assigned to a team yet", which is a factual
      // claim about the cohort we cannot make from a dropped connection.
      (err) => setLoadError(listenerErrorMessage(err))
    );
  }, [user]);

  useEffect(() => {
    if (!myTeam?.id) return;
    return subscribeTeamMembers(myTeam.id, setTeamMembers, (err) =>
      setLoadError(listenerErrorMessage(err))
    );
  }, [myTeam?.id]);

  if (loadError) {
    return <ListenerError message={loadError} />;
  }

  if (myTeam === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 rounded-full border-[3px] border-du-goldSoft border-t-du-crimson animate-spin" />
      </div>
    );
  }

  if (!myTeam) {
    return (
      <Card className="text-center !px-6 !py-10">
        <p className="mb-3 text-[32px]">👥</p>
        <p className="mb-2 text-base font-bold text-ink-main dark:text-ink-onDark" style={{ fontFamily: "Georgia, serif" }}>
          Not assigned to a team yet
        </p>
        <p className="text-[13px] leading-normal text-ink-sub dark:text-ink-subOnDark">
          Your program coordinator will assign you to a team before the trip.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Team identity */}
      <Card>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-du-gold">
          Your Team
        </p>
        <h2 className="text-[22px] font-bold text-ink-main dark:text-ink-onDark" style={{ fontFamily: "Georgia, serif" }}>
          {myTeam.name}
        </h2>
      </Card>

      {/* Team members */}
      <div>
        <SectionHeader title="👥 Members" />
        <div className="space-y-2">
          {teamMembers.map((m) => (
            <Card key={m.uid} className="!py-2.5">
              <div className="flex items-center gap-3">
                <AvatarInitial name={m.displayName} size={32} />
                <span className="text-sm text-ink-main dark:text-ink-onDark">
                  {m.displayName}
                  {m.uid === user.uid && (
                    <span className="ml-1.5 text-[11px] font-semibold text-du-gold">you</span>
                  )}
                </span>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Meetings */}
      <MeetingsList teamId={myTeam.id} isAdmin={isAdmin} />

      {/* Chat */}
      <TeamChat teamId={myTeam.id} isAdmin={isAdmin} />
    </div>
  );
}

// ── Main Team page ─────────────────────────────────────────────────────────────

export default function Team({ isAdmin }) {
  const user = auth.currentUser;
  const [activeTab, setActiveTab] = useState(isAdmin ? "manage" : "my-team");

  // If user is admin, show tabs: My Team | Manage Teams
  // If regular user, show only their team view (no tabs)

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div>
        <div className="text-xl font-semibold text-ink-main dark:text-ink-onDark" style={{ fontFamily: "Georgia, serif" }}>
          Teams <span className="text-du-gold">•</span>
        </div>
        <div className="h-1 w-10 rounded-full bg-du-gold mt-2" />
        <p className="mt-3 text-sm text-ink-sub dark:text-ink-subOnDark">
          Small-group hub for meetings and chat
        </p>

        {/* Tabs (admin only) */}
        {isAdmin && (
          <div className="flex gap-2 mt-4">
            {[
              { key: "my-team", label: "My Team" },
              { key: "manage", label: "Manage Teams" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={pillClass(activeTab === key)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-w-[600px] mx-auto">
        {isAdmin && activeTab === "manage" ? (
          <AdminPanel user={user} />
        ) : (
          <MemberView user={user} isAdmin={isAdmin} />
        )}
      </div>
    </div>
  );
}

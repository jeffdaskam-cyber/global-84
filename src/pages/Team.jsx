import { useEffect, useState, useRef } from "react";
import { auth, db, COHORT_ID } from "../lib/firebase.js";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDateTime(ts) {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function formatDateTimeInput(ts) {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
      <h3 style={{
        fontFamily: "Georgia, serif", fontSize: "15px", fontWeight: 700,
        color: "#ffffff", letterSpacing: "0.02em",
      }}>{title}</h3>
      {action}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", borderRadius: 12,
      border: "1px solid rgba(196,150,42,0.15)", padding: "14px 16px",
      ...style,
    }}>
      {children}
    </div>
  );
}

function GoldButton({ onClick, children, small, danger, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: danger
          ? "rgba(186,12,47,0.18)"
          : "linear-gradient(135deg,#e8b84b,#c4862a)",
        color: danger ? "#ff6b6b" : "#1a0a00",
        border: danger ? "1px solid rgba(186,12,47,0.4)" : "none",
        borderRadius: 8,
        padding: small ? "5px 12px" : "9px 20px",
        fontSize: small ? 12 : 14,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function GhostButton({ onClick, children, small }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        color: "rgba(196,150,42,0.8)",
        border: "1px solid rgba(196,150,42,0.3)",
        borderRadius: 8,
        padding: small ? "5px 12px" : "9px 18px",
        fontSize: small ? 12 : 14,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function Input({ value, onChange, placeholder, type = "text", style }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(196,150,42,0.25)",
        borderRadius: 8, color: "#fff",
        padding: "9px 12px", fontSize: 14, width: "100%",
        outline: "none", ...style,
      }}
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
      style={{
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(196,150,42,0.25)",
        borderRadius: 8, color: "#fff",
        padding: "9px 12px", fontSize: 14, width: "100%",
        outline: "none", resize: "vertical",
      }}
    />
  );
}

// ── Modal wrapper ──────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(13,1,3,0.75)", padding: "16px" }}>
      <div style={{
        background: "linear-gradient(160deg,#0d0103 0%,#1c0408 60%,#2a0a10 100%)",
        border: "1px solid rgba(196,150,42,0.25)",
        borderRadius: 16, width: "100%", maxWidth: 440,
        maxHeight: "90vh", overflowY: "auto", padding: "24px",
      }}>
        <div className="flex items-center justify-between mb-5">
          <h2 style={{ fontFamily: "Georgia,serif", fontSize: 18, fontWeight: 700, color: "#fff" }}>
            {title}
          </h2>
          <button onClick={onClose}
            style={{ color: "rgba(255,255,255,0.5)", fontSize: 20, background: "none", border: "none", cursor: "pointer" }}>
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
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!teamId) return;
    return subscribeTeamMessages(teamId, setMessages);
  }, [teamId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || !user) return;
    setSending(true);
    try {
      const memberDoc = await import("firebase/firestore").then(({ getDoc, doc }) =>
        getDoc(doc(db, "cohorts", COHORT_ID, "members", user.uid))
      );
      const displayName = memberDoc.exists() ? memberDoc.data().displayName : user.email;
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
      <div style={{
        background: "rgba(0,0,0,0.25)", borderRadius: 12,
        border: "1px solid rgba(196,150,42,0.12)",
        height: 320, overflowY: "auto", padding: "12px",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        {messages.length === 0 && (
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", marginTop: 40 }}>
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
                  <p style={{ fontSize: 10, color: "rgba(196,150,42,0.7)", marginBottom: 2, paddingLeft: 4 }}>
                    {msg.createdByName}
                  </p>
                )}
                <div style={{
                  background: isOwn
                    ? "linear-gradient(135deg,#BA0C2F,#8a0922)"
                    : "rgba(255,255,255,0.08)",
                  borderRadius: isOwn ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  padding: "8px 12px", fontSize: 14, color: "#fff",
                  wordBreak: "break-word",
                }}>
                  {msg.text}
                </div>
              </div>
              {isAdmin && (
                <button onClick={() => handleDelete(msg.id)}
                  style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>
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
          style={{
            flex: 1, background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(196,150,42,0.25)",
            borderRadius: 10, color: "#fff", padding: "9px 12px",
            fontSize: 14, resize: "none", outline: "none",
          }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          style={{
            background: "linear-gradient(135deg,#e8b84b,#c4862a)",
            color: "#1a0a00", border: "none", borderRadius: 10,
            width: 44, fontSize: 18, cursor: "pointer",
            opacity: !text.trim() || sending ? 0.4 : 1,
          }}
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
  const [form, setForm] = useState({ title: "", dateTime: "", location: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const user = auth.currentUser;

  useEffect(() => {
    if (!teamId) return;
    return subscribeTeamMeetings(teamId, setMeetings);
  }, [teamId]);

  function openNew() {
    setForm({ title: "", dateTime: "", location: "", notes: "" });
    setEditingMeeting(null);
    setShowForm(true);
  }

  function openEdit(meeting) {
    setForm({
      title: meeting.title || "",
      dateTime: formatDateTimeInput(meeting.dateTime?.toDate ? meeting.dateTime.toDate() : meeting.dateTime),
      location: meeting.location || "",
      notes: meeting.notes || "",
    });
    setEditingMeeting(meeting);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.dateTime) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        dateTime: new Date(form.dateTime),
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

      {meetings.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
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
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
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
            <label style={{ fontSize: 12, color: "rgba(196,150,42,0.8)", display: "block", marginBottom: 4 }}>Title *</label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Meeting title" />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "rgba(196,150,42,0.8)", display: "block", marginBottom: 4 }}>Date & Time *</label>
            <Input type="datetime-local" value={form.dateTime} onChange={(e) => setForm({ ...form, dateTime: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "rgba(196,150,42,0.8)", display: "block", marginBottom: 4 }}>Location</label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Where?" />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "rgba(196,150,42,0.8)", display: "block", marginBottom: 4 }}>Notes</label>
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
          <p style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{meeting.title}</p>
          <p style={{ fontSize: 12, color: "rgba(196,150,42,0.85)", marginTop: 2 }}>
            🕐 {formatDateTime(meeting.dateTime)}
          </p>
          {meeting.location && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
              📍 {meeting.location}
            </p>
          )}
          {meeting.notes && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4, fontStyle: "italic" }}>
              {meeting.notes}
            </p>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => onEdit(meeting)}
              style={{ fontSize: 14, background: "none", border: "none", cursor: "pointer", color: "rgba(196,150,42,0.6)", padding: "2px 4px" }}>
              ✏️
            </button>
            <button onClick={() => onDelete(meeting.id)}
              style={{ fontSize: 14, background: "none", border: "none", cursor: "pointer", color: "rgba(255,100,100,0.5)", padding: "2px 4px" }}>
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
    return subscribeTeams(setTeams);
  }, []);

  // Load all cohort members for the assign dropdown
  useEffect(() => {
    const q = query(
      collection(db, "cohorts", COHORT_ID, "members"),
      orderBy("displayName", "asc")
    );
    return onSnapshot(q, (snap) => {
      setCohortMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    });
  }, []);

  // Subscribe to selected team's members
  useEffect(() => {
    if (!selectedTeamId) { setTeamMembers([]); return; }
    return subscribeTeamMembers(selectedTeamId, setTeamMembers);
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
      {/* Team list */}
      <div>
        <SectionHeader
          title="Teams"
          action={<GoldButton small onClick={() => setShowCreate(true)}>+ New Team</GoldButton>}
        />
        {teams.length === 0 ? (
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", padding: "16px 0" }}>
            No teams yet. Create one above.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {teams.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTeamId(t.id)}
                style={{
                  padding: "7px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", border: "1px solid",
                  background: selectedTeam?.id === t.id ? "rgba(196,150,42,0.18)" : "transparent",
                  borderColor: selectedTeam?.id === t.id ? "rgba(196,150,42,0.6)" : "rgba(196,150,42,0.25)",
                  color: selectedTeam?.id === t.id ? "#e8b84b" : "rgba(255,255,255,0.6)",
                }}
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
              <h3 style={{ fontFamily: "Georgia,serif", fontSize: 16, fontWeight: 700, color: "#fff" }}>
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
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No members assigned yet.</p>
            ) : (
              <div className="space-y-2">
                {teamMembers.map((m) => (
                  <Card key={m.uid} style={{ padding: "10px 14px" }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AvatarInitial name={m.displayName} size={30} />
                        <span style={{ fontSize: 14, color: "#fff" }}>{m.displayName}</span>
                      </div>
                      <button onClick={() => handleRemoveMember(m.uid)}
                        style={{ fontSize: 12, color: "rgba(255,100,100,0.6)", background: "none", border: "none", cursor: "pointer" }}>
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
          <Card style={{ background: "rgba(186,12,47,0.08)", border: "1px solid rgba(186,12,47,0.2)" }}>
            <p style={{ fontSize: 12, color: "rgba(255,180,180,0.7)", textAlign: "center" }}>
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
            <label style={{ fontSize: 12, color: "rgba(196,150,42,0.8)", display: "block", marginBottom: 4 }}>
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
            <label style={{ fontSize: 12, color: "rgba(196,150,42,0.8)", display: "block", marginBottom: 4 }}>
              Select Member
            </label>
            <select
              value={assignUid}
              onChange={(e) => setAssignUid(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(196,150,42,0.25)",
                borderRadius: 8, color: "#fff",
                padding: "9px 12px", fontSize: 14, width: "100%",
              }}
            >
              <option value="" style={{ background: "#1c0408" }}>— Choose a member —</option>
              {assignableMembers.map((m) => (
                <option key={m.uid} value={m.uid} style={{ background: "#1c0408" }}>
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

  useEffect(() => {
    if (!user) return;
    return subscribeMyTeam(user.uid, (team) => setMyTeam(team));
  }, [user]);

  useEffect(() => {
    if (!myTeam?.id) return;
    return subscribeTeamMembers(myTeam.id, setTeamMembers);
  }, [myTeam?.id]);

  if (myTeam === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid rgba(196,150,42,0.3)", borderTopColor: "#e8b84b", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (!myTeam) {
    return (
      <Card style={{ textAlign: "center", padding: "40px 24px" }}>
        <p style={{ fontSize: 32, marginBottom: 12 }}>👥</p>
        <p style={{ fontFamily: "Georgia,serif", fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
          Not assigned to a team yet
        </p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
          Your program coordinator will assign you to a team before the trip.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Team identity */}
      <Card>
        <p style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(196,150,42,0.6)", marginBottom: 4 }}>
          Your Team
        </p>
        <h2 style={{ fontFamily: "Georgia,serif", fontSize: 22, fontWeight: 700, color: "#fff" }}>
          {myTeam.name}
        </h2>
      </Card>

      {/* Team members */}
      <div>
        <SectionHeader title="👥 Members" />
        <div className="space-y-2">
          {teamMembers.map((m) => (
            <Card key={m.uid} style={{ padding: "10px 14px" }}>
              <div className="flex items-center gap-3">
                <AvatarInitial name={m.displayName} size={32} />
                <span style={{ fontSize: 14, color: "#fff" }}>
                  {m.displayName}
                  {m.uid === user.uid && (
                    <span style={{ fontSize: 11, color: "rgba(196,150,42,0.6)", marginLeft: 6 }}>you</span>
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
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg,#0d0103 0%,#150305 100%)" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg,#0d0103 0%,#1c0408 60%,#2a0a10 100%)",
        padding: "52px 20px 20px",
        borderBottom: "1px solid rgba(196,150,42,0.15)",
      }}>
        <h1 style={{
          fontFamily: "Georgia, serif", fontSize: "26px", fontWeight: 700,
          color: "#ffffff", letterSpacing: "-0.3px",
        }}>
          <span style={{
            background: "linear-gradient(135deg,#e8b84b 0%,#f5d47a 45%,#c4862a 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>Teams</span>
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
          Small-group hub for meetings and chat
        </p>

        {/* Tabs (admin only) */}
        {isAdmin && (
          <div className="flex gap-1 mt-4">
            {[
              { key: "my-team", label: "My Team" },
              { key: "manage", label: "Manage Teams" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{
                  padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", border: "1px solid",
                  background: activeTab === key ? "rgba(196,150,42,0.18)" : "transparent",
                  borderColor: activeTab === key ? "rgba(196,150,42,0.6)" : "rgba(196,150,42,0.25)",
                  color: activeTab === key ? "#e8b84b" : "rgba(255,255,255,0.5)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: "20px 16px", maxWidth: 600, margin: "0 auto" }}>
        {isAdmin && activeTab === "manage" ? (
          <AdminPanel user={user} />
        ) : (
          <MemberView user={user} isAdmin={isAdmin} />
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

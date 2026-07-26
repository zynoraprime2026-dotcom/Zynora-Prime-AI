import { useState, useEffect } from "react";
import { X, Plus, Search, MessageSquare, Pencil, Trash2 } from "lucide-react";

// Slide-in panel from the left listing saved conversations, newest
// first, with a search box to filter by title and inline renaming.
// Deleting a conversation needs a second tap on the same item to
// confirm, same pattern as "Clear chat" in the settings panel.
export function Sidebar({ styles, open, onClose, conversations, activeId, onSwitch, onNew, onDelete, onRename, disabled }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  // Reset transient UI state (confirm/search/edit) every time the
  // sidebar closes, so it doesn't reopen mid-edit or mid-confirm later.
  useEffect(() => {
    if (!open) {
      setConfirmDeleteId(null);
      setQuery("");
      setEditingId(null);
    }
  }, [open]);

  function handleDeleteClick(e, id) {
    e.stopPropagation();
    if (confirmDeleteId === id) {
      onDelete(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
    }
  }

  function startEditing(e, c) {
    e.stopPropagation();
    setEditingId(c.id);
    setEditingValue(c.title);
  }

  function commitEdit() {
    if (editingId) onRename(editingId, editingValue);
    setEditingId(null);
  }

  function handleEditKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      setEditingId(null);
    }
  }

  if (!open) return null;

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(query.trim().toLowerCase())
  );
  const sorted = [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      <div style={styles.overlay} onClick={onClose} />
      <div style={styles.sidebar}>
        <div style={styles.panelHeader}>
          <div style={styles.panelTitle}>Chats</div>
          <button style={styles.iconButton} onClick={onClose} aria-label="Close chat list">
            <X size={18} color={styles.palette.textMuted} />
          </button>
        </div>

        <button
          style={{ ...styles.newChatButton, opacity: disabled ? 0.5 : 1 }}
          onClick={onNew}
          disabled={disabled}
        >
          <Plus size={15} /> New chat
        </button>

        {conversations.length > 5 && (
          <div style={styles.searchWrap}>
            <Search size={14} color={styles.palette.textMuted} style={{ flexShrink: 0 }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats..."
              style={styles.searchInput}
            />
          </div>
        )}

        <div style={styles.conversationList}>
          {sorted.length === 0 && (
            <div style={{ fontSize: 13, color: styles.palette.textMuted, padding: "8px 8px" }}>
              No chats match "{query}".
            </div>
          )}

          {sorted.map((c) => (
            <div
              key={c.id}
              style={{
                ...styles.conversationItem,
                ...(c.id === activeId ? styles.conversationItemActive : {}),
              }}
              className="zp-conv-item"
            >
              {editingId === c.id ? (
                <input
                  autoFocus
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleEditKeyDown}
                  maxLength={60}
                  style={styles.renameInput}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <button
                  style={{ ...styles.conversationItemButton, opacity: disabled ? 0.5 : 1 }}
                  onClick={() => onSwitch(c.id)}
                  disabled={disabled}
                >
                  <MessageSquare size={14} color={styles.palette.textMuted} style={{ flexShrink: 0 }} />
                  <span style={styles.conversationItemLabel}>{c.title}</span>
                </button>
              )}

              {editingId !== c.id && (
                <div className="zp-conv-actions" style={styles.conversationActions}>
                  <button
                    style={styles.conversationIconButton}
                    onClick={(e) => startEditing(e, c)}
                    disabled={disabled}
                    aria-label="Rename conversation"
                    title="Rename"
                  >
                    <Pencil size={13} color={styles.palette.textMuted} />
                  </button>
                  <button
                    style={styles.conversationIconButton}
                    onClick={(e) => handleDeleteClick(e, c.id)}
                    disabled={disabled}
                    aria-label="Delete conversation"
                    title={confirmDeleteId === c.id ? "Click again to confirm" : "Delete"}
                  >
                    <Trash2 size={13} color={confirmDeleteId === c.id ? styles.palette.errorText : styles.palette.textMuted} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

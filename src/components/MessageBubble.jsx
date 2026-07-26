import { useState } from "react";
import { FileText, Check, Copy, Pencil, RotateCcw } from "lucide-react";
import { renderMarkdown } from "../lib/markdown.jsx";

export function MessageBubble({ styles, role, content, streaming, attachmentName, isImage, imageData, imageMimeType, sources, onRegenerate, onEdit, disabled, dataSaver }) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail — fail silently, no "copied" confirmation shown.
    }
  }

  function startEdit() {
    setDraft(content);
    setEditing(true);
  }

  function saveEdit() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== content.trim()) {
      onEdit(draft);
    }
  }

  function handleEditKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  }

  return (
    <div
      className="zp-msg-wrap"
      style={{ alignSelf: role === "user" ? "flex-end" : "flex-start", maxWidth: "80%" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {attachmentName && (
        <div style={styles.attachmentChip}>
          {isImage && imageData ? (
            <img src={`data:${imageMimeType};base64,${imageData}`} alt="" style={styles.attachmentThumb} />
          ) : (
            <FileText size={12} style={{ flexShrink: 0 }} />
          )}
          <span style={styles.conversationItemLabel}>{attachmentName}</span>
        </div>
      )}

      {editing ? (
        <div style={{ ...styles.bubble, ...styles.userBubble, maxWidth: "100%", padding: 0 }}>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleEditKeyDown}
            style={styles.editTextarea}
            rows={Math.min(6, draft.split("\n").length + 1)}
          />
          <div style={styles.editActionsRow}>
            <button onClick={() => setEditing(false)} style={styles.editCancelButton}>
              Cancel
            </button>
            <button onClick={saveEdit} style={styles.editSaveButton}>
              Save & submit
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            ...styles.bubble,
            maxWidth: "100%",
            ...(role === "user" ? styles.userBubble : styles.assistantBubble),
          }}
        >
          {/* User messages are shown as plain text (they typed it, no need
              to interpret markdown). Assistant replies get full rendering,
              plus a blinking cursor while more text is still arriving. */}
          {role === "user" ? (
            content
          ) : (
            <>
              {renderMarkdown(content, styles)}
              {streaming && (dataSaver ? <span>▍</span> : <span className="zp-cursor" />)}
            </>
          )}
        </div>
      )}

      {/* Shown only when Gemini actually searched the web for this reply
          — not every message has this, only ones where live search
          genuinely helped answer the question. */}
      {!streaming && !editing && sources && sources.length > 0 && (
        <div style={styles.sourcesList}>
          <div style={styles.sourcesLabel}>Sources</div>
          {sources.map((s, i) => (
            <a
              key={i}
              href={s.uri}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.sourceLink}
            >
              {i + 1}. {s.title}
            </a>
          ))}
        </div>
      )}

      {/* Actions don't make sense on a reply that's still streaming in, or
          while editing (Save/Cancel above already cover that). */}
      {!streaming && !editing && (
        <div
          className="zp-msg-actions"
          style={{
            display: "flex",
            gap: 4,
            justifyContent: role === "user" ? "flex-end" : "flex-start",
            height: 22,
            marginTop: 2,
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.15s",
          }}
        >
          <button
            onClick={handleCopy}
            style={styles.actionButton}
            aria-label="Copy message"
            title="Copy"
          >
            {copied ? (
              <Check size={13} color={styles.palette.accent} />
            ) : (
              <Copy size={13} color={styles.palette.textMuted} />
            )}
          </button>

          {onEdit && (
            <button
              onClick={startEdit}
              disabled={disabled}
              style={{ ...styles.actionButton, opacity: disabled ? 0.4 : 1 }}
              aria-label="Edit message"
              title="Edit"
            >
              <Pencil size={13} color={styles.palette.textMuted} />
            </button>
          )}

          {onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={disabled}
              style={{ ...styles.actionButton, opacity: disabled ? 0.4 : 1 }}
              aria-label="Regenerate response"
              title="Regenerate"
            >
              <RotateCcw size={13} color={styles.palette.textMuted} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

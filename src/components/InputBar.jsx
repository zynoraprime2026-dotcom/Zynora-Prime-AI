import { useRef, useEffect } from "react";
import { AlertTriangle, FileText, Paperclip, ArrowUp } from "lucide-react";

export function InputBar({
  styles,
  input,
  setInput,
  status,
  onSend,
  pendingAttachment,
  onRemoveAttachment,
  onFileSelected,
  attachError,
  onDismissAttachError,
}) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-grow the textarea as the user types a longer message, capped
  // at ~5 lines so it can't take over the screen.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const canSend = (input.trim() || pendingAttachment) && status === "idle";

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!canSend) return;
      onSend();
    }
  }

  function handleFileInputChange(e) {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
    e.target.value = ""; // allow re-selecting the same file later
  }

  return (
    <div className="zp-input-bar-wrap" style={styles.inputBarWrap}>
      {attachError && (
        <div style={styles.attachError}>
          <AlertTriangle size={13} color={styles.palette.errorText} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{attachError}</span>
          <button
            onClick={onDismissAttachError}
            style={styles.dismissButton}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {pendingAttachment && (
        <div style={styles.attachmentChip}>
          {pendingAttachment.kind === "image" ? (
            <img
              src={`data:${pendingAttachment.imageMimeType};base64,${pendingAttachment.imageData}`}
              alt=""
              style={styles.attachmentThumb}
            />
          ) : (
            <FileText size={12} style={{ flexShrink: 0 }} />
          )}
          <span style={styles.conversationItemLabel}>{pendingAttachment.name}</span>
          <button
            onClick={onRemoveAttachment}
            style={{ ...styles.dismissButton, marginLeft: 2 }}
            aria-label="Remove attachment"
          >
            ×
          </button>
        </div>
      )}

      <div style={styles.inputBar}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.docx,.png,.jpg,.jpeg,.webp,.gif"
          onChange={handleFileInputChange}
          style={{ display: "none" }}
        />
        <button
          style={styles.attachButton}
          onClick={() => fileInputRef.current?.click()}
          disabled={status !== "idle"}
          aria-label="Attach a document or image"
          title="Attach .txt, .md, .docx, or an image"
        >
          <Paperclip size={17} color={styles.palette.textMuted} />
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Zynora Prime..."
          rows={1}
          style={styles.textarea}
        />
        <button
          style={{
            ...styles.sendButton,
            opacity: canSend ? 1 : 0.35,
          }}
          disabled={!canSend}
          onClick={onSend}
          aria-label="Send"
        >
          <ArrowUp size={17} color={styles.palette.accentText} />
        </button>
      </div>
    </div>
  );
}

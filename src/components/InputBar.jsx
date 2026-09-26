import { useRef, useEffect, useState } from "react";
import { AlertTriangle, FileText, Paperclip, ArrowUp, Mic, Square } from "lucide-react";
import { speechLocaleFor } from "../lib/constants";

export function InputBar({
  styles,
  input,
  setInput,
  status,
  onSend,
  replyLanguage,
  pendingAttachment,
  onRemoveAttachment,
  onFileSelected,
  attachError,
  onDismissAttachError,
}) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  // Voice dictation via the browser's built-in SpeechRecognition API.
  // Hidden entirely on browsers that don't support it (Safari pre-14.1,
  // Firefox desktop) — no broken button shown.
  const [voiceSupported] = useState(
    () =>
      typeof window !== "undefined" &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
  const [listening, setListening] = useState(false);

  useEffect(() => {
    return () => {
      // Never leave the mic recording if the bar unmounts mid-session.
      try { recognitionRef.current?.stop(); } catch {}
    };
  }, []);

  function toggleVoice() {
    if (listening) {
      try { recognitionRef.current?.stop(); } catch {}
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    const locale = speechLocaleFor(replyLanguage);
    if (locale) rec.lang = locale; // no locale set → device default
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let transcript = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) transcript += e.results[i][0].transcript;
      }
      transcript = transcript.trim();
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

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
          placeholder={listening ? "Listening… speak now" : "Message Zynora Prime..."}
          rows={1}
          style={styles.textarea}
        />
        {voiceSupported && (
          <button
            style={{
              ...styles.attachButton,
              ...(listening ? { boxShadow: `0 0 0 2px ${styles.palette.accent}` } : {}),
            }}
            onClick={toggleVoice}
            aria-label={listening ? "Stop dictation" : "Dictate a message"}
            title={listening ? "Stop dictation" : "Dictate a message"}
          >
            {listening ? (
              <Square size={15} color={styles.palette.accent} />
            ) : (
              <Mic size={17} color={styles.palette.textMuted} />
            )}
          </button>
        )}
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

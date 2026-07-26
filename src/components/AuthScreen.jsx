import { useState, useEffect } from "react";
import { X } from "lucide-react";

// A simple centered modal, not a full-page gate — the app works fine
// without an account (chats just stay local to this device). This is
// only for the person who chooses to sign in.
export function AuthScreen({ styles, open, onClose, mode, setMode, onSubmit, submitting, error, notice }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!open) {
      setEmail("");
      setPassword("");
    }
  }, [open]);

  if (!open) return null;

  function handleSubmit() {
    if (!email.trim() || password.length < 6 || submitting) return;
    onSubmit(email.trim(), password);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <>
      <div style={styles.overlay} onClick={onClose} />
      <div style={styles.authModal}>
        <div style={styles.panelHeader}>
          <div style={styles.panelTitle}>{mode === "signup" ? "Create account" : "Log in"}</div>
          <button style={styles.iconButton} onClick={onClose} aria-label="Close">
            <X size={18} color={styles.palette.textMuted} />
          </button>
        </div>

        {notice && <div style={styles.authNotice}>{notice}</div>}
        {error && <div style={styles.authErrorText}>{error}</div>}

        {/* Deliberately not a <form onSubmit> — sandboxed iframes (like
            the one artifacts render in) commonly block native form
            submission silently: no error, no console warning, the click
            just does nothing. Wiring the button directly to onClick, and
            Enter-to-submit via onKeyDown, uses plain synthetic events
            that don't depend on form-submit semantics at all. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Email"
            style={styles.textInput}
            autoComplete="email"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Password (min 6 characters)"
            style={styles.textInput}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
          <button
            onClick={handleSubmit}
            style={{ ...styles.newChatButton, opacity: submitting ? 0.6 : 1 }}
            disabled={submitting}
          >
            {submitting ? "Please wait…" : mode === "signup" ? "Sign up" : "Log in"}
          </button>
        </div>

        <button
          style={styles.authSwitchLink}
          onClick={() => setMode(mode === "signup" ? "login" : "signup")}
        >
          {mode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
        </button>
      </div>
    </>
  );
}

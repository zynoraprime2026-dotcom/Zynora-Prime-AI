import { useState, useEffect } from "react";
import { X, Moon, Sun, Download, MessageSquare, Trash2 } from "lucide-react";
import { LANGUAGES } from "../lib/constants";

// Slide-in panel from the right with sections: account, install,
// theme, data saver, reply language, profile name, export/share,
// feedback, and clear chat. "Clear chat" needs a second tap to confirm
// (avoids an accidental wipe from a single misclick) rather than
// relying on a browser confirm() dialog.
export function SettingsPanel({
  styles,
  open,
  onClose,
  theme,
  setTheme,
  profileName,
  setProfileName,
  onClearChat,
  onExportChat,
  onShareChat,
  onWhatsAppFeedback,
  hasMessages,
  dataSaver,
  setDataSaver,
  replyLanguage,
  setReplyLanguage,
  session,
  onOpenAuth,
  onLogOut,
  isInstalled,
  isIOS,
  canInstall,
  onInstallClick,
}) {
  const [confirmingClear, setConfirmingClear] = useState(false);

  // Reset the confirm step whenever the panel closes, so it doesn't
  // stay armed the next time it's opened.
  useEffect(() => {
    if (!open) setConfirmingClear(false);
  }, [open]);

  function handleClearClick() {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    onClearChat();
    setConfirmingClear(false);
  }

  if (!open) return null;

  return (
    <>
      <div style={styles.overlay} onClick={onClose} />
      <div style={styles.panel}>
        <div style={styles.panelHeader}>
          <div style={styles.panelTitle}>Settings</div>
          <button style={styles.iconButton} onClick={onClose} aria-label="Close settings">
            <X size={18} color={styles.palette.textMuted} />
          </button>
        </div>

        {/* Account */}
        <div style={styles.panelSection}>
          <div style={styles.panelLabel}>Account</div>
          {session ? (
            <>
              <div style={{ fontSize: 13, color: styles.palette.textMuted, marginBottom: 6 }}>
                Signed in as {session.email}
              </div>
              <button style={styles.secondaryButton} onClick={onLogOut}>
                Log out
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: styles.palette.textMuted, marginBottom: 6 }}>
                Chats are only saved on this device. Sign in to keep them backed up to your account.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...styles.secondaryButton, flex: 1 }} onClick={() => onOpenAuth("login")}>
                  Log in
                </button>
                <button style={{ ...styles.newChatButton, flex: 1 }} onClick={() => onOpenAuth("signup")}>
                  Sign up
                </button>
              </div>
            </>
          )}
        </div>

        {/* Install to home screen — hidden entirely once already
            installed, since there's nothing useful to show then. */}
        {!isInstalled && (canInstall || isIOS) && (
          <div style={styles.panelSection}>
            <div style={styles.panelLabel}>Install app</div>
            {canInstall ? (
              <>
                <div style={{ fontSize: 12.5, color: styles.palette.textMuted, marginBottom: 6 }}>
                  Add Zynora Prime to your home screen for quick access, like a regular app.
                </div>
                <button style={styles.newChatButton} onClick={onInstallClick}>
                  Add to Home Screen
                </button>
              </>
            ) : (
              // iOS has no programmatic install prompt — the only way is
              // the manual Share sheet, so we give clear step-by-step text.
              <div style={{ fontSize: 12.5, color: styles.palette.textMuted, lineHeight: 1.6 }}>
                To install: tap the <strong>Share</strong> icon in Safari's toolbar, then
                <strong> "Add to Home Screen."</strong>
              </div>
            )}
          </div>
        )}

        {/* Theme */}
        <div style={styles.panelSection}>
          <div style={styles.panelLabel}>Theme</div>
          <div style={styles.themeToggle}>
            <button
              style={{
                ...styles.themeOption,
                ...(theme === "dark" ? styles.themeOptionActive : {}),
              }}
              onClick={() => setTheme("dark")}
            >
              <Moon size={14} /> Dark
            </button>
            <button
              style={{
                ...styles.themeOption,
                ...(theme === "light" ? styles.themeOptionActive : {}),
              }}
              onClick={() => setTheme("light")}
            >
              <Sun size={14} /> Light
            </button>
          </div>
        </div>

        {/* Data saver */}
        <div style={styles.panelSection}>
          <div style={styles.panelLabel}>Data saver</div>
          <button
            style={{
              ...styles.toggleRow,
              ...(dataSaver ? styles.toggleRowActive : {}),
            }}
            onClick={() => setDataSaver(!dataSaver)}
            aria-pressed={dataSaver}
          >
            <span>Shorter replies, no fonts, fewer animations</span>
            <span style={{ ...styles.toggleSwitch, ...(dataSaver ? styles.toggleSwitchOn : {}) }}>
              <span style={{ ...styles.toggleKnob, ...(dataSaver ? styles.toggleKnobOn : {}) }} />
            </span>
          </button>
        </div>

        {/* Reply language */}
        <div style={styles.panelSection}>
          <div style={styles.panelLabel}>Reply language</div>
          <select
            value={replyLanguage}
            onChange={(e) => setReplyLanguage(e.target.value)}
            style={styles.textInput}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* Profile */}
        <div style={styles.panelSection}>
          <div style={styles.panelLabel}>Profile name</div>
          <input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="Your name (optional)"
            style={styles.textInput}
            maxLength={40}
          />
        </div>

        {/* Export / Share */}
        <div style={styles.panelSection}>
          <div style={styles.panelLabel}>This chat</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{ ...styles.secondaryButton, flex: 1, width: "auto", opacity: hasMessages ? 1 : 0.4 }}
              onClick={onExportChat}
              disabled={!hasMessages}
            >
              <Download size={14} /> Export
            </button>
            <button
              style={{ ...styles.secondaryButton, flex: 1, width: "auto", opacity: hasMessages ? 1 : 0.4 }}
              onClick={onShareChat}
              disabled={!hasMessages}
            >
              <MessageSquare size={14} /> Share via WhatsApp
            </button>
          </div>
        </div>

        {/* Feedback */}
        <div style={styles.panelSection}>
          <div style={styles.panelLabel}>Feedback</div>
          <div style={{ fontSize: 12.5, color: styles.palette.textMuted, marginBottom: 6 }}>
            Found a bug, or something you'd like to see? Message directly.
          </div>
          <button style={styles.secondaryButton} onClick={onWhatsAppFeedback}>
            <MessageSquare size={14} /> Send feedback via WhatsApp
          </button>
        </div>

        {/* Clear chat */}
        <div style={styles.panelSection}>
          <div style={styles.panelLabel}>Danger zone</div>
          <button
            style={{
              ...styles.dangerButton,
              opacity: hasMessages ? 1 : 0.4,
            }}
            onClick={handleClearClick}
            disabled={!hasMessages}
          >
            <Trash2 size={14} />
            {confirmingClear ? "Tap again to confirm" : "Clear this chat"}
          </button>
        </div>
      </div>
    </>
  );
}

import { Menu, Settings } from "lucide-react";

export function Header({ styles, isOnline, onOpenSidebar, onOpenSettings }) {
  return (
    <div className="zp-header" style={styles.header}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button style={styles.iconButton} aria-label="Open chat list" onClick={onOpenSidebar}>
          <Menu size={18} color={styles.palette.textMuted} />
        </button>
        <div>
          <div style={styles.brand}>
            ZYNORA <span style={{ color: styles.palette.accent }}>PRIME</span>
          </div>
          <div style={styles.tagline}>Intelligent with Purpose</div>
        </div>
        {!isOnline && (
          <span style={styles.offlineBadge} title="No internet connection">
            Offline
          </span>
        )}
      </div>
      <button style={styles.iconButton} aria-label="Open settings" onClick={onOpenSettings}>
        <Settings size={18} color={styles.palette.textMuted} />
      </button>
    </div>
  );
}

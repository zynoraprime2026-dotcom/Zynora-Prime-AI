import { AlertTriangle } from "lucide-react";

export function ErrorBanner({ styles, error, onDismiss }) {
  return (
    <div style={styles.errorBanner}>
      <AlertTriangle size={15} color={styles.palette.errorText} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.4 }}>{error.message}</div>
      <button onClick={error.retry} style={styles.retryButton}>
        Retry
      </button>
      <button onClick={onDismiss} style={styles.dismissButton} aria-label="Dismiss error">
        ×
      </button>
    </div>
  );
}

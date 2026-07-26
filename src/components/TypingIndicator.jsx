export function TypingIndicator({ styles, dataSaver }) {
  // Data saver also means "lite mode" — skip the running CSS animation
  // to save a bit of CPU/battery on lower-end devices, not just data.
  if (dataSaver) {
    return (
      <div style={{ ...styles.bubble, ...styles.assistantBubble, color: styles.palette.textMuted, fontSize: 13.5 }}>
        Thinking…
      </div>
    );
  }
  return (
    <div style={{ ...styles.bubble, ...styles.assistantBubble, display: "flex", flexDirection: "row", gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: styles.palette.textMuted,
            animation: "typing-bounce 1s infinite",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

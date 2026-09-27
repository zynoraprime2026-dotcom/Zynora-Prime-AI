// Shared text-to-speech helpers — used by Talk Mode in App.jsx and the
// per-message "listen" button in MessageBubble. Markdown symbols would be
// read out literally ("star star bold"), so they're stripped down to
// something natural to hear.
export function speakableText(md) {
  return md
    .replace(/```[\s\S]*?```/g, " code block. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[*_~#>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Speaks `text` aloud. Resolves when the speech finishes, is cancelled,
// or the browser has no speech synthesis — always safe to await.
export function speakText(text, locale) {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(speakableText(text));
    if (locale) {
      utterance.lang = locale;
      const match = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang && v.lang.toLowerCase().startsWith(locale.slice(0, 2)));
      if (match) utterance.voice = match;
    }
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

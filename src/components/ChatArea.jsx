import { useRef, useEffect } from "react";
import { MessageBubble } from "./MessageBubble.jsx";
import { TypingIndicator } from "./TypingIndicator.jsx";
import { ErrorBanner } from "./ErrorBanner.jsx";

// Tappable starter prompts shown on the welcome screen. Each one is a
// complete question, so one tap starts a real conversation — the goal is
// that a first-time user never faces an empty box wondering what to type.
const STARTER_CARDS = [
  {
    icon: "🕌",
    label: "Teach me Arabic",
    hint: "Start the alphabet and basic words",
    prompt: "Teach me the Arabic alphabet, starting with the first letters and their sounds.",
  },
  {
    icon: "✍️",
    label: "Write for me",
    hint: "Letters, emails and applications",
    prompt: "Help me write a formal letter. Ask me what it is for first.",
  },
  {
    icon: "📱",
    label: "Explain Ghana life",
    hint: "MoMo charges, NHIS, school fees",
    prompt: "Explain how Mobile Money charges work in Ghana and how I can reduce them.",
  },
  {
    icon: "📅",
    label: "Plan my day",
    hint: "A simple schedule that works",
    prompt: "Help me plan my day. Ask me what I need to get done first.",
  },
];

export function ChatArea({
  styles,
  messages,
  status,
  error,
  onRegenerate,
  onEditMessage,
  onDismissError,
  profileName,
  dataSaver,
  replyLanguage,
  onSuggestion,
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status, error]);

  const isEmpty = messages.length === 0;

  return (
    <div ref={scrollRef} className="zp-chat" style={styles.chatArea}>
      {isEmpty && !error && (
        <div style={styles.welcome}>
          <div style={styles.welcomeBrand}>Zynora Prime</div>
          <div style={styles.welcomeTagline}>Intelligence with purpose</div>
          <div style={styles.welcomeGreeting}>
            Ahlan wa sahlan{profileName ? `, ${profileName}` : ""}! Speak, type or tap below — I answer in English,
            Twi, Hausa, Arabic and 25+ languages, with voice replies.
          </div>
          <div style={styles.suggestionGrid}>
            {STARTER_CARDS.map((card) => (
              <button
                key={card.label}
                style={{
                  ...styles.suggestionCard,
                  ...(status !== "idle" ? { opacity: 0.45, cursor: "default" } : {}),
                }}
                disabled={status !== "idle" || !onSuggestion}
                onClick={() => onSuggestion?.(card.prompt)}
                aria-label={card.label}
              >
                <span style={{ fontSize: 17 }}>{card.icon}</span>
                <div style={styles.suggestionCardLabel}>{card.label}</div>
                <div style={styles.suggestionCardHint}>{card.hint}</div>
              </button>
            ))}
          </div>
          <div style={{ ...styles.welcomeGreeting, marginTop: 18, fontSize: 12 }}>
            Tip: tap 📎 to ask about a photo or document, or the mic buttons to speak instead of typing.
          </div>
        </div>
      )}

      {messages.map((m, i) => {
        // A streamed assistant reply that hasn't received its first token
        // yet shows the bouncing-dots indicator instead of an empty bubble.
        if (m.role === "assistant" && m.content === "" && m.streaming) {
          return <TypingIndicator key={i} styles={styles} dataSaver={dataSaver} />;
        }
        // An assistant message that finished with no content at all (rare,
        // but possible) isn't worth rendering as an empty bubble.
        if (m.role === "assistant" && m.content === "" && !m.streaming) {
          return null;
        }
        return (
          <MessageBubble
            key={i}
            styles={styles}
            role={m.role}
            content={m.content}
            streaming={!!m.streaming}
            attachmentName={m.attachmentName}
            isImage={m.isImage}
            imageData={m.imageData}
            imageMimeType={m.imageMimeType}
            sources={m.sources}
            onRegenerate={m.role === "assistant" ? () => onRegenerate(i) : undefined}
            onEdit={m.role === "user" ? (newContent) => onEditMessage(i, newContent) : undefined}
            disabled={status !== "idle"}
            dataSaver={dataSaver}
            replyLanguage={replyLanguage}
          />
        );
      })}

      {error && <ErrorBanner styles={styles} error={error} onDismiss={onDismissError} />}
    </div>
  );
}

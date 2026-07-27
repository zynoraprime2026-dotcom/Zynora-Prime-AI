import { useRef, useEffect } from "react";
import { MessageBubble } from "./MessageBubble.jsx";
import { TypingIndicator } from "./TypingIndicator.jsx";
import { ErrorBanner } from "./ErrorBanner.jsx";

export function ChatArea({ styles, messages, status, error, onRegenerate, onEditMessage, onDismissError, profileName, dataSaver }) {
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
        <div style={{ ...styles.bubble, ...styles.assistantBubble }}>
          Hey{profileName ? ` ${profileName}` : ""}! I'm Zynora Prime — the intelligence with purpose. Ask me anything.
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
          />
        );
      })}

      {error && <ErrorBanner styles={styles} error={error} onDismiss={onDismissError} />}
    </div>
  );
}

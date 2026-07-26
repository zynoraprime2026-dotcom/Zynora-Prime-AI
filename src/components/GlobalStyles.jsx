export function GlobalStyles({ palette, dataSaver }) {
  return (
    <style>{`
      ${
        dataSaver
          ? "/* Data saver: skipping web font download, using system fonts instead */"
          : "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');"
      }
      * { box-sizing: border-box; }
      ::-webkit-scrollbar { width: 6px; }
      ::-webkit-scrollbar-thumb { background: ${palette.borderMuted}; border-radius: 3px; }

      @keyframes typing-bounce {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
        30% { transform: translateY(-4px); opacity: 1; }
      }

      @keyframes panel-slide-in {
        from { transform: translateX(100%); }
        to { transform: translateX(0); }
      }

      @keyframes sidebar-slide-in {
        from { transform: translateX(-100%); }
        to { transform: translateX(0); }
      }

      @keyframes cursor-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }

      .zp-cursor {
        display: inline-block;
        width: 2px;
        height: 14px;
        background: ${palette.accent};
        margin-left: 2px;
        vertical-align: text-bottom;
        animation: cursor-blink 0.8s step-start infinite;
      }

      @media (max-width: 480px) {
        .zp-header, .zp-chat, .zp-input-bar-wrap { padding-left: 14px !important; padding-right: 14px !important; }
      }

      @media (hover: none) {
        .zp-chat button[aria-label="Copy message"],
        .zp-chat button[aria-label="Regenerate response"] {
          opacity: 1 !important;
        }
        .zp-conv-actions {
          opacity: 1 !important;
        }
      }

      /* Keyboard users: tabbing into a message's action buttons should
         reveal them the same way mouse hover does. */
      .zp-msg-wrap:focus-within .zp-msg-actions {
        opacity: 1 !important;
      }

      .zp-conv-item:hover .zp-conv-actions,
      .zp-conv-item:focus-within .zp-conv-actions {
        opacity: 1 !important;
      }

      button:disabled {
        cursor: not-allowed !important;
      }
    `}</style>
  );
}

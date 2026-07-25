// Storage keys. Each conversation's messages live under their own key
// (conversationMessagesKey) rather than one giant blob, so switching
// chats only ever reads/writes the one conversation that changed.
export const CONVERSATIONS_KEY = "zynora-prime:conversations"; // [{ id, title, updatedAt }]
export const ACTIVE_CONVERSATION_KEY = "zynora-prime:active-conversation"; // just an id
export const SETTINGS_KEY = "zynora-prime:settings";
export const LEGACY_MESSAGES_KEY = "zynora-prime:messages"; // pre-multi-chat storage, migrated on first load
export const conversationMessagesKey = (id) => `zynora-prime:conversation:${id}`;

// ---------- Supabase (auth only, for now) ----------
// This environment can't import the official supabase-js SDK (only a
// fixed set of libraries is available here), but Supabase's auth system
// is a plain REST API underneath, so we talk to it directly with fetch.
// No SDK needed for what we're doing.
export const SUPABASE_URL = "https://pxoyzzhevezuthfxwkut.supabase.co";
// Digits only, country code first, no "+" — this is the exact format
// WhatsApp's wa.me click-to-chat links require.
export const WHATSAPP_FEEDBACK_NUMBER = "233541821537";
export const SUPABASE_ANON_KEY = "sb_publishable_wiI3cLY3UJe9nPk-J_VE0A_JKRNGUKO";
export const SESSION_KEY = "zynora-prime:session"; // { accessToken, refreshToken, expiresAt, userId, email }

// Two palettes. Every color the UI uses comes from one of these, so
// switching themes never means hunting through JSX for stray hex codes.
export const PALETTES = {
  dark: {
    bg: "#0B0E1A",
    surface: "#141827",
    border: "#1F2637",
    borderMuted: "#263047",
    text: "#E8EAF2",
    textMuted: "#8891A8",
    accent: "#5EEAD4",
    accentText: "#0B0E1A",
    userBubble: "#7C6FFF",
    userText: "#0B0E1A",
    headerBorder: "#1A2035",
    errorBg: "#1D1620",
    errorBorder: "#3A2430",
    errorText: "#F87171",
    overlay: "rgba(0,0,0,0.5)",
  },
  light: {
    bg: "#F4F5F9",
    surface: "#FFFFFF",
    border: "#E4E7F0",
    borderMuted: "#D9DDE8",
    text: "#171A26",
    textMuted: "#6B7182",
    accent: "#0F9E90",
    accentText: "#FFFFFF",
    userBubble: "#6D5EF5",
    userText: "#FFFFFF",
    headerBorder: "#E7E9F2",
    errorBg: "#FDEDEC",
    errorBorder: "#F3C6C4",
    errorText: "#C0392B",
    overlay: "rgba(0,0,0,0.25)",
  },
};

// Reply language options. "auto" (default) means Claude just matches
// whatever language the person writes in, same as normal. The rest are
// widely-spoken languages across Africa plus a few common global ones,
// so someone can pin a specific reply language if auto-detection isn't
// giving them what they want.
export const LANGUAGES = [
  { code: "auto", label: "Auto-detect" },
  { code: "English", label: "English" },
  { code: "Swahili", label: "Kiswahili" },
  { code: "Hausa", label: "Hausa" },
  { code: "Yoruba", label: "Yorùbá" },
  { code: "Igbo", label: "Igbo" },
  { code: "Amharic", label: "አማርኛ (Amharic)" },
  { code: "French", label: "Français" },
  { code: "Arabic", label: "العربية (Arabic)" },
  { code: "Portuguese", label: "Português" },
  { code: "Zulu", label: "isiZulu" },
];

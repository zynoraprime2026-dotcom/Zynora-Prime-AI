import { useState, useRef, useEffect, useMemo } from "react";
import {
  Settings,
  ArrowUp,
  Copy,
  Check,
  RotateCcw,
  AlertTriangle,
  X,
  Sun,
  Moon,
  Trash2,
  Menu,
  Plus,
  MessageSquare,
  Pencil,
  Search,
  Download,
  Paperclip,
  FileText,
} from "lucide-react";

// ============================================================
// ZYNORA PRIME — v1
// A single-file, real-time AI chatbot: responsive layout, live Claude
// API calls, local persistence (including multiple saved chats), copy/
// regenerate, error handling with retry, and a settings panel (theme,
// profile name, clear chat).
//
// File map:
//   PALETTES / getStyles()  — all design tokens, keyed by theme
//   ZynoraPrime()           — top-level state + orchestration
//   streamClaudeAPI()       — the one function that talks to the API
//   Header / Sidebar / ChatArea / MessageBubble / TypingIndicator
//   ErrorBanner / InputBar / SettingsPanel — presentational components
// ============================================================

// Storage keys. Each conversation's messages live under their own key
// (conversationMessagesKey) rather than one giant blob, so switching
// chats only ever reads/writes the one conversation that changed.
const CONVERSATIONS_KEY = "zynora-prime:conversations"; // [{ id, title, updatedAt }]
const ACTIVE_CONVERSATION_KEY = "zynora-prime:active-conversation"; // just an id
const SETTINGS_KEY = "zynora-prime:settings";
const LEGACY_MESSAGES_KEY = "zynora-prime:messages"; // pre-multi-chat storage, migrated on first load
const conversationMessagesKey = (id) => `zynora-prime:conversation:${id}`;

// ---------- Supabase (auth only, for now) ----------
// This environment can't import the official supabase-js SDK (only a
// fixed set of libraries is available here), but Supabase's auth system
// is a plain REST API underneath, so we talk to it directly with fetch.
// No SDK needed for what we're doing.
const SUPABASE_URL = "https://pxoyzzhevezuthfxwkut.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_wiI3cLY3UJe9nPk-J_VE0A_JKRNGUKO";
const SESSION_KEY = "zynora-prime:session"; // { accessToken, refreshToken, expiresAt, userId, email }

async function supabaseSignUp(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || data.error || "Sign up failed.");
  return data; // has access_token/refresh_token if email confirmation is off; otherwise just a user record
}

async function supabaseSignIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Login failed.");
  return data; // { access_token, refresh_token, expires_in, user }
}

async function supabaseRefreshSession(refreshToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Session refresh failed.");
  return data;
}

function genConversationId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// A new conversation is titled "New chat" until it has a first user
// message, at which point the title becomes a short snippet of that
// message — the same pattern most chat apps use.
function deriveTitle(messages) {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New chat";
  const flat = firstUser.content.trim().replace(/\s+/g, " ");
  return flat.length > 42 ? flat.slice(0, 42) + "…" : flat;
}

// Two palettes. Every color the UI uses comes from one of these, so
// switching themes never means hunting through JSX for stray hex codes.
const PALETTES = {
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
const LANGUAGES = [
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

export default function ZynoraPrime() {
  // All saved conversations, as lightweight metadata (not their messages —
  // those load on demand for whichever one is active).
  const [conversations, setConversations] = useState([]);
  // id of the conversation currently shown in the chat area
  const [activeId, setActiveId] = useState(null);
  // Message history for the active conversation only:
  // [{ role: "user" | "assistant", content: string, streaming?: boolean }]
  const [messages, setMessages] = useState([]);
  // Current text in the input box
  const [input, setInput] = useState("");
  // "idle" while waiting for user input, "streaming" while a reply is arriving
  const [status, setStatus] = useState("idle");
  // True once the initial load from storage finishes, so we don't
  // overwrite saved history/settings with the empty initial state.
  const [loaded, setLoaded] = useState(false);
  // { message: string, retry: () => void } | null
  const [error, setError] = useState(null);
  // "dark" | "light"
  const [theme, setTheme] = useState("dark");
  // Display name shown in the settings panel / greeting. Optional.
  const [profileName, setProfileName] = useState("");
  // Whether the settings panel is open
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Whether the chat-list sidebar is open
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // A document attached but not yet sent: { name, text } | null. Cleared
  // once the message carrying it is sent.
  const [pendingAttachment, setPendingAttachment] = useState(null);
  // Transient error from a failed file read/attach — separate from the
  // API `error` state since it has no "retry the request" meaning.
  const [attachError, setAttachError] = useState(null);
  // When on: shorter replies and no web font download, for people on
  // expensive or slow mobile data.
  const [dataSaver, setDataSaver] = useState(false);
  // "auto" (match whatever language the person writes in) or a fixed
  // language code the assistant should always reply in.
  const [replyLanguage, setReplyLanguage] = useState("auto");
  // Tracks actual network connectivity so a send attempt while offline
  // can fail fast with a clear message instead of hanging on a timeout,
  // and so a reconnect can automatically retry the last failed request.
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // When the connection comes back after an offline-caused error, retry
  // automatically rather than making the person notice and tap Retry
  // themselves. autoRetriedErrorRef prevents retrying the same error
  // object twice if this effect re-runs for an unrelated reason.
  const autoRetriedErrorRef = useRef(null);
  useEffect(() => {
    if (isOnline && error?.isOffline && autoRetriedErrorRef.current !== error) {
      autoRetriedErrorRef.current = error;
      error.retry();
    }
  }, [isOnline, error]);

  // ---- Account (Supabase auth) — separate from the local chat state
  // above. Signing in doesn't yet change where chats are stored; that's
  // the next step once login itself is confirmed working.
  // { accessToken, refreshToken, expiresAt, userId, email } | null
  const [session, setSession] = useState(null);
  const [authScreenOpen, setAuthScreenOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // "login" | "signup"
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authNotice, setAuthNotice] = useState(null); // e.g. "check your email to confirm"

  // Restore a saved session on mount, refreshing it first if it's
  // expired (access tokens are short-lived; refresh tokens last much
  // longer, so this is normal and doesn't require logging in again).
  useEffect(() => {
    async function restoreSession() {
      try {
        const result = await window.storage.get(SESSION_KEY);
        if (!result?.value) return;
        const saved = JSON.parse(result.value);
        if (Date.now() < saved.expiresAt - 60000) {
          setSession(saved);
        } else {
          const refreshed = await supabaseRefreshSession(saved.refreshToken);
          const next = {
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token,
            expiresAt: Date.now() + refreshed.expires_in * 1000,
            userId: refreshed.user.id,
            email: refreshed.user.email,
          };
          setSession(next);
          window.storage.set(SESSION_KEY, JSON.stringify(next)).catch(() => {});
        }
      } catch {
        // No saved session, or refresh failed (e.g. revoked) — just stay
        // logged out rather than showing an error for something this routine.
        window.storage.delete(SESSION_KEY).catch(() => {});
      }
    }
    restoreSession();
  }, []);

  // Keep the session alive: schedule a refresh a minute before it expires,
  // rather than waiting for a request to fail and reacting after the fact.
  useEffect(() => {
    if (!session) return;
    const msUntilRefresh = session.expiresAt - Date.now() - 60000;
    const timer = setTimeout(async () => {
      try {
        const refreshed = await supabaseRefreshSession(session.refreshToken);
        const next = {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          expiresAt: Date.now() + refreshed.expires_in * 1000,
          userId: refreshed.user.id,
          email: refreshed.user.email,
        };
        setSession(next);
        window.storage.set(SESSION_KEY, JSON.stringify(next)).catch(() => {});
      } catch {
        // Refresh token expired or was revoked — sign out cleanly instead
        // of leaving a broken session sitting around.
        setSession(null);
        window.storage.delete(SESSION_KEY).catch(() => {});
      }
    }, Math.max(msUntilRefresh, 0));
    return () => clearTimeout(timer);
  }, [session]);

  async function handleAuthSubmit(email, password) {
    setAuthError(null);
    setAuthNotice(null);
    setAuthSubmitting(true);
    try {
      if (authMode === "signup") {
        const data = await supabaseSignUp(email, password);
        if (data.access_token) {
          // Email confirmation is off — signed in immediately.
          const next = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + data.expires_in * 1000,
            userId: data.user.id,
            email: data.user.email,
          };
          setSession(next);
          window.storage.set(SESSION_KEY, JSON.stringify(next)).catch(() => {});
          setAuthScreenOpen(false);
        } else {
          // Email confirmation is on — no session yet until they click the link.
          setAuthNotice("Account created. Check your email to confirm before logging in.");
          setAuthMode("login");
        }
      } else {
        const data = await supabaseSignIn(email, password);
        const next = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + data.expires_in * 1000,
          userId: data.user.id,
          email: data.user.email,
        };
        setSession(next);
        window.storage.set(SESSION_KEY, JSON.stringify(next)).catch(() => {});
        setAuthScreenOpen(false);
      }
    } catch (err) {
      setAuthError(err.message || "Something went wrong. Please try again.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  function handleLogOut() {
    setSession(null);
    window.storage.delete(SESSION_KEY).catch(() => {});
  }

  const palette = PALETTES[theme];
  // getStyles() builds a fairly large object of style tokens — memoize
  // it so that only a theme change triggers a rebuild, not every
  // keystroke or message update.
  const styles = useMemo(() => getStyles(palette), [theme]);

  // Load everything once on mount: settings, the conversation list, and
  // the active conversation's messages. If no conversations exist yet
  // but old single-chat data does (from before this feature existed),
  // migrate it into a first conversation instead of losing it.
  useEffect(() => {
    async function load() {
      try {
        const result = await window.storage.get(SETTINGS_KEY);
        if (result?.value) {
          const saved = JSON.parse(result.value);
          if (saved.theme) setTheme(saved.theme);
          if (saved.profileName) setProfileName(saved.profileName);
          if (typeof saved.dataSaver === "boolean") setDataSaver(saved.dataSaver);
          if (saved.replyLanguage) setReplyLanguage(saved.replyLanguage);
        }
      } catch {
        // No saved settings yet — expected on first run.
      }

      let convList = [];
      try {
        const result = await window.storage.get(CONVERSATIONS_KEY);
        if (result?.value) convList = JSON.parse(result.value);
      } catch {
        // No conversation list yet — expected on first run.
      }

      let active = null;
      try {
        const result = await window.storage.get(ACTIVE_CONVERSATION_KEY);
        if (result?.value) active = JSON.parse(result.value);
      } catch {
        // No active conversation saved yet.
      }

      if (convList.length === 0) {
        let legacyMessages = [];
        try {
          const result = await window.storage.get(LEGACY_MESSAGES_KEY);
          if (result?.value) legacyMessages = JSON.parse(result.value);
        } catch {
          // No legacy data — expected for a genuinely new user.
        }

        const id = genConversationId();
        convList = [{ id, title: deriveTitle(legacyMessages), updatedAt: Date.now() }];
        active = id;
        await window.storage
          .set(conversationMessagesKey(id), JSON.stringify(legacyMessages))
          .catch(() => {});
        await window.storage.set(CONVERSATIONS_KEY, JSON.stringify(convList)).catch(() => {});
        await window.storage.set(ACTIVE_CONVERSATION_KEY, JSON.stringify(active)).catch(() => {});
        setMessages(legacyMessages);
      } else {
        if (!active || !convList.some((c) => c.id === active)) active = convList[0].id;
        let msgs = [];
        try {
          const result = await window.storage.get(conversationMessagesKey(active));
          if (result?.value) msgs = JSON.parse(result.value);
        } catch {
          // Shouldn't normally happen (the conversation is in the list),
          // but fall back to an empty chat rather than crashing.
        }
        setMessages(msgs);
      }

      setConversations(convList);
      setActiveId(active);
      setLoaded(true);
    }
    load();
  }, []);

  // Save the active conversation's messages whenever they change, and
  // keep that conversation's title/timestamp in the list up to date
  // (the title only gets set once, from "New chat" to a snippet of the
  // first user message — later edits don't keep re-titling it).
  //
  // Skipped while status === "streaming": a streamed reply updates
  // `messages` on every single token, and writing to storage that often
  // both wastes calls and risks the storage rate limit on a long reply.
  // The final save happens naturally once streaming finishes and status
  // flips back to "idle".
  useEffect(() => {
    if (!loaded || !activeId || status === "streaming") return;
    window.storage.set(conversationMessagesKey(activeId), JSON.stringify(messages)).catch(() => {});
    setConversations((prev) => {
      const updated = prev.map((c) =>
        c.id === activeId && !c.manuallyTitled
          ? { ...c, title: c.title === "New chat" ? deriveTitle(messages) : c.title, updatedAt: Date.now() }
          : c.id === activeId
          ? { ...c, updatedAt: Date.now() }
          : c
      );
      window.storage.set(CONVERSATIONS_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, [messages, loaded, activeId, status]);

  // Save settings (theme + profile name + data saver + reply language) whenever they change.
  useEffect(() => {
    if (!loaded) return;
    window.storage
      .set(SETTINGS_KEY, JSON.stringify({ theme, profileName, dataSaver, replyLanguage }))
      .catch(() => {});
  }, [theme, profileName, dataSaver, replyLanguage, loaded]);

  // Streams a reply into messages[index] one token at a time. Shared by
  // both sending a new message and regenerating an old one, so retry
  // logic and error handling only need to exist once. `apiHistory` is
  // what gets sent to Claude; `index` is where the streamed reply lands
  // in the messages array (kept stable across the whole stream so
  // updates never race with re-renders).
  function runStream(apiHistory, index) {
    // Fail fast with a clear message instead of waiting on a fetch that's
    // just going to time out — and mark it isOffline so the reconnect
    // effect below knows it's safe to retry automatically.
    if (!navigator.onLine) {
      setStatus("idle");
      setMessages((prev) => {
        if (!prev[index]) return prev;
        const copy = [...prev];
        copy[index] = { ...copy[index], streaming: false };
        return copy;
      });
      setError({
        message: "You're offline. This will retry automatically once your connection returns.",
        isOffline: true,
        retry: () => {
          setMessages((prev) => {
            if (!prev[index]) return prev;
            const copy = [...prev];
            copy[index] = { role: "assistant", content: "", streaming: true };
            return copy;
          });
          runStream(apiHistory, index);
        },
      });
      return;
    }

    setStatus("streaming");
    setError(null);

    streamClaudeAPI(apiHistory, profileName, dataSaver, replyLanguage, (deltaText) => {
      setMessages((prev) => {
        if (!prev[index]) return prev;
        const copy = [...prev];
        copy[index] = { ...copy[index], content: copy[index].content + deltaText };
        return copy;
      });
    })
      .then(() => {
        setStatus("idle");
        setMessages((prev) => {
          if (!prev[index]) return prev;
          const copy = [...prev];
          copy[index] = { ...copy[index], streaming: false };
          return copy;
        });
      })
      .catch(() => {
        setStatus("idle");
        // Mark whatever partial text arrived as no-longer-streaming rather
        // than discarding it — if the connection dropped mid-reply, the
        // user can still see what came through before hitting Retry.
        setMessages((prev) => {
          if (!prev[index]) return prev;
          const copy = [...prev];
          copy[index] = { ...copy[index], streaming: false };
          return copy;
        });
        setError({
          message: "Couldn't reach Zynora Prime. Check your connection and try again.",
          isOffline: !navigator.onLine,
          retry: () => {
            setMessages((prev) => {
              if (!prev[index]) return prev;
              const copy = [...prev];
              copy[index] = { role: "assistant", content: "", streaming: true };
              return copy;
            });
            runStream(apiHistory, index);
          },
        });
      });
  }

  function handleSend() {
    const content = input.trim();
    if (!content && !pendingAttachment) return; // nothing to send

    const userMessage = pendingAttachment
      ? {
          role: "user",
          content: content || "Please look at the attached document.",
          attachmentName: pendingAttachment.name,
          attachmentText: pendingAttachment.text,
        }
      : { role: "user", content };

    const nextMessages = [...messages, userMessage];
    const placeholderIndex = nextMessages.length; // where the streamed reply will land
    setMessages([...nextMessages, { role: "assistant", content: "", streaming: true }]);
    setInput("");
    setPendingAttachment(null);

    runStream(nextMessages, placeholderIndex);
  }

  // Reads a .txt/.md file directly, or extracts text from a .docx via
  // mammoth (loaded on demand — see note below). PDFs aren't supported
  // here — this app runs client-side with no server, and reliable PDF
  // text extraction needs a library that isn't available in that
  // environment. Converting a PDF to .docx or .txt first works around
  // that.
  async function handleFileSelected(file) {
    setAttachError(null);
    const ext = file.name.split(".").pop().toLowerCase();
    const MAX_CHARS = 15000;

    try {
      let text;
      if (ext === "txt" || ext === "md") {
        text = await file.text();
      } else if (ext === "docx") {
        // Imported dynamically, only when actually needed, rather than
        // as a static top-level import — a static import that fails to
        // resolve can block the entire app from loading, not just the
        // .docx feature. A dynamic import here fails locally instead.
        let mammoth;
        try {
          mammoth = (await import("mammoth")).default;
        } catch {
          setAttachError("Couldn't load the .docx reader. Try .txt or .md instead.");
          return;
        }
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else if (ext === "pdf") {
        setAttachError("PDFs aren't supported yet — try converting to .docx or .txt first.");
        return;
      } else {
        setAttachError("Unsupported file type. Use .txt, .md, or .docx.");
        return;
      }

      if (!text || !text.trim()) {
        setAttachError("Couldn't find any text in that file.");
        return;
      }

      const truncated = text.length > MAX_CHARS;
      setPendingAttachment({
        name: file.name,
        text: truncated ? text.slice(0, MAX_CHARS) + "\n\n[content truncated]" : text,
      });
    } catch {
      setAttachError("Couldn't read that file. It may be corrupted or password-protected.");
    }
  }

  function handleRegenerate(index) {
    const historyUpToPrompt = messages.slice(0, index);
    if (historyUpToPrompt.length === 0) return;

    setMessages((prev) => {
      const copy = [...prev];
      copy[index] = { role: "assistant", content: "", streaming: true };
      return copy;
    });

    runStream(historyUpToPrompt, index);
  }

  // Editing a past user message discards everything after it (the old
  // assistant reply and any later turns no longer make sense once the
  // prompt that led to them has changed) and streams a fresh reply,
  // same as sending a brand new message.
  function handleEditMessage(index, newContent) {
    const trimmed = newContent.trim();
    if (!trimmed) return;

    const editedMessage = { ...messages[index], content: trimmed };
    const nextMessages = [...messages.slice(0, index), editedMessage];
    const placeholderIndex = nextMessages.length;
    setMessages([...nextMessages, { role: "assistant", content: "", streaming: true }]);
    setError(null);

    runStream(nextMessages, placeholderIndex);
  }

  function handleClearChat() {
    setMessages([]);
    setError(null);
  }

  // Note: switching, creating, or deleting a conversation is disabled
  // (via `disabled={status !== "idle"}` on the Sidebar) whenever a reply
  // is streaming. A stream writes into `messages` by array index, not by
  // conversation id — if the active conversation changed mid-stream,
  // those writes would land in the new chat instead of the old one.
  // Blocking the switch is far simpler than teaching the stream to
  // detect and abort on a conversation change.

  function handleNewChat() {
    const id = genConversationId();
    const newConv = { id, title: "New chat", updatedAt: Date.now() };
    setConversations((prev) => {
      const updated = [newConv, ...prev];
      window.storage.set(CONVERSATIONS_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    setActiveId(id);
    window.storage.set(ACTIVE_CONVERSATION_KEY, JSON.stringify(id)).catch(() => {});
    setMessages([]);
    setInput("");
    setError(null);
    setSidebarOpen(false);
  }

  async function handleSwitchConversation(id) {
    if (id === activeId) {
      setSidebarOpen(false);
      return;
    }
    setActiveId(id);
    window.storage.set(ACTIVE_CONVERSATION_KEY, JSON.stringify(id)).catch(() => {});
    setInput("");
    setError(null);
    try {
      const result = await window.storage.get(conversationMessagesKey(id));
      setMessages(result?.value ? JSON.parse(result.value) : []);
    } catch {
      setMessages([]);
    }
    setSidebarOpen(false);
  }

  async function handleDeleteConversation(id) {
    const remaining = conversations.filter((c) => c.id !== id);
    window.storage.delete(conversationMessagesKey(id)).catch(() => {});

    if (remaining.length === 0) {
      // Always leave at least one conversation to land in.
      const newId = genConversationId();
      const fresh = [{ id: newId, title: "New chat", updatedAt: Date.now() }];
      setConversations(fresh);
      window.storage.set(CONVERSATIONS_KEY, JSON.stringify(fresh)).catch(() => {});
      setActiveId(newId);
      window.storage.set(ACTIVE_CONVERSATION_KEY, JSON.stringify(newId)).catch(() => {});
      setMessages([]);
    } else {
      setConversations(remaining);
      window.storage.set(CONVERSATIONS_KEY, JSON.stringify(remaining)).catch(() => {});
      if (id === activeId) {
        const nextActive = remaining[0].id;
        setActiveId(nextActive);
        window.storage.set(ACTIVE_CONVERSATION_KEY, JSON.stringify(nextActive)).catch(() => {});
        try {
          const result = await window.storage.get(conversationMessagesKey(nextActive));
          setMessages(result?.value ? JSON.parse(result.value) : []);
        } catch {
          setMessages([]);
        }
      }
    }
    setError(null);
  }

  // Renaming sets a manual title and marks it so the auto-title-from-
  // first-message logic (in the save effect above) never overwrites it.
  function handleRenameConversation(id, newTitle) {
    const trimmed = newTitle.trim();
    if (!trimmed) return; // ignore attempts to rename to a blank title
    setConversations((prev) => {
      const updated = prev.map((c) =>
        c.id === id ? { ...c, title: trimmed, manuallyTitled: true } : c
      );
      window.storage.set(CONVERSATIONS_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }

  // Downloads the active conversation as a plain-text file the person
  // can keep or share outside the app.
  function handleExportChat() {
    const title = conversations.find((c) => c.id === activeId)?.title || "Zynora Prime chat";
    const lines = [`# ${title}`, ""];
    for (const m of messages) {
      const speaker = m.role === "user" ? "You" : "Zynora Prime";
      lines.push(`${speaker}:`, m.content, "");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^\w\- ]/g, "").slice(0, 60) || "zynora-prime-chat"}.txt`;
    // Some browsers (Safari, several Android WebViews) only fire the
    // download if the anchor is actually attached to the document —
    // clicking a detached element silently does nothing there.
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div style={styles.app}>
      <GlobalStyles palette={palette} dataSaver={dataSaver} />
      <Header
        styles={styles}
        isOnline={isOnline}
        onOpenSidebar={() => {
          setSettingsOpen(false);
          setSidebarOpen(true);
        }}
        onOpenSettings={() => {
          setSidebarOpen(false);
          setSettingsOpen(true);
        }}
      />
      <ChatArea
        styles={styles}
        messages={messages}
        status={status}
        error={error}
        onRegenerate={handleRegenerate}
        onEditMessage={handleEditMessage}
        onDismissError={() => setError(null)}
        profileName={profileName}
        dataSaver={dataSaver}
      />
      <InputBar
        styles={styles}
        input={input}
        setInput={setInput}
        status={status}
        onSend={handleSend}
        pendingAttachment={pendingAttachment}
        onRemoveAttachment={() => setPendingAttachment(null)}
        onFileSelected={handleFileSelected}
        attachError={attachError}
        onDismissAttachError={() => setAttachError(null)}
      />
      <Sidebar
        styles={styles}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        activeId={activeId}
        onSwitch={handleSwitchConversation}
        onNew={handleNewChat}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
        disabled={status !== "idle"}
      />
      <SettingsPanel
        styles={styles}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        setTheme={setTheme}
        profileName={profileName}
        setProfileName={setProfileName}
        onClearChat={handleClearChat}
        onExportChat={handleExportChat}
        hasMessages={messages.length > 0}
        dataSaver={dataSaver}
        setDataSaver={setDataSaver}
        replyLanguage={replyLanguage}
        setReplyLanguage={setReplyLanguage}
        session={session}
        onOpenAuth={(mode) => {
          setAuthMode(mode);
          setAuthError(null);
          setAuthNotice(null);
          setSettingsOpen(false);
          setAuthScreenOpen(true);
        }}
        onLogOut={handleLogOut}
      />
      <AuthScreen
        styles={styles}
        open={authScreenOpen}
        onClose={() => setAuthScreenOpen(false)}
        mode={authMode}
        setMode={setAuthMode}
        onSubmit={handleAuthSubmit}
        submitting={authSubmitting}
        error={authError}
        notice={authNotice}
      />
    </div>
  );
}

// ---------- Claude API call (streaming) ----------
// Reads the response as Server-Sent Events and calls onDelta(text) for
// each token as it arrives, instead of waiting for the full reply.

// A message with an attached document keeps its display text (m.content)
// separate from what's actually sent to the API — the API gets the full
// document text prepended, but the chat bubble just shows a small chip
// plus whatever the person typed.
function toApiContent(m) {
  if (m.attachmentText) {
    return `Document "${m.attachmentName}":\n\n${m.attachmentText}\n\n---\n\n${m.content}`;
  }
  return m.content;
}

// Builds the system prompt from independent pieces (base behavior, name,
// data saver, reply language) so each setting can be toggled without the
// others needing separate hardcoded prompt variants.
function buildSystemPrompt(profileName, dataSaver, replyLanguage) {
  let prompt = "You are Zynora Prime, a helpful, friendly general-purpose assistant.";

  if (profileName && profileName.trim()) {
    prompt += ` The person you're talking to is named ${profileName.trim()} — address them by name naturally sometimes (not in every message), the way a person who knows them would.`;
  }

  if (dataSaver) {
    prompt +=
      " The person is on a data saver connection — keep replies as brief as possible while still being useful, and avoid long examples unless asked.";
  } else {
    prompt += " Keep replies clear and concise unless asked for depth.";
  }

  if (replyLanguage && replyLanguage !== "auto") {
    prompt += ` Always reply in ${replyLanguage}, regardless of what language the person writes in, unless they explicitly ask you to switch.`;
  }

  return prompt;
}

async function streamClaudeAPI(history, profileName, dataSaver, replyLanguage, onDelta) {
  // Streaming needs ReadableStream support in fetch, which isn't
  // guaranteed on older Android WebViews/browsers — exactly the kind of
  // device this app is meant to work well on. Feature-detect up front
  // and request a plain (non-streaming) reply instead of breaking.
  const supportsStreaming = typeof ReadableStream !== "undefined";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      // Data saver caps replies shorter — fewer tokens streamed means
      // less data used on expensive or slow mobile connections.
      max_tokens: dataSaver ? 400 : 1000,
      system: buildSystemPrompt(profileName, dataSaver, replyLanguage),
      messages: history.map((m) => ({ role: m.role, content: toApiContent(m) })),
      stream: supportsStreaming,
    }),
  });

  if (!response.ok) throw new Error("API request failed");

  // Fallback path: no streaming support (or the body came back unreadable
  // for some other reason) — get the full reply at once and deliver it
  // as a single chunk. The UI already handles this fine, since it just
  // appends whatever text arrives; it'll simply appear all at once
  // instead of token by token.
  if (!supportsStreaming || !response.body) {
    const data = await response.json();
    const textBlock = data.content?.find((b) => b.type === "text");
    const fullText = textBlock ? textBlock.text : "I didn't catch that — could you rephrase?";
    onDelta(fullText);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // last entry may be a partial line — keep it for the next chunk

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue; // ignore "event:" lines and blank lines

      const jsonStr = trimmed.slice(5).trim();
      let event;
      try {
        event = JSON.parse(jsonStr);
      } catch {
        continue; // skip any malformed/partial event rather than crashing the stream
      }

      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        onDelta(event.delta.text);
      }
    }
  }
}

// ---------- Header ----------
function Header({ styles, isOnline, onOpenSidebar, onOpenSettings }) {
  return (
    <div className="zp-header" style={styles.header}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button style={styles.iconButton} aria-label="Open chat list" onClick={onOpenSidebar}>
          <Menu size={18} color={styles.palette.textMuted} />
        </button>
        <div style={styles.brand}>
          ZYNORA <span style={{ color: styles.palette.accent }}>PRIME</span>
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

// ---------- Chat area ----------
function ChatArea({ styles, messages, status, error, onRegenerate, onEditMessage, onDismissError, profileName, dataSaver }) {
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
          Hey{profileName ? ` ${profileName}` : ""}! I'm Zynora Prime. Ask me anything.
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

// ---------- Markdown rendering ----------
// No markdown library is available to import in this environment, so
// this is a small hand-rolled renderer covering what AI replies
// actually use: fenced code blocks, inline code, bold, italic, links,
// and bullet/numbered lists. It intentionally does NOT try to support
// the full CommonMark spec — tables, nested lists, images, etc. are
// out of scope for a chat bubble.

// Turns inline markdown (bold/italic/code/links) within one line of
// text into an array of strings/React nodes.
function renderInline(text, styles, keyPrefix) {
  // Single combined pattern, checked in priority order: inline code
  // first (so markdown chars inside `code` aren't touched), then
  // links, then bold, then italic.
  const pattern = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  const nodes = [];
  let lastIndex = 0;
  let match;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} style={styles.inlineCode}>
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      nodes.push(
        <a key={key} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" style={styles.link}>
          {linkMatch[1]}
        </a>
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

// Turns a full message string into an array of block-level React nodes:
// fenced code blocks, headers, lists, and paragraphs.
function renderMarkdown(content, styles) {
  const lines = content.split("\n");
  const blocks = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block: ```lang ... ```
    if (line.trim().startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(
        <pre key={key++} style={styles.codeBlock}>
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // Headers: #, ##, ###
    const headerMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const size = level === 1 ? 18 : level === 2 ? 16.5 : 15.5;
      blocks.push(
        <div key={key++} style={{ fontWeight: 700, fontSize: size, margin: "4px 0" }}>
          {renderInline(headerMatch[2], styles, `h${key}`)}
        </div>
      );
      i++;
      continue;
    }

    // List block: consecutive "- "/"* " or "1. " lines
    const isBullet = (l) => /^\s*[-*]\s+/.test(l);
    const isNumbered = (l) => /^\s*\d+\.\s+/.test(l);
    if (isBullet(line) || isNumbered(line)) {
      const ordered = isNumbered(line);
      const items = [];
      while (i < lines.length && (ordered ? isNumbered(lines[i]) : isBullet(lines[i]))) {
        const itemText = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "");
        items.push(<li key={key++}>{renderInline(itemText, styles, `li${key}`)}</li>);
        i++;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag key={key++} style={styles.list}>
          {items}
        </ListTag>
      );
      continue;
    }

    // Blank line: skip (acts as paragraph separator)
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: consecutive non-empty, non-special lines
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("```") &&
      !isBullet(lines[i]) &&
      !isNumbered(lines[i]) &&
      !/^#{1,3}\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <div key={key++} style={{ margin: 0 }}>
        {paraLines.map((l, idx) => (
          <span key={idx}>
            {renderInline(l, styles, `p${key}-${idx}`)}
            {idx < paraLines.length - 1 && <br />}
          </span>
        ))}
      </div>
    );
  }

  return blocks;
}

// ---------- Message bubble ----------
function MessageBubble({ styles, role, content, streaming, attachmentName, onRegenerate, onEdit, disabled, dataSaver }) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail — fail silently, no "copied" confirmation shown.
    }
  }

  function startEdit() {
    setDraft(content);
    setEditing(true);
  }

  function saveEdit() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== content.trim()) {
      onEdit(draft);
    }
  }

  function handleEditKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  }

  return (
    <div
      className="zp-msg-wrap"
      style={{ alignSelf: role === "user" ? "flex-end" : "flex-start", maxWidth: "80%" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {attachmentName && (
        <div style={styles.attachmentChip}>
          <FileText size={12} style={{ flexShrink: 0 }} />
          <span style={styles.conversationItemLabel}>{attachmentName}</span>
        </div>
      )}

      {editing ? (
        <div style={{ ...styles.bubble, ...styles.userBubble, maxWidth: "100%", padding: 0 }}>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleEditKeyDown}
            style={styles.editTextarea}
            rows={Math.min(6, draft.split("\n").length + 1)}
          />
          <div style={styles.editActionsRow}>
            <button onClick={() => setEditing(false)} style={styles.editCancelButton}>
              Cancel
            </button>
            <button onClick={saveEdit} style={styles.editSaveButton}>
              Save & submit
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            ...styles.bubble,
            maxWidth: "100%",
            ...(role === "user" ? styles.userBubble : styles.assistantBubble),
          }}
        >
          {/* User messages are shown as plain text (they typed it, no need
              to interpret markdown). Assistant replies get full rendering,
              plus a blinking cursor while more text is still arriving. */}
          {role === "user" ? (
            content
          ) : (
            <>
              {renderMarkdown(content, styles)}
              {streaming && (dataSaver ? <span>▍</span> : <span className="zp-cursor" />)}
            </>
          )}
        </div>
      )}

      {/* Actions don't make sense on a reply that's still streaming in, or
          while editing (Save/Cancel above already cover that). */}
      {!streaming && !editing && (
        <div
          className="zp-msg-actions"
          style={{
            display: "flex",
            gap: 4,
            justifyContent: role === "user" ? "flex-end" : "flex-start",
            height: 22,
            marginTop: 2,
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.15s",
          }}
        >
          <button
            onClick={handleCopy}
            style={styles.actionButton}
            aria-label="Copy message"
            title="Copy"
          >
            {copied ? (
              <Check size={13} color={styles.palette.accent} />
            ) : (
              <Copy size={13} color={styles.palette.textMuted} />
            )}
          </button>

          {onEdit && (
            <button
              onClick={startEdit}
              disabled={disabled}
              style={{ ...styles.actionButton, opacity: disabled ? 0.4 : 1 }}
              aria-label="Edit message"
              title="Edit"
            >
              <Pencil size={13} color={styles.palette.textMuted} />
            </button>
          )}

          {onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={disabled}
              style={{ ...styles.actionButton, opacity: disabled ? 0.4 : 1 }}
              aria-label="Regenerate response"
              title="Regenerate"
            >
              <RotateCcw size={13} color={styles.palette.textMuted} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Typing indicator ----------
function TypingIndicator({ styles, dataSaver }) {
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

// ---------- Error banner ----------
function ErrorBanner({ styles, error, onDismiss }) {
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

// ---------- Input bar ----------
function InputBar({
  styles,
  input,
  setInput,
  status,
  onSend,
  pendingAttachment,
  onRemoveAttachment,
  onFileSelected,
  attachError,
  onDismissAttachError,
}) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-grow the textarea as the user types a longer message, capped
  // at ~5 lines so it can't take over the screen.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const canSend = (input.trim() || pendingAttachment) && status === "idle";

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!canSend) return;
      onSend();
    }
  }

  function handleFileInputChange(e) {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
    e.target.value = ""; // allow re-selecting the same file later
  }

  return (
    <div className="zp-input-bar-wrap" style={styles.inputBarWrap}>
      {attachError && (
        <div style={styles.attachError}>
          <AlertTriangle size={13} color={styles.palette.errorText} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{attachError}</span>
          <button
            onClick={onDismissAttachError}
            style={styles.dismissButton}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {pendingAttachment && (
        <div style={styles.attachmentChip}>
          <FileText size={12} style={{ flexShrink: 0 }} />
          <span style={styles.conversationItemLabel}>{pendingAttachment.name}</span>
          <button
            onClick={onRemoveAttachment}
            style={{ ...styles.dismissButton, marginLeft: 2 }}
            aria-label="Remove attachment"
          >
            ×
          </button>
        </div>
      )}

      <div style={styles.inputBar}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.docx"
          onChange={handleFileInputChange}
          style={{ display: "none" }}
        />
        <button
          style={styles.attachButton}
          onClick={() => fileInputRef.current?.click()}
          disabled={status !== "idle"}
          aria-label="Attach a document"
          title="Attach .txt, .md, or .docx"
        >
          <Paperclip size={17} color={styles.palette.textMuted} />
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Zynora Prime..."
          rows={1}
          style={styles.textarea}
        />
        <button
          style={{
            ...styles.sendButton,
            opacity: canSend ? 1 : 0.35,
          }}
          disabled={!canSend}
          onClick={onSend}
          aria-label="Send"
        >
          <ArrowUp size={17} color={styles.palette.accentText} />
        </button>
      </div>
    </div>
  );
}

// ---------- Sidebar (chat list) ----------
// Slide-in panel from the left listing saved conversations, newest
// first, with a search box to filter by title and inline renaming.
// Deleting a conversation needs a second tap on the same item to
// confirm, same pattern as "Clear chat" in the settings panel.
function Sidebar({ styles, open, onClose, conversations, activeId, onSwitch, onNew, onDelete, onRename, disabled }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  // Reset transient UI state (confirm/search/edit) every time the
  // sidebar closes, so it doesn't reopen mid-edit or mid-confirm later.
  useEffect(() => {
    if (!open) {
      setConfirmDeleteId(null);
      setQuery("");
      setEditingId(null);
    }
  }, [open]);

  function handleDeleteClick(e, id) {
    e.stopPropagation();
    if (confirmDeleteId === id) {
      onDelete(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
    }
  }

  function startEditing(e, c) {
    e.stopPropagation();
    setEditingId(c.id);
    setEditingValue(c.title);
  }

  function commitEdit() {
    if (editingId) onRename(editingId, editingValue);
    setEditingId(null);
  }

  function handleEditKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      setEditingId(null);
    }
  }

  if (!open) return null;

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(query.trim().toLowerCase())
  );
  const sorted = [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      <div style={styles.overlay} onClick={onClose} />
      <div style={styles.sidebar}>
        <div style={styles.panelHeader}>
          <div style={styles.panelTitle}>Chats</div>
          <button style={styles.iconButton} onClick={onClose} aria-label="Close chat list">
            <X size={18} color={styles.palette.textMuted} />
          </button>
        </div>

        <button
          style={{ ...styles.newChatButton, opacity: disabled ? 0.5 : 1 }}
          onClick={onNew}
          disabled={disabled}
        >
          <Plus size={15} /> New chat
        </button>

        {conversations.length > 5 && (
          <div style={styles.searchWrap}>
            <Search size={14} color={styles.palette.textMuted} style={{ flexShrink: 0 }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats..."
              style={styles.searchInput}
            />
          </div>
        )}

        <div style={styles.conversationList}>
          {sorted.length === 0 && (
            <div style={{ fontSize: 13, color: styles.palette.textMuted, padding: "8px 8px" }}>
              No chats match "{query}".
            </div>
          )}

          {sorted.map((c) => (
            <div
              key={c.id}
              style={{
                ...styles.conversationItem,
                ...(c.id === activeId ? styles.conversationItemActive : {}),
              }}
              className="zp-conv-item"
            >
              {editingId === c.id ? (
                <input
                  autoFocus
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleEditKeyDown}
                  maxLength={60}
                  style={styles.renameInput}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <button
                  style={{ ...styles.conversationItemButton, opacity: disabled ? 0.5 : 1 }}
                  onClick={() => onSwitch(c.id)}
                  disabled={disabled}
                >
                  <MessageSquare size={14} color={styles.palette.textMuted} style={{ flexShrink: 0 }} />
                  <span style={styles.conversationItemLabel}>{c.title}</span>
                </button>
              )}

              {editingId !== c.id && (
                <div className="zp-conv-actions" style={styles.conversationActions}>
                  <button
                    style={styles.conversationIconButton}
                    onClick={(e) => startEditing(e, c)}
                    disabled={disabled}
                    aria-label="Rename conversation"
                    title="Rename"
                  >
                    <Pencil size={13} color={styles.palette.textMuted} />
                  </button>
                  <button
                    style={styles.conversationIconButton}
                    onClick={(e) => handleDeleteClick(e, c.id)}
                    disabled={disabled}
                    aria-label="Delete conversation"
                    title={confirmDeleteId === c.id ? "Click again to confirm" : "Delete"}
                  >
                    <Trash2 size={13} color={confirmDeleteId === c.id ? styles.palette.errorText : styles.palette.textMuted} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}


// ---------- Auth screen (login / sign up) ----------
// A simple centered modal, not a full-page gate — the app works fine
// without an account (chats just stay local to this device). This is
// only for the person who chooses to sign in.
function AuthScreen({ styles, open, onClose, mode, setMode, onSubmit, submitting, error, notice }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState(null); // { generalOk, supabaseOk, detail } | null

  useEffect(() => {
    if (!open) {
      setEmail("");
      setPassword("");
      setDiagResult(null);
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

  // Tests two things at once: can this artifact reach ANY outside
  // website at all, and can it specifically reach the Supabase project?
  // This tells us whether "Failed to fetch" is a general sandbox
  // restriction (both fail) or something specific to this Supabase
  // project/URL (only the second one fails) — without needing to leave
  // Claude or set anything up elsewhere.
  async function runDiagnostic() {
    setDiagRunning(true);
    setDiagResult(null);
    let generalOk = false;
    let supabaseOk = false;
    let detail = "";

    try {
      await fetch("https://jsonplaceholder.typicode.com/todos/1");
      generalOk = true;
    } catch (err) {
      detail += `General fetch failed: ${err.message}. `;
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: SUPABASE_ANON_KEY },
      });
      if (res.ok) {
        supabaseOk = true;
      } else {
        detail += `Supabase responded with status ${res.status}. `;
      }
    } catch (err) {
      detail += `Supabase fetch failed: ${err.message}.`;
    }

    setDiagResult({ generalOk, supabaseOk, detail });
    setDiagRunning(false);
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

        {/* Diagnostic — temporary tool to figure out why sign-up/login
            might fail to reach the network at all. Safe to remove once
            we know the cause. */}
        <div style={{ borderTop: `1px solid ${styles.palette.borderMuted}`, paddingTop: 12 }}>
          <button
            onClick={runDiagnostic}
            disabled={diagRunning}
            style={{ ...styles.secondaryButton, fontSize: 12.5, opacity: diagRunning ? 0.6 : 1 }}
          >
            {diagRunning ? "Testing connection…" : "Test connection"}
          </button>
          {diagResult && (
            <div style={{ fontSize: 12, marginTop: 8, color: styles.palette.textMuted, lineHeight: 1.5 }}>
              General internet: {diagResult.generalOk ? "✅ reachable" : "❌ blocked"}
              <br />
              Supabase project: {diagResult.supabaseOk ? "✅ reachable" : "❌ blocked"}
              {diagResult.detail && (
                <>
                  <br />
                  {diagResult.detail}
                </>
              )}
            </div>
          )}
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

// Slide-in panel from the right with three sections: theme, profile
// name, and clear chat. "Clear chat" needs a second tap to confirm
// (avoids an accidental wipe from a single misclick) rather than
// relying on a browser confirm() dialog.
function SettingsPanel({
  styles,
  open,
  onClose,
  theme,
  setTheme,
  profileName,
  setProfileName,
  onClearChat,
  onExportChat,
  hasMessages,
  dataSaver,
  setDataSaver,
  replyLanguage,
  setReplyLanguage,
  session,
  onOpenAuth,
  onLogOut,
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

        {/* Export */}
        <div style={styles.panelSection}>
          <div style={styles.panelLabel}>This chat</div>
          <button
            style={{ ...styles.secondaryButton, opacity: hasMessages ? 1 : 0.4 }}
            onClick={onExportChat}
            disabled={!hasMessages}
          >
            <Download size={14} /> Export as text file
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

// ---------- Global styles ----------
function GlobalStyles({ palette, dataSaver }) {
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

// ---------- Style tokens ----------
// Generated from a palette so theme switching restyles the whole app
// from this one function instead of scattered hex codes in JSX.
function getStyles(palette) {
  return {
    palette,
    app: {
      fontFamily: "'Inter', sans-serif",
      background: palette.bg,
      color: palette.text,
      height: "100vh",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      position: "relative",
    },
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "16px 24px",
      borderBottom: `1px solid ${palette.headerBorder}`,
      flexShrink: 0,
    },
    brand: {
      fontFamily: "'Space Grotesk', sans-serif",
      fontWeight: 700,
      fontSize: 18,
      letterSpacing: "0.02em",
    },
    offlineBadge: {
      fontSize: 11,
      fontWeight: 600,
      color: palette.errorText,
      border: `1px solid ${palette.errorText}`,
      borderRadius: 6,
      padding: "2px 7px",
      letterSpacing: "0.03em",
    },
    iconButton: {
      background: "transparent",
      border: `1px solid ${palette.borderMuted}`,
      borderRadius: 8,
      width: 34,
      height: 34,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
    },
    chatArea: {
      flex: 1,
      overflowY: "auto",
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      maxWidth: 720,
      width: "100%",
      margin: "0 auto",
    },
    bubble: {
      maxWidth: "80%",
      padding: "11px 15px",
      fontSize: 14.5,
      lineHeight: 1.5,
      borderRadius: 14,
      whiteSpace: "pre-wrap",
    },
    assistantBubble: {
      alignSelf: "flex-start",
      background: palette.surface,
      border: `1px solid ${palette.border}`,
      borderBottomLeftRadius: 4,
      color: palette.text,
      display: "flex",
      flexDirection: "column",
      gap: 2,
    },
    userBubble: {
      alignSelf: "flex-end",
      background: palette.userBubble,
      color: palette.userText,
      borderBottomRightRadius: 4,
    },
    actionButton: {
      background: "transparent",
      border: "none",
      cursor: "pointer",
      padding: 3,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    codeBlock: {
      background: palette.bg,
      border: `1px solid ${palette.border}`,
      borderRadius: 8,
      padding: "10px 12px",
      overflowX: "auto",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.5,
      margin: "6px 0",
    },
    inlineCode: {
      background: palette.bg,
      border: `1px solid ${palette.border}`,
      borderRadius: 4,
      padding: "1px 5px",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      fontSize: 13,
    },
    link: {
      color: palette.accent,
      textDecoration: "underline",
    },
    list: {
      margin: "4px 0",
      paddingLeft: 20,
      display: "flex",
      flexDirection: "column",
      gap: 2,
    },
    errorBanner: {
      alignSelf: "center",
      width: "100%",
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      background: palette.errorBg,
      border: `1px solid ${palette.errorBorder}`,
      color: palette.text,
      borderRadius: 12,
      padding: "10px 12px",
      marginTop: 4,
    },
    retryButton: {
      background: "transparent",
      border: `1px solid ${palette.errorText}`,
      color: palette.errorText,
      borderRadius: 8,
      padding: "3px 10px",
      fontSize: 12.5,
      cursor: "pointer",
      flexShrink: 0,
    },
    dismissButton: {
      background: "transparent",
      border: "none",
      color: palette.textMuted,
      cursor: "pointer",
      fontSize: 16,
      lineHeight: 1,
      padding: "0 2px",
      flexShrink: 0,
    },
    inputBarWrap: {
      padding: "12px 24px 20px",
      flexShrink: 0,
      maxWidth: 720,
      width: "100%",
      margin: "0 auto",
      boxSizing: "border-box",
    },
    inputBar: {
      width: "100%",
      display: "flex",
      alignItems: "flex-end",
      gap: 6,
      background: palette.surface,
      border: `1px solid ${palette.borderMuted}`,
      borderRadius: 16,
      padding: "8px 10px",
    },
    attachButton: {
      background: "transparent",
      border: "none",
      borderRadius: 10,
      width: 34,
      height: 34,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      flexShrink: 0,
    },
    attachmentChip: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      maxWidth: 220,
      background: palette.surface,
      border: `1px solid ${palette.borderMuted}`,
      borderRadius: 8,
      padding: "4px 8px",
      fontSize: 12,
      color: palette.textMuted,
      marginBottom: 6,
    },
    attachError: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 12.5,
      color: palette.errorText,
      marginBottom: 6,
    },
    editTextarea: {
      width: "100%",
      background: "transparent",
      border: "none",
      color: palette.userText,
      fontSize: 14.5,
      fontFamily: "'Inter', sans-serif",
      resize: "none",
      padding: "11px 15px",
    },
    editActionsRow: {
      display: "flex",
      justifyContent: "flex-end",
      gap: 8,
      padding: "0 10px 8px",
    },
    editCancelButton: {
      background: "transparent",
      border: "none",
      color: palette.userText,
      opacity: 0.75,
      fontSize: 12.5,
      cursor: "pointer",
      padding: "4px 6px",
    },
    editSaveButton: {
      background: "rgba(0,0,0,0.15)",
      border: "none",
      color: palette.userText,
      fontSize: 12.5,
      fontWeight: 600,
      borderRadius: 6,
      cursor: "pointer",
      padding: "4px 10px",
    },
    textarea: {
      flex: 1,
      background: "transparent",
      border: "none",
      color: palette.text,
      fontSize: 14.5,
      fontFamily: "'Inter', sans-serif",
      resize: "none",
      padding: "6px 0",
      maxHeight: 120,
      overflowY: "auto",
    },
    sendButton: {
      background: palette.accent,
      border: "none",
      borderRadius: 10,
      width: 34,
      height: 34,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      flexShrink: 0,
    },
    overlay: {
      position: "fixed",
      inset: 0,
      background: palette.overlay,
      zIndex: 10,
    },
    panel: {
      position: "fixed",
      top: 0,
      right: 0,
      height: "100%",
      width: "min(320px, 85vw)",
      background: palette.bg,
      borderLeft: `1px solid ${palette.border}`,
      zIndex: 11,
      padding: "20px",
      display: "flex",
      flexDirection: "column",
      gap: 24,
      animation: "panel-slide-in 0.2s ease-out",
      overflowY: "auto",
    },
    authModal: {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "min(360px, 88vw)",
      background: palette.bg,
      border: `1px solid ${palette.border}`,
      borderRadius: 16,
      zIndex: 21,
      padding: "20px",
      display: "flex",
      flexDirection: "column",
      gap: 16,
      maxHeight: "85vh",
      overflowY: "auto",
    },
    authNotice: {
      background: palette.surface,
      border: `1px solid ${palette.borderMuted}`,
      borderRadius: 8,
      padding: "8px 10px",
      fontSize: 12.5,
      color: palette.text,
    },
    authErrorText: {
      fontSize: 12.5,
      color: palette.errorText,
    },
    authSwitchLink: {
      background: "transparent",
      border: "none",
      color: palette.accent,
      fontSize: 12.5,
      cursor: "pointer",
      textAlign: "center",
      padding: "2px 0",
    },
    sidebar: {
      position: "fixed",
      top: 0,
      left: 0,
      height: "100%",
      width: "min(300px, 85vw)",
      background: palette.bg,
      borderRight: `1px solid ${palette.border}`,
      zIndex: 11,
      padding: "20px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
      animation: "sidebar-slide-in 0.2s ease-out",
      overflowY: "auto",
    },
    newChatButton: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      background: palette.accent,
      color: palette.accentText,
      border: "none",
      borderRadius: 10,
      padding: "9px 0",
      fontSize: 13.5,
      fontWeight: 600,
      cursor: "pointer",
      flexShrink: 0,
    },
    searchWrap: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      background: palette.surface,
      border: `1px solid ${palette.borderMuted}`,
      borderRadius: 10,
      padding: "7px 10px",
      flexShrink: 0,
    },
    searchInput: {
      flex: 1,
      background: "transparent",
      border: "none",
      color: palette.text,
      fontSize: 13,
      fontFamily: "'Inter', sans-serif",
      minWidth: 0,
    },
    conversationList: {
      display: "flex",
      flexDirection: "column",
      gap: 2,
      overflowY: "auto",
    },
    conversationItem: {
      display: "flex",
      alignItems: "center",
      borderRadius: 8,
    },
    conversationItemActive: {
      background: palette.surface,
    },
    conversationItemButton: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      gap: 8,
      background: "transparent",
      border: "none",
      color: palette.text,
      fontSize: 13.5,
      textAlign: "left",
      padding: "9px 8px",
      cursor: "pointer",
      minWidth: 0,
    },
    conversationItemLabel: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    renameInput: {
      flex: 1,
      background: palette.surface,
      border: `1px solid ${palette.accent}`,
      borderRadius: 6,
      color: palette.text,
      fontSize: 13.5,
      fontFamily: "'Inter', sans-serif",
      padding: "8px 8px",
      margin: "0 4px",
      minWidth: 0,
    },
    conversationActions: {
      display: "flex",
      gap: 2,
      flexShrink: 0,
      opacity: 0,
      transition: "opacity 0.15s",
    },
    conversationIconButton: {
      background: "transparent",
      border: "none",
      cursor: "pointer",
      padding: "6px 6px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    panelHeader: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    },
    panelTitle: {
      fontFamily: "'Space Grotesk', sans-serif",
      fontWeight: 700,
      fontSize: 17,
    },
    panelSection: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
    },
    panelLabel: {
      fontSize: 12,
      color: palette.textMuted,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      fontWeight: 600,
    },
    themeToggle: {
      display: "flex",
      gap: 8,
    },
    themeOption: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "9px 0",
      borderRadius: 10,
      border: `1px solid ${palette.borderMuted}`,
      background: "transparent",
      color: palette.textMuted,
      fontSize: 13.5,
      cursor: "pointer",
    },
    themeOptionActive: {
      borderColor: palette.accent,
      color: palette.text,
      background: palette.surface,
    },
    toggleRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      background: "transparent",
      border: `1px solid ${palette.borderMuted}`,
      borderRadius: 10,
      padding: "10px 12px",
      color: palette.text,
      fontSize: 13.5,
      cursor: "pointer",
      textAlign: "left",
    },
    toggleRowActive: {
      borderColor: palette.accent,
    },
    toggleSwitch: {
      width: 34,
      height: 20,
      borderRadius: 10,
      background: palette.borderMuted,
      position: "relative",
      flexShrink: 0,
      transition: "background 0.15s",
    },
    toggleSwitchOn: {
      background: palette.accent,
    },
    toggleKnob: {
      position: "absolute",
      top: 2,
      left: 2,
      width: 16,
      height: 16,
      borderRadius: "50%",
      background: palette.bg,
      transition: "transform 0.15s",
    },
    toggleKnobOn: {
      transform: "translateX(14px)",
    },
    textInput: {
      background: palette.surface,
      border: `1px solid ${palette.borderMuted}`,
      borderRadius: 10,
      padding: "9px 12px",
      color: palette.text,
      fontSize: 14,
      fontFamily: "'Inter', sans-serif",
    },
    dangerButton: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      background: "transparent",
      border: `1px solid ${palette.errorText}`,
      color: palette.errorText,
      borderRadius: 10,
      padding: "9px 0",
      fontSize: 13.5,
      cursor: "pointer",
      width: "100%",
    },
    secondaryButton: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      background: "transparent",
      border: `1px solid ${palette.borderMuted}`,
      color: palette.text,
      borderRadius: 10,
      padding: "9px 0",
      fontSize: 13.5,
      cursor: "pointer",
      width: "100%",
    },
  };
}

import { useState, useRef, useEffect, useMemo } from "react";

import {
  CONVERSATIONS_KEY,
  ACTIVE_CONVERSATION_KEY,
  SETTINGS_KEY,
  LEGACY_MESSAGES_KEY,
  conversationMessagesKey,
  WHATSAPP_FEEDBACK_NUMBER,
  SESSION_KEY,
  PALETTES,
} from "./lib/constants";
import {
  supabaseSignUp,
  supabaseSignIn,
  supabaseRefreshSession,
  fetchCloudConversations,
  fetchCloudMessages,
  cloudUpsertConversation,
  cloudSyncMessages,
  cloudDeleteConversation,
} from "./lib/supabase";
import { genConversationId, deriveTitle } from "./lib/utils";
import { streamClaudeAPI } from "./lib/api";
import { getStyles } from "./lib/styles";

import { Header } from "./components/Header.jsx";
import { ChatArea } from "./components/ChatArea.jsx";
import { InputBar } from "./components/InputBar.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { AuthScreen } from "./components/AuthScreen.jsx";
import { SettingsPanel } from "./components/SettingsPanel.jsx";
import { GlobalStyles } from "./components/GlobalStyles.jsx";

// ============================================================
// ZYNORA PRIME — v1
// A real-time AI chatbot: responsive layout, live AI API calls (via a
// serverless proxy), local persistence (including multiple saved
// chats and cloud sync), copy/regenerate/edit, error handling with
// retry, image/document attach, web search grounding, and a settings
// panel (theme, profile name, data saver, language, install, etc.)
//
// This file is just the top-level orchestration component. Everything
// else — API calls, storage helpers, styles, and every presentational
// component — lives in ./lib and ./components, split out specifically
// so no single file update is ever unmanageably large again.
// ============================================================

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

  // ---- Install to home screen ----
  // Chrome/Android fires "beforeinstallprompt" and lets us trigger the
  // native install dialog on demand. Safari/iOS never fires this event
  // at all — there's no programmatic install API there, so instead we
  // detect iOS and show manual "Share → Add to Home Screen" instructions.
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [isInstalled, setIsInstalled] = useState(
    typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true)
  );
  const isIOS =
    typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  useEffect(() => {
    function handleBeforeInstallPrompt(e) {
      e.preventDefault(); // stop the browser's default mini-banner; we show our own button instead
      setInstallPromptEvent(e);
    }
    function handleInstalled() {
      setIsInstalled(true);
      setInstallPromptEvent(null);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function handleInstallClick() {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    await installPromptEvent.userChoice;
    // Whether they accepted or dismissed, this specific prompt event
    // can only be used once — clear it either way.
    setInstallPromptEvent(null);
  }

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

  // Runs once per login (not on every token refresh, guarded by the ref
  // below) to reconcile local and cloud data:
  //  - If the account already has cloud conversations (e.g. signing in
  //    on a new device), pull any that aren't already stored locally.
  //  - If the account has no cloud data yet (first-ever login), push
  //    whatever's currently local up — so chats made before signing in
  //    aren't lost, they just become part of the account going forward.
  // This only ever adds data, in either direction — it never deletes or
  // overwrites, so there's no scenario where logging in wipes something.
  const cloudSyncedUserRef = useRef(null);
  useEffect(() => {
    if (!session || !loaded) return;
    if (cloudSyncedUserRef.current === session.userId) return;
    cloudSyncedUserRef.current = session.userId;

    async function bootstrapCloudSync() {
      try {
        const cloudConvs = await fetchCloudConversations(session);

        if (cloudConvs.length > 0) {
          const localIds = new Set(conversations.map((c) => c.id));
          const newFromCloud = cloudConvs.filter((c) => !localIds.has(c.id));

          for (const c of newFromCloud) {
            const cloudMsgs = await fetchCloudMessages(session, c.id);
            const localMsgs = cloudMsgs.map((m) => ({
              role: m.role,
              content: m.content,
              ...(m.attachment_name
                ? { attachmentName: m.attachment_name, attachmentText: m.attachment_text }
                : {}),
            }));
            await window.storage
              .set(conversationMessagesKey(c.id), JSON.stringify(localMsgs))
              .catch(() => {});
          }

          if (newFromCloud.length > 0) {
            setConversations((prev) => {
              const merged = [
                ...prev,
                ...newFromCloud.map((c) => ({
                  id: c.id,
                  title: c.title,
                  updatedAt: new Date(c.updated_at).getTime(),
                  manuallyTitled: true, // don't let local auto-titling touch a synced title
                })),
              ];
              window.storage.set(CONVERSATIONS_KEY, JSON.stringify(merged)).catch(() => {});
              return merged;
            });
          }
        } else if (conversations.length > 0) {
          // First-ever login for this account — adopt existing local chats.
          for (const c of conversations) {
            await cloudUpsertConversation(session, c);
            let msgs = [];
            try {
              const result = await window.storage.get(conversationMessagesKey(c.id));
              if (result?.value) msgs = JSON.parse(result.value);
            } catch {
              // Nothing saved for this conversation yet — fine, sync an empty set.
            }
            await cloudSyncMessages(session, c.id, msgs);
          }
        }
      } catch {
        // Sync is best-effort. If it fails (offline, etc.) the app keeps
        // working fine from local storage — nothing here is required
        // for the app to function.
      }
    }

    bootstrapCloudSync();
  }, [session, loaded]);

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

  // Logging out must wipe local conversation data too, not just the
  // session — local storage isn't scoped per-account, it's just one
  // shared bucket on this device. Without this, logging in as someone
  // else would show the previous account's chats mixed in with (or
  // instead of) the new one's, which is a real privacy problem, not
  // just a cosmetic bug.
  async function handleLogOut() {
    for (const c of conversations) {
      await window.storage.delete(conversationMessagesKey(c.id)).catch(() => {});
    }
    const freshId = genConversationId();
    const fresh = [{ id: freshId, title: "New chat", updatedAt: Date.now() }];
    setConversations(fresh);
    setActiveId(freshId);
    setMessages([]);
    window.storage.set(CONVERSATIONS_KEY, JSON.stringify(fresh)).catch(() => {});
    window.storage.set(ACTIVE_CONVERSATION_KEY, JSON.stringify(freshId)).catch(() => {});
    window.storage.set(conversationMessagesKey(freshId), JSON.stringify([])).catch(() => {});

    setSession(null);
    window.storage.delete(SESSION_KEY).catch(() => {});
    // Without this reset, logging back in (even as the same person)
    // wouldn't re-pull from the cloud, since the ref would still
    // remember this account as "already synced" from before — leaving
    // the freshly-wiped local state with nothing in it.
    cloudSyncedUserRef.current = null;
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
    // Base64 image data can be several MB per message — persisting that
    // to localStorage forever risks filling the browser's storage quota
    // entirely, which would silently break saving for every conversation,
    // not just the ones with images. `isImage` (a cheap boolean) is kept
    // so a reloaded image message still shows something sensible; the
    // heavy `imageData` only lives in memory for the current session.
    const messagesToStore = messages.map(({ imageData, ...rest }) => rest);
    window.storage.set(conversationMessagesKey(activeId), JSON.stringify(messagesToStore)).catch(() => {});
    setConversations((prev) => {
      const updated = prev.map((c) =>
        c.id === activeId && !c.manuallyTitled
          ? { ...c, title: c.title === "New chat" ? deriveTitle(messages) : c.title, updatedAt: Date.now() }
          : c.id === activeId
          ? { ...c, updatedAt: Date.now() }
          : c
      );
      window.storage.set(CONVERSATIONS_KEY, JSON.stringify(updated)).catch(() => {});

      // Push to the cloud too, if signed in and online. Best-effort —
      // the local storage writes above are the actual safety net; this
      // just keeps the account's copy current when possible.
      if (session && isOnline) {
        const activeConv = updated.find((c) => c.id === activeId);
        if (activeConv) {
          cloudUpsertConversation(session, activeConv);
          cloudSyncMessages(session, activeId, messages);
        }
      }

      return updated;
    });
  }, [messages, loaded, activeId, status, session, isOnline]);

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

    streamClaudeAPI(apiHistory, profileName, dataSaver, replyLanguage, (deltaText, sources) => {
      setMessages((prev) => {
        if (!prev[index]) return prev;
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          content: copy[index].content + deltaText,
          ...(sources && sources.length > 0 ? { sources } : {}),
        };
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

    let userMessage = { role: "user", content };
    if (pendingAttachment) {
      userMessage = {
        role: "user",
        content: content || (pendingAttachment.kind === "image" ? "What's in this image?" : "Please look at the attached document."),
        attachmentName: pendingAttachment.name,
        ...(pendingAttachment.kind === "image"
          ? {
              isImage: true, // small, cheap to persist — the heavy imageData below is not
              imageData: pendingAttachment.imageData,
              imageMimeType: pendingAttachment.imageMimeType,
            }
          : { attachmentText: pendingAttachment.text }),
      };
    }

    const nextMessages = [...messages, userMessage];
    const placeholderIndex = nextMessages.length; // where the streamed reply will land
    setMessages([...nextMessages, { role: "assistant", content: "", streaming: true }]);
    setInput("");
    setPendingAttachment(null);

    runStream(nextMessages, placeholderIndex);
  }

  // Reads a .txt/.md file directly, extracts text from a .docx via
  // mammoth (loaded on demand — see note below), or encodes an image as
  // base64 for Gemini's vision input. PDFs aren't supported here — this
  // app runs client-side with no server, and reliable PDF text
  // extraction needs a library that isn't available in that
  // environment. Converting a PDF to .docx, .txt, or a photo of the
  // page first works around that.
  //
  // Honest tradeoff: image uploads work against this app's whole
  // data-saver philosophy — a photo is much heavier than any text file
  // we support. The size cap below (4MB) is deliberately tight to keep
  // that cost bounded, not just an arbitrary technical limit.
  const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

  async function handleFileSelected(file) {
    setAttachError(null);
    const ext = file.name.split(".").pop().toLowerCase();
    const MAX_CHARS = 15000;

    if (IMAGE_EXTENSIONS.includes(ext)) {
      if (file.size > MAX_IMAGE_BYTES) {
        setAttachError("That image is too large (max 4MB) — try a smaller photo or a screenshot.");
        return;
      }
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("read failed"));
          reader.readAsDataURL(file);
        });
        // dataUrl looks like "data:image/png;base64,AAAA..." — Gemini
        // wants just the base64 portion, with the mime type separate.
        const base64 = dataUrl.split(",")[1];
        setPendingAttachment({
          name: file.name,
          kind: "image",
          imageData: base64,
          imageMimeType: file.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
        });
      } catch {
        setAttachError("Couldn't read that image. Try a different one.");
      }
      return;
    }

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
        setAttachError("PDFs aren't supported yet — try converting to .docx, .txt, or a photo instead.");
        return;
      } else {
        setAttachError("Unsupported file type. Use .txt, .md, .docx, or an image.");
        return;
      }

      if (!text || !text.trim()) {
        setAttachError("Couldn't find any text in that file.");
        return;
      }

      const truncated = text.length > MAX_CHARS;
      setPendingAttachment({
        name: file.name,
        kind: "text",
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
    if (session) cloudDeleteConversation(session, id);

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
      if (session) {
        const renamed = updated.find((c) => c.id === id);
        if (renamed) cloudUpsertConversation(session, renamed);
      }
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

  // Opens WhatsApp with a pre-filled feedback message to a fixed number.
  // wa.me links work with no API, no approval, no cost — just a URL.
  function handleWhatsAppFeedback() {
    const text = "Hi! I have feedback about Zynora Prime:\n\n";
    window.open(`https://wa.me/${WHATSAPP_FEEDBACK_NUMBER}?text=${encodeURIComponent(text)}`, "_blank");
  }

  // Shares the current conversation via WhatsApp to whoever the person
  // picks (no fixed number — wa.me/?text= with no number lets the
  // WhatsApp app show its own contact picker).
  function handleShareChat() {
    const title = conversations.find((c) => c.id === activeId)?.title || "Zynora Prime chat";
    const lines = [`${title} — shared from Zynora Prime`, ""];
    for (const m of messages) {
      const speaker = m.role === "user" ? "You" : "Zynora Prime";
      lines.push(`${speaker}: ${m.content}`);
    }
    let text = lines.join("\n");
    // WhatsApp links get unreliable well before their technical URL
    // limit — long conversations are truncated with a clear note
    // rather than silently failing or getting cut off mid-sentence.
    const MAX_CHARS = 1800;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + "\n\n[…conversation truncated for sharing]";
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
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
        onShareChat={handleShareChat}
        onWhatsAppFeedback={handleWhatsAppFeedback}
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
        isInstalled={isInstalled}
        isIOS={isIOS}
        canInstall={!!installPromptEvent}
        onInstallClick={handleInstallClick}
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


import { SESSION_KEY } from "./constants.js";

// A message with an attached document keeps its display text (m.content)
// separate from what's actually sent to the API — the API gets the full
// document text prepended, but the chat bubble just shows a small chip
// plus whatever the person typed.
export function toApiContent(m) {
  if (m.attachmentText) {
    return `Document "${m.attachmentName}":\n\n${m.attachmentText}\n\n---\n\n${m.content}`;
  }
  return m.content;
}

// Builds the system prompt from independent pieces (base behavior, name,
// data saver, reply language) so each setting can be toggled without the
// others needing separate hardcoded prompt variants.
export function buildSystemPrompt(profileName, dataSaver, replyLanguage) {
  let prompt =
    "You are Zynora Prime, an intelligent AI assistant proudly built in Africa for the world. Your tagline is 'The Intelligence with Purpose.' Your mission is to empower people through clear, accurate, practical, and trustworthy assistance. You help people learn, create, solve problems, write, code, research, brainstorm, analyse information, improve productivity, and make informed decisions. Be warm, confident, professional, respectful, and direct. Keep your responses clear, well-structured, and easy to understand. Be concise by default, but provide detailed explanations when requested. Always prioritise truth, accuracy, and usefulness over sounding confident. Think carefully before answering. If you are uncertain or lack enough information, say so honestly instead of guessing. Never invent facts, sources, quotations, references, statistics, or events. If asked about your underlying AI model or technology, answer honestly and briefly without hiding or exaggerating your capabilities. If asked who you are, introduce yourself naturally as Zynora Prime and briefly describe your mission without repeating the same wording every time. If asked what you can do, explain your capabilities naturally based on the conversation. Encourage learning, curiosity, creativity, critical thinking, and the responsible use of AI. Remain neutral on factual matters, avoid misleading claims, and always treat every person with respect. Your goal is to provide intelligent assistance that is practical, reliable, and genuinely helpful.";

  if (profileName && profileName.trim()) {
    prompt += ` The person's name is ${profileName.trim()}. Use their name naturally from time to time, but not in every reply.`;
  }

  if (dataSaver) {
    prompt +=
      " The person is using Data Saver mode. Keep responses short, efficient, and informative while remaining useful.";
  } else {
    prompt +=
      " Keep responses clear, well-structured and concise unless the person asks for more detail.";
  }

  if (replyLanguage && replyLanguage !== "auto") {
    prompt += ` Always respond in ${replyLanguage} unless the person explicitly asks you to switch languages.`;
  }

  return prompt;
}

// Reads the signed-in session's access token (if any) so the server can
// verify the caller when strict auth (REQUIRE_CHAT_AUTH) is enabled.
// Guests simply send no Authorization header and stay in local mode.
function sessionAccessToken() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw)?.accessToken || null;
  } catch {
    return null;
  }
}

// Calls our own /api/chat serverless function rather than any AI
// provider directly. The browser never holds an API key — that lives
// only in Vercel's server-side environment variables.
//
// The function streams the reply back as plain text, chunk by chunk, so
// replies appear token-by-token. Any real web-search citations arrive at
// the very end, after SOURCES_MARKER — we detect and strip it so it can
// never be shown as text, then hand the parsed sources to the UI.
export const SOURCES_MARKER = "\u241FZYNORA_SOURCES\u241F";

export async function streamClaudeAPI(
  history,
  profileName,
  dataSaver,
  replyLanguage,
  onDelta
) {
  const token = sessionAccessToken();

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      messages: history.map((m) => ({
        role: m.role,
        content: toApiContent(m),
        imageData: m.imageData,
        imageMimeType: m.imageMimeType,
      })),
      systemPrompt: buildSystemPrompt(
        profileName,
        dataSaver,
        replyLanguage
      ),
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  if (!response.body || !response.body.getReader) {
    // Very old browsers without streaming support: take the whole body.
    const text = await response.text();
    const idx = text.indexOf(SOURCES_MARKER);
    if (idx !== -1) {
      onDelta(text.slice(0, idx), safeParseSources(text.slice(idx + SOURCES_MARKER.length)));
    } else {
      onDelta(text || "I didn't catch that — could you rephrase?", undefined);
    }
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";    // not-yet-emitted text (marker may span chunk edges)
  let sourcesRaw = ""; // everything after the marker, if it ever arrives
  let inSources = false;

  function emit(text) {
    if (text) onDelta(text, undefined);
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    let chunk = decoder.decode(value, { stream: true });
    if (inSources) {
      sourcesRaw += chunk;
      continue;
    }
    pending += chunk;

    const idx = pending.indexOf(SOURCES_MARKER);
    if (idx !== -1) {
      emit(pending.slice(0, idx));
      sourcesRaw = pending.slice(idx + SOURCES_MARKER.length);
      pending = "";
      inSources = true;
    } else if (pending.length > SOURCES_MARKER.length) {
      // Emit all but a tail that could still turn out to be the marker.
      const safe = pending.length - SOURCES_MARKER.length;
      emit(pending.slice(0, safe));
      pending = pending.slice(safe);
    }
  }
  pending += decoder.decode(); // flush any bytes the decoder held back

  if (!inSources) {
    // No marker arrived after all — the tail is just text.
    emit(pending);
  }

  const sources = sourcesRaw ? safeParseSources(sourcesRaw) : null;
  if (sources && sources.length > 0) {
    onDelta("", sources);
  }
}

function safeParseSources(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

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
    "You are Zynora Prime, an AI project built in Africa, for African users. Tagline: The Intelligence with Purpose. Be warm, sharp, and direct. Have opinions. No filler words. If asked what underlying AI model or technology powers you, keep it brief and matter-of-fact rather than volunteering technical details unprompted — but don't deny or lie about it if asked directly.";

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

// Calls our own /api/chat serverless function rather than any AI
// provider directly. The browser never holds an API key — that lives
// only in Vercel's server-side environment variables. The function
// itself decides which provider to actually call (currently Gemini's
// free tier; see /api/chat.js). This isn't currently streaming — the
// full reply comes back in one response — but the UI already handles
// that gracefully via the same "single chunk" path used as a fallback
// for browsers without streaming support.
export async function streamClaudeAPI(history, profileName, dataSaver, replyLanguage, onDelta) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: history.map((m) => ({
        role: m.role,
        content: toApiContent(m),
        imageData: m.imageData,
        imageMimeType: m.imageMimeType,
      })),
      systemPrompt: buildSystemPrompt(profileName, dataSaver, replyLanguage),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  onDelta(data.text || "I didn't catch that — could you rephrase?", data.sources);
}

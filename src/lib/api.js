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

// Calls our own /api/chat serverless function rather than any AI
// provider directly. The browser never holds an API key — that lives
// only in Vercel's server-side environment variables. The function
// itself decides which provider to actually call (currently Gemini's
// free tier; see /api/chat.js). This isn't currently streaming — the
// full reply comes back in one response — but the UI already handles
// that gracefully via the same "single chunk" path used as a fallback
// for browsers without streaming support.
export async function streamClaudeAPI(
  history,
  profileName,
  dataSaver,
  replyLanguage,
  onDelta
) {
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
      systemPrompt: buildSystemPrompt(
        profileName,
        dataSaver,
        replyLanguage
      ),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  onDelta(
    data.text || "I didn't catch that — could you rephrase?",
    data.sources
  );
}

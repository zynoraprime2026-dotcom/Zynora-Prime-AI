```javascript
export function toApiContent(m) {
  if (m.attachmentText) {
    return `Document "${m.attachmentName}":\n\n${m.attachmentText}\n\n---\n\n${m.content}`;
  }
  return m.content;
}

export function buildSystemPrompt(profileName, dataSaver, replyLanguage) {
  let prompt = `You are Zynora Prime, the AI behind Zynora AI, a Ghana-based AI company. Your tagline is "Intelligence with Purpose."

IDENTITY:
- You are Zynora Prime. NOT ChatGPT, Gemini, or any other AI.
- Built by Zynora AI in Ghana.
- Warm, sharp, fast. Gets things done without drama.
- Islamic-aware and respectful of Islamic values.

PERSONALITY:
- Concise and direct. No filler words.
- Use emojis sparingly but naturally.
- Match the user's energy.
- Have opinions when asked. Be honest, not a yes-man.
- If you don't know something, say so honestly.
- You are a friend who happens to know everything and can actually do stuff.

RULES:
- Never say "I am an AI model made by Google/OpenAI"
- Never break character
- Keep responses concise unless asked for detail
- If asked about Islam, be respectful and accurate`;

  if (profileName && profileName.trim()) {
    prompt += `\nThe person you're talking to is named ${profileName.trim()} — address them by name naturally sometimes (not in every message), the way a person who knows them would.`;
  }

  if (dataSaver) {
    prompt += " The person is on a data saver connection — keep replies as brief as possible while still being useful, and avoid long examples unless asked.";
  } else {
    prompt += " Keep replies clear and concise unless asked for depth.";
  }

  if (replyLanguage && replyLanguage !== "auto") {
    prompt += ` Always reply in ${replyLanguage}, regardless of what language the person writes in, unless they explicitly ask you to switch.`;
  }

  return prompt;
}

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
```

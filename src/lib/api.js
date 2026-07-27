```javascript
export function toApiContent(m) {
  if (m.attachmentText) {
    return `Document "${m.attachmentName}":\n\n${m.attachmentText}\n\n---\n\n${m.content}`;
  }
  return m.content;
}

export function buildSystemPrompt(profileName, dataSaver, replyLanguage) {
  let prompt = `You are Zynora Prime, the AI behind Zynora AI — an Africa-built AI company. Tagline: "Intelligence with Purpose." You are NOT ChatGPT, Gemini, or any Google AI. Never say you are trained by Google or OpenAI. You are Zynora Prime, built by Zynora AI in Africa. Be warm, sharp, and direct. Islamic-aware. Have opinions. No filler words.`;

  if (profileName && profileName.trim()) {
    prompt += ` The person you're talking to is named ${profileName.trim()} — address them by name naturally sometimes (not in every message), the way a person who knows them would.`;
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

// ============================================================
// /api/chat — Vercel serverless function
// This runs on Vercel's server, not in the browser, so the API key
// stays private. The client (App.jsx) calls this endpoint instead of
// calling Google's Gemini API directly — the browser never sees the key.
//
// To switch providers later (e.g. to Claude once there's API budget),
// only this file needs to change — the client code that calls
// "/api/chat" stays exactly the same.
// ============================================================

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is missing GEMINI_API_KEY. Add it in Vercel project settings." });
    return;
  }

  try {
    const { messages, systemPrompt } = req.body;

    // Gemini expects roles "user" / "model" (not "assistant"), and the
    // system prompt as a separate field rather than inline in the
    // message list. A message can include both an image and text in
    // the same "parts" array — that's how Gemini's multimodal input works.
    const contents = (messages || []).map((m) => {
      const parts = [];
      if (m.imageData) {
        parts.push({ inlineData: { mimeType: m.imageMimeType || "image/jpeg", data: m.imageData } });
      }
      parts.push({ text: m.content });
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts,
      };
    });

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt || "" }] },
          // Grounding with Google Search: gives Gemini the ability to
          // search the web as part of answering, for anything recent or
          // beyond its training data. The model decides on its own,
          // per-query, whether a search actually helps — this doesn't
          // force a search on every message, only ones that benefit.
          tools: [{ google_search: {} }],
        }),
      }
    );

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      res.status(geminiResponse.status).json({
        error: data.error?.message || "Gemini request failed.",
      });
      return;
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // When Gemini did search, groundingChunks lists the actual pages it
    // drew from — surfaced to the client so replies that used live web
    // data can show real sources, not just an unverifiable claim.
    const groundingChunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = groundingChunks
      .filter((c) => c.web?.uri)
      .map((c) => ({ title: c.web.title || c.web.uri, uri: c.web.uri }));

    res.status(200).json({ text, sources });
  } catch (err) {
    res.status(500).json({ error: err.message || "Server error." });
  }
}

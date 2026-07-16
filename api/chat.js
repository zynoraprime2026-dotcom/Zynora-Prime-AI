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
    // message list.
    const contents = (messages || []).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt || "" }] },
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
    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message || "Server error." });
  }
}

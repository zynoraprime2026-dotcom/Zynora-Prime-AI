// ============================================================
// /api/chat — Vercel serverless function
// This runs on Vercel's server, not in the browser, so the API key
// stays private. The client (App.jsx) calls this endpoint instead of
// calling Google's Gemini API directly — the browser never sees the key.
//
// Streams the reply through token-by-token as Gemini generates it,
// rather than waiting for the whole thing and sending one JSON blob.
// Vercel's Node.js runtime supports streaming responses natively — no
// Edge runtime or special config needed, just writing to `res`
// incrementally and not calling res.end() until the stream is done.
//
// Any real web-search source citations (see google_search tool below)
// arrive at the very end of Gemini's stream, after all the reply text.
// They're appended after a rare marker string the client knows to look
// for and strip out — see SOURCES_MARKER in src/lib/api.js.
//
// To switch providers later (e.g. to Claude once there's API budget),
// only this file needs to change — the client code that calls
// "/api/chat" stays exactly the same.
// ============================================================

const SOURCES_MARKER = "\n\n\u241FZYNORA_SOURCES\u241F";

// Supabase (public anon key — safe to be in client code, RLS protects data).
// Used to verify the caller's session when strict auth is enabled.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../src/lib/constants.js";

async function tokenIsValid(token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}


export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Auth: guests are allowed by default. Set REQUIRE_CHAT_AUTH=true in
  // Vercel to require a valid signed-in session before using the AI quota.
  if (process.env.REQUIRE_CHAT_AUTH === "true") {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token || !(await tokenIsValid(token))) {
      res.status(401).json({ error: "Please sign in to use Zynora Prime." });
      return;
    }
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt || "" }] },
          // Grounding with Google Search: gives Gemini the ability to
          // search the web as part of answering, for anything recent or
          // beyond its training data. The model decides on its own,
          // per-query, whether a search actually helps.
          tools: [{ google_search: {} }],
        }),
      }
    );

    if (!geminiResponse.ok || !geminiResponse.body) {
      const errData = await geminiResponse.json().catch(() => ({}));
      res.status(geminiResponse.status || 500).json({
        error: errData.error?.message || "Gemini request failed.",
      });
      return;
    }

    // From here on, headers are committed and we're in streaming mode —
    // any later failure can only end the stream, not send a fresh JSON
    // error (the client has already started receiving a 200 response).
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    if (res.flushHeaders) res.flushHeaders();

    const reader = geminiResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const sources = [];
    const seenUris = new Set();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // last entry may be a partial line — keep it for the next chunk

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;

        let event;
        try {
          event = JSON.parse(jsonStr);
        } catch {
          continue; // skip any malformed/partial event rather than crashing the stream
        }

        const text = event.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) res.write(text);

        const chunks = event.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        for (const c of chunks) {
          if (c.web?.uri && !seenUris.has(c.web.uri)) {
            seenUris.add(c.web.uri);
            sources.push({ title: c.web.title || c.web.uri, uri: c.web.uri });
          }
        }
      }
    }

    if (sources.length > 0) {
      res.write(`${SOURCES_MARKER}${JSON.stringify(sources)}`);
    }

    res.end();
  } catch (err) {
    if (res.headersSent) {
      // Streaming already started — can't send a fresh error response,
      // just end the connection. The client's reader will see the
      // stream end abruptly and its own error handling takes over.
      res.end();
    } else {
      res.status(500).json({ error: err.message || "Server error." });
    }
  }
}

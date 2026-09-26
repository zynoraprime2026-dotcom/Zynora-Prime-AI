# Zynora-Prime-AI
Zynora Prime is a fast, modern AI chatbot with real-time streaming replies, multiple saved conversations, document upload, and a lite/data-saver mode built for users on slower or costlier mobile connections. Crafted with Claude, powered by Gemini 2.5 Flash with real-time Google Search grounding. Built with React.

## Security

- The AI provider key lives only in Vercel server-side environment variables (`GEMINI_API_KEY`) — the browser never sees it.
- Optional strict auth: set `REQUIRE_CHAT_AUTH=true` in Vercel to require a valid signed-in Supabase session before the chat endpoint will spend AI quota. Guests (local-mode users) can still use the app with the flag off.

## Free tier

Usage is tracked locally per day. `DAILY_FREE_MESSAGE_LIMIT` in `src/lib/constants.js` (default 20) caps free messages per day, after which the app points users to a Mobile Money subscription via WhatsApp. Set it to `0` to disable the limit.

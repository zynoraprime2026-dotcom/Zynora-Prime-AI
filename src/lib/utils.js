// Real UUIDs are required now (not just an arbitrary unique string) —
// Supabase's `conversations.id` column is type uuid, and inserting a
// non-UUID string there would fail. crypto.randomUUID() covers modern
// browsers; the fallback produces a valid v4-formatted UUID for older
// ones that don't have it, so every id works with Supabase regardless
// of device age.
export function genConversationId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// A new conversation is titled "New chat" until it has a first user
// message, at which point the title becomes a short snippet of that
// message — the same pattern most chat apps use.
export function deriveTitle(messages) {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New chat";
  const flat = firstUser.content.trim().replace(/\s+/g, " ");
  return flat.length > 42 ? flat.slice(0, 42) + "…" : flat;
}

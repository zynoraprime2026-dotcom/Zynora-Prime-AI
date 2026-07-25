import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./constants";

export async function supabaseSignUp(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || data.error || "Sign up failed.");
  return data; // has access_token/refresh_token if email confirmation is off; otherwise just a user record
}

export async function supabaseSignIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Login failed.");
  return data; // { access_token, refresh_token, expires_in, user }
}

export async function supabaseRefreshSession(refreshToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Session refresh failed.");
  return data;
}

// ---------- Cloud sync (Supabase REST/PostgREST) ----------
// These read/write the `conversations` and `messages` tables directly
// via Supabase's auto-generated REST API — no SDK needed. Row Level
// Security (set up in the SQL migration) means these calls can only
// ever see/modify the signed-in user's own rows, enforced by the
// database itself, not by anything in this client code.
function cloudHeaders(session) {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session.accessToken}`,
  };
}

export async function fetchCloudConversations(session) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/conversations?select=*&order=updated_at.desc`, {
    headers: cloudHeaders(session),
  });
  if (!res.ok) throw new Error("Failed to fetch conversations");
  return res.json();
}

export async function fetchCloudMessages(session, conversationId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${conversationId}&select=*&order=created_at.asc`,
    { headers: cloudHeaders(session) }
  );
  if (!res.ok) throw new Error("Failed to fetch messages");
  return res.json();
}

// Upsert (via Prefer: resolution=merge-duplicates) so this works for
// both a brand new conversation and updating an existing one's title.
export async function cloudUpsertConversation(session, conv) {
  await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
    method: "POST",
    headers: { ...cloudHeaders(session), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: conv.id,
      user_id: session.userId,
      title: conv.title,
      updated_at: new Date(conv.updatedAt).toISOString(),
    }),
  }).catch(() => {}); // best-effort — local storage remains the source of truth if this fails
}

// Replaces all message rows for a conversation with the current full
// set. Simpler and safer than tracking per-message diffs, and cheap
// enough at the scale a personal chat app actually runs at.
export async function cloudSyncMessages(session, conversationId, messages) {
  await fetch(`${SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${conversationId}`, {
    method: "DELETE",
    headers: cloudHeaders(session),
  }).catch(() => {});

  if (messages.length === 0) return;

  await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: "POST",
    headers: { ...cloudHeaders(session), Prefer: "return=minimal" },
    body: JSON.stringify(
      messages
        .filter((m) => m.content !== "") // don't persist an in-progress empty streaming placeholder
        .map((m) => ({
          conversation_id: conversationId,
          user_id: session.userId,
          role: m.role,
          content: m.content,
          attachment_name: m.attachmentName || null,
          attachment_text: m.attachmentText || null,
        }))
    ),
  }).catch(() => {});
}

export async function cloudDeleteConversation(session, id) {
  // Messages cascade-delete automatically (foreign key ON DELETE CASCADE).
  await fetch(`${SUPABASE_URL}/rest/v1/conversations?id=eq.${id}`, {
    method: "DELETE",
    headers: cloudHeaders(session),
  }).catch(() => {});
}

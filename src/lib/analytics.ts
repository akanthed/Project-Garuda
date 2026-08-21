/**
 * Self-instrumented visit tracking — Zoho Catalyst has no built-in web
 * analytics for Web Client Hosting (verified in Console: the hosting page
 * only shows deploy history), so this pings the backend's
 * /api/analytics/visit on app load. `client_id` is a random UUID kept in
 * localStorage — anonymous, never tied to an officer identity or badge.
 * Fire-and-forget: never throws, never blocks rendering.
 */

const API_BASE = import.meta.env.VITE_API_URL as string | undefined;
const CLIENT_ID_KEY = "garuda_visit_client_id";

function getOrCreateClientId(): string {
  try {
    const existing = window.localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID(); // localStorage unavailable (private mode, etc.)
  }
}

export function trackVisit(path: string): void {
  if (!API_BASE) return; // no backend configured (local frontend-only dev)
  const client_id = getOrCreateClientId();
  fetch(`${API_BASE}/api/analytics/visit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id, path, referrer: document.referrer || undefined }),
    keepalive: true,
  }).catch(() => {
    /* never let a tracking failure affect the app */
  });
}

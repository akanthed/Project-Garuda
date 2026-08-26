/**
 * Auth layer — RBAC with Constable / Investigating Officer roles.
 *
 * Credentials are verified server-side via POST /api/auth/login (backend/main.py),
 * which validates against a Catalyst Data Store "Officers" table when deployed,
 * or a local registry otherwise. The login page separately exposes public sandbox
 * credentials in its evaluator quick-fill controls.
 *
 * If VITE_API_URL is not set (frontend-only local dev with no backend running),
 * a small demo registry below is used instead — for local development only.
 */

export type ClearanceLevel = "CLR-1" | "CLR-2" | "CLR-3" | "CLR-4" | "CLR-5" | "CLR-6" | "CLR-7";
export type OfficerRole = "Constable" | "Head Constable" | "ASI" | "SI" | "Inspector" | "CI" | "DySP" | "SP" | "DGP";

export interface Officer {
  badge:       string;
  name:        string;
  designation: OfficerRole;
  station:     string;
  clearance:   ClearanceLevel;
  node:        string;
  /** Derived from clearance — controls which features are visible */
  canExport:   boolean;
  canSimulate: boolean;
  canViewNetwork: boolean;
}

const API_BASE = import.meta.env.VITE_API_URL as string | undefined;
const SESSION_KEY = "ksp_session";
const TOKEN_KEY = "ksp_token";

if (import.meta.env.PROD && !API_BASE) {
  // eslint-disable-next-line no-console
  console.error(
    "VITE_API_URL is not set in this production build — officer credentials cannot be " +
    "verified server-side. The local demo-credential registry is dev-only and is not " +
    "included in this bundle, so login will fail closed rather than fall back to it."
  );
}

// ─── Clearance → permission map (used only by the local dev fallback) ────────

function permissionsFor(clearance: ClearanceLevel): Pick<Officer, "canExport" | "canSimulate" | "canViewNetwork"> {
  const level = parseInt(clearance.replace("CLR-", ""), 10);
  return {
    canViewNetwork: level >= 3,   // ASI and above
    canSimulate:    level >= 4,   // SI and above
    canExport:      level >= 5,   // Inspector and above
  };
}

// ─── Local dev-only fallback registry ─────────────────────────────────────────
// Only used when no backend is configured (VITE_API_URL unset) AND the app was
// built in dev mode. Gated behind `import.meta.env.DEV` (a compile-time constant
// Vite/Rollup replaces with `false` in production builds), so this whole block —
// including the plaintext demo passwords — is dead-code-eliminated from any
// production bundle, not just conditionally skipped at runtime.

const DEV_FALLBACK_REGISTRY: Record<string, { password: string; profile: Omit<Officer, "canExport" | "canSimulate" | "canViewNetwork"> }> = import.meta.env.DEV ? {
  "KSP-BLR-7741": {
    password: "sentinel2026",
    profile: {
      badge: "KSP-BLR-7741", name: "Cpt. R. Vance",
      designation: "CI", station: "Bengaluru City Police HQ",
      clearance: "CLR-7", node: "BLR-A1",
    },
  },
  "KSP-BLR-4412": {
    password: "garuda2026",
    profile: {
      badge: "KSP-BLR-4412", name: "SI A. Kumar",
      designation: "SI", station: "KR Market PS",
      clearance: "CLR-4", node: "BLR-B3",
    },
  },
  "KSP-BLR-1001": {
    password: "constable123",
    profile: {
      badge: "KSP-BLR-1001", name: "Const. B. Naidu",
      designation: "Constable", station: "Koramangala PS",
      clearance: "CLR-1", node: "BLR-C7",
    },
  },
  "KSP-DGP-0001": {
    password: "dgp2026",
    profile: {
      badge: "KSP-DGP-0001", name: "DGP S. Rao",
      designation: "DGP", station: "KSP State HQ",
      clearance: "CLR-7", node: "KSP-HQ",
    },
  },
} : {};

export async function login(badge: string, password: string): Promise<Officer | null> {
  if (API_BASE) {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ badge, password }),
      });
      if (!res.ok) return null;
      const { officer, token } = await res.json();
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(officer));
      sessionStorage.setItem(TOKEN_KEY, token);
      return officer as Officer;
    } catch {
      return null;
    }
  }

  // Local dev fallback (no backend configured) — dead-code-eliminated from
  // production bundles (see DEV_FALLBACK_REGISTRY above), so this always
  // fails closed (returns null) in a real deployed build.
  const entry = DEV_FALLBACK_REGISTRY[badge.toUpperCase()];
  if (!entry || entry.password !== password) return null;
  const officer: Officer = { ...entry.profile, ...permissionsFor(entry.profile.clearance) };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(officer));
  return officer;
}

export function logout(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export function getSession(): Officer | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Officer;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return getSession() !== null;
}



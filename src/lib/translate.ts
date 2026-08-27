/**
 * Dynamic text translation via the backend's /api/translate endpoint, which
 * proxies to Catalyst QuickML Text Translation (see backend/main.py::translate()).
 *
 * This is for translating *dynamic* content (e.g. case narratives) — static
 * UI chrome (nav labels, buttons) stays in the hand-curated dictionary in
 * lib/i18n.ts, since machine translation of short fixed labels is usually
 * lower quality than a reviewed translation.
 *
 * Falls back to returning the original text unchanged if the backend or Zia
 * is unavailable (e.g. local dev without VITE_API_URL, or Zia not configured
 * in the Catalyst console).
 */

const API_BASE = import.meta.env.VITE_API_URL as string | undefined;

export interface TranslateResult {
  texts: string[];
  /** "quickml_translation" when Catalyst performed the translation, "fallback" otherwise */
  source: "quickml_translation" | "fallback";
}

export async function translateTexts(texts: string[], targetLanguage = "kn"): Promise<TranslateResult> {
  if (!API_BASE || texts.length === 0) {
    return { texts, source: "fallback" };
  }
  try {
    const token = sessionStorage.getItem("ksp_token");
    const res = await fetch(`${API_BASE}/api/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ texts, target_language: targetLanguage }),
    });
    if (!res.ok) throw new Error(`translate failed: ${res.status}`);
    const data = await res.json();
    return { texts: data.translations as string[], source: data.source };
  } catch {
    return { texts, source: "fallback" };
  }
}

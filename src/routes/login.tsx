'use client';

import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Shield, Eye, EyeOff, AlertCircle, Loader2, Sun, Moon } from "lucide-react";
import { login } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { locale, toggle } = useLanguage();
  const { theme, toggle: toggleTheme } = useTheme();
  const [badge, setBadge] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!badge.trim() || !password.trim()) {
      setError(t("login_required", locale));
      return;
    }

    setLoading(true);
    setError("");

    const officer = await login(badge, password);
    setLoading(false);

    if (!officer) {
      setError(t("login_error", locale));
      return;
    }

    navigate({ to: "/" });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      {/* Background grid noise */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(58,120,255,0.12),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_80%,rgba(220,40,60,0.08),transparent_55%)]" />

      {/* Corner brackets */}
      <div className="pointer-events-none absolute inset-8">
        {[
          "top-0 left-0 border-t border-l",
          "top-0 right-0 border-t border-r",
          "bottom-0 left-0 border-b border-l",
          "bottom-0 right-0 border-b border-r",
        ].map((cls) => (
          <span key={cls} className={`absolute h-5 w-5 border-foreground/10 ${cls}`} />
        ))}
      </div>

      <div className="w-full max-w-md px-6">
        {/* Theme + language toggle — top right */}
        <div className="mb-4 flex justify-end gap-2">
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-foreground/5 bg-foreground/[0.02] text-primary transition hover:border-primary/30 hover:bg-primary/5"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={toggle}
            className="rounded-md border border-foreground/5 bg-foreground/[0.02] px-3 py-1.5 font-mono text-[11px] text-primary transition hover:border-primary/30 hover:bg-primary/5"
          >
            {locale === "en" ? "ಕನ್ನಡ" : "EN"}
          </button>
        </div>

        {/* Logo + branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/30">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            {t("login_org", locale)}
          </div>
          <h1 className="mt-1 text-2xl font-medium tracking-tight text-foreground">
            Garuda
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {t("login_platform", locale)}
          </p>
        </div>

        {/* Login card */}
        <div className="rounded-xl border border-foreground/5 bg-card p-8">
          <div className="mb-6 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)] shadow-[0_0_8px_var(--danger)]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {t("login_restricted", locale)}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Badge number */}
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t("login_badge", locale)}
              </label>
              <input
                type="text"
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
                placeholder="KSP-BLR-XXXX"
                autoComplete="username"
                className="w-full rounded-md border border-foreground/5 bg-background/60 px-4 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 outline-none transition focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
              />
            </div>

            {/* Passphrase */}
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {t("login_passphrase", locale)}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("login_enter_pass", locale)}
                  autoComplete="current-password"
                  className="w-full rounded-md border border-foreground/5 bg-background/60 px-4 py-2.5 pr-10 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 outline-none transition focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-md border border-[var(--danger)]/20 bg-[var(--danger)]/10 px-3 py-2.5 text-xs text-[var(--danger)]">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary/15 py-2.5 text-sm font-medium text-primary transition hover:bg-primary/25 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("login_authing", locale)}
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4" />
                  {t("login_button", locale)}
                </>
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-foreground/5 pt-4 space-y-2">
            <div className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground/40 mb-2">
              {t("login_demo", locale)}
            </div>
            {[
              { badge: "KSP-DGP-0001", pass: "dgp2026",       role: "DGP",        access: "Full" },
              { badge: "KSP-BLR-7741", pass: "sentinel2026",  role: "CI",         access: "Full" },
              { badge: "KSP-BLR-4412", pass: "garuda2026",    role: "SI",         access: "Simulate" },
              { badge: "KSP-BLR-1001", pass: "constable123",  role: "Constable",  access: "Map only" },
            ].map(({ badge: b, pass, role, access }) => (
              <button
                key={b}
                type="button"
                onClick={() => { setBadge(b); setPassword(pass); }}
                className="flex w-full items-center justify-between rounded-md border border-foreground/5 bg-background/40 px-3 py-2 text-[11px] transition hover:border-foreground/10 hover:bg-foreground/[0.03]"
              >
                <span className="font-mono text-muted-foreground">{b}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground/60">{role}</span>
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] text-primary">{access}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center font-mono text-[10px] text-muted-foreground/40">
          KSP Intelligence Division · Node BLR-A1 · Secure Channel
        </div>
      </div>
    </div>
  );
}

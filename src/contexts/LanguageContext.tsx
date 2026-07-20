import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n";

interface LanguageContextValue {
  locale: Locale;
  toggle: () => void;
  setLocale: (locale: Locale) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: "en",
  toggle: () => {},
  setLocale: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const storedLocale = localStorage.getItem("garuda_locale");
    return storedLocale === "kn" ? "kn" : "en";
  });
  useEffect(() => {
    localStorage.setItem("garuda_locale", locale);
  }, [locale]);
  const setLocale = (nextLocale: Locale) => setLocaleState(nextLocale);
  const toggle = () => setLocaleState((l) => (l === "en" ? "kn" : "en"));
  return (
    <LanguageContext.Provider value={{ locale, toggle, setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

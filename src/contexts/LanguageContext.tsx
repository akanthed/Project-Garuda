import { createContext, useContext, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n";

interface LanguageContextValue {
  locale: Locale;
  toggle: () => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: "en",
  toggle: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");
  const toggle = () => setLocale((l) => (l === "en" ? "kn" : "en"));
  return (
    <LanguageContext.Provider value={{ locale, toggle }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

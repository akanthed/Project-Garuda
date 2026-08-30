import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";

export type Theme = "dark";

interface ThemeContextValue {
  theme: Theme;
}

const STORAGE_KEY = "garuda-theme";

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    document.documentElement.classList.add("dark");
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "dark" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

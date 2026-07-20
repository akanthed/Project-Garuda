import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type DisplayDensity = "compact" | "standard" | "comfortable";
export type DisplayPreference = "animations" | "compactCards" | "autoRefresh" | "kannadaPlaceNames";

interface DisplayPreferences {
  animations: boolean;
  compactCards: boolean;
  autoRefresh: boolean;
  kannadaPlaceNames: boolean;
  density: DisplayDensity;
}

interface DisplayPreferencesContextValue extends DisplayPreferences {
  setPreference: (preference: DisplayPreference, value: boolean) => void;
  setDensity: (density: DisplayDensity) => void;
}

const STORAGE_KEY = "garuda-display-preferences";
const DEFAULTS: DisplayPreferences = {
  animations: true,
  compactCards: false,
  autoRefresh: true,
  kannadaPlaceNames: false,
  density: "standard",
};

const DisplayPreferencesContext = createContext<DisplayPreferencesContextValue>({
  ...DEFAULTS,
  setPreference: () => {},
  setDensity: () => {},
});

function readPreferences(): DisplayPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...DEFAULTS, ...JSON.parse(stored) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<DisplayPreferences>(readPreferences);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    document.documentElement.dataset.density = preferences.density;
  }, [preferences]);

  const setPreference = (preference: DisplayPreference, value: boolean) => {
    setPreferences((current) => ({ ...current, [preference]: value }));
  };

  const setDensity = (density: DisplayDensity) => {
    setPreferences((current) => ({ ...current, density }));
  };

  return (
    <DisplayPreferencesContext.Provider value={{ ...preferences, setPreference, setDensity }}>
      {children}
    </DisplayPreferencesContext.Provider>
  );
}

export function useDisplayPreferences(): DisplayPreferencesContextValue {
  return useContext(DisplayPreferencesContext);
}
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** The resolved (applied) theme. */
export type Theme = "light" | "dark";

/** The user's stored preference; "auto" follows the OS dark-mode setting. */
export type ThemePreference = "light" | "dark" | "auto";

const THEME_KEY = "smart-reader-theme";

interface ThemeContextValue {
  /** Resolved theme after applying the preference. */
  theme: Theme;
  /** Stored preference. */
  preference: ThemePreference;
  setThemePreference: (p: ThemePreference) => void;
  /** Convenience: toggles to the opposite of the currently resolved theme. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  preference: "light",
  setThemePreference: () => {},
  toggleTheme: () => {},
});

function loadPreference(): ThemePreference {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(THEME_KEY);
    // Legacy stored values "light"/"dark" map directly to preferences.
    if (stored === "light" || stored === "dark" || stored === "auto") return stored;
  } catch {
    /* storage unavailable */
  }
  return "light";
}

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function resolveTheme(pref: ThemePreference): Theme {
  if (pref !== "auto") return pref;
  return prefersDark() ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(loadPreference);
  const [theme, setTheme] = useState<Theme>(() => resolveTheme(preference));

  // Re-resolve when the preference changes, and follow live OS changes
  // while the preference is "auto".
  useEffect(() => {
    setTheme(resolveTheme(preference));
    if (preference !== "auto" || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(prefersDark() ? "dark" : "light");
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    // Fallback for older WebView MediaQueryList implementations.
    const legacy = mq as MediaQueryList & {
      addListener?: (cb: () => void) => void;
      removeListener?: (cb: () => void) => void;
    };
    legacy.addListener?.(onChange);
    return () => legacy.removeListener?.(onChange);
  }, [preference]);

  // Apply the resolved theme and persist the preference.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(THEME_KEY, preference);
    } catch {
      /* storage unavailable */
    }
  }, [theme, preference]);

  const setThemePreference = (p: ThemePreference) => setPreference(p);
  const toggleTheme = () =>
    setPreference((p) => (resolveTheme(p) === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, preference, setThemePreference, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

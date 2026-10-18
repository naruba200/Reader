import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** The resolved (applied) base theme. */
export type Theme = "light" | "dark";

/**
 * The user's stored theme preference — the single source of truth for the
 * whole app, including the reader. "auto" follows the OS dark-mode setting;
 * the reading themes (sepia/warm/dark-warm/amoled) tint the reader and the
 * app chrome.
 */
export type ThemePreference =
  | "auto"
  | "light"
  | "dark"
  | "sepia"
  | "warm"
  | "dark-warm"
  | "amoled";

export const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "sepia", label: "Sepia" },
  { id: "warm", label: "Warm" },
  { id: "dark-warm", label: "Dark Warm" },
  { id: "amoled", label: "AMOLED Black" },
];

export const THEME_LABELS: Record<ThemePreference, string> = Object.fromEntries(
  THEME_OPTIONS.map((o) => [o.id, o.label]),
) as Record<ThemePreference, string>;

/** Reading themes that imply a dark base. */
const DARK_THEMES: ReadonlySet<ThemePreference> = new Set(["dark", "dark-warm", "amoled"]);

const THEME_KEY = "smart-reader-theme";
/** Legacy key from when the reader kept its own separate filter setting. */
const LEGACY_FILTER_KEY = "smart-reader-reading-filter";

interface ThemeContextValue {
  /** Resolved base theme after applying the preference. */
  theme: Theme;
  /** Stored preference (one of the 7 options). */
  preference: ThemePreference;
  setThemePreference: (p: ThemePreference) => void;
  /** Convenience: toggles to the opposite of the currently resolved base theme. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  preference: "auto",
  setThemePreference: () => {},
  toggleTheme: () => {},
});

function isThemePreference(v: unknown): v is ThemePreference {
  return (
    v === "auto" ||
    v === "light" ||
    v === "dark" ||
    v === "sepia" ||
    v === "warm" ||
    v === "dark-warm" ||
    v === "amoled"
  );
}

function loadPreference(): ThemePreference {
  if (typeof window === "undefined") return "auto";
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (isThemePreference(stored)) return stored;
    // Migrate the old reader-local filter setting (e.g. "sepia") into the
    // unified preference; "none" meant "no filter" and maps to "auto".
    const legacy = localStorage.getItem(LEGACY_FILTER_KEY);
    if (isThemePreference(legacy) && legacy !== "auto") return legacy;
    if (legacy === "none") return "auto";
  } catch {
    /* storage unavailable */
  }
  return "auto";
}

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function resolveTheme(pref: ThemePreference): Theme {
  if (pref === "auto") return prefersDark() ? "dark" : "light";
  return DARK_THEMES.has(pref) ? "dark" : "light";
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
    // Exposes the full preference (e.g. "sepia") for app-wide theme tints.
    document.documentElement.dataset.theme = preference;
    try {
      localStorage.setItem(THEME_KEY, preference);
      localStorage.removeItem(LEGACY_FILTER_KEY);
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

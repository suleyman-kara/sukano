import { useCallback, useSyncExternalStore } from "react";

/**
 * Tema mekanizması
 *
 * - Kullanıcı tercihi: "light" | "dark" | "system" (localStorage: THEME_STORAGE_KEY).
 * - Çözülmüş tema <html data-theme="light|dark"> olarak yazılır; CSS belirteçleri
 *   (app/app.css) ve Tailwind `dark:` varyantı bu özniteliğe bağlıdır.
 * - Tercih ayrıca <html data-theme-pref> olarak tutulur.
 * - FOUC'u önlemek için `themeInitScript` <head> içinde, ilk boyamadan önce
 *   satır içi çalışır (app/root.tsx). Aynı betik sol panel durumunu
 *   (<html data-nav="open|rail">) da uygular.
 * - Aşama 1'de tercih `user_preferences` tablosuna da yazılacak; o zaman
 *   sunucudan gelen değer localStorage'ı başlatmak için kullanılabilir.
 */

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "sukano:tema";
export const NAV_STORAGE_KEY = "sukano:kenar-panel";
const THEME_EVENT = "sukano:tema-degisti";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export const themeInitScript = `(function(){try{var d=document.documentElement;var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(p!=="light"&&p!=="dark")p="system";var t=p==="system"?(matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches?"dark":"light"):p;d.setAttribute("data-theme",t);d.setAttribute("data-theme-pref",p);d.style.colorScheme=t;var n=localStorage.getItem(${JSON.stringify(
  NAV_STORAGE_KEY,
)});d.setAttribute("data-nav",n==="rail"?"rail":"open");}catch(e){}})();`;

function isPreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref !== "system") return pref;
  if (typeof window === "undefined") return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function applyTheme(pref: ThemePreference) {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-pref", pref);
  root.style.colorScheme = resolved;
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // localStorage kapalı olabilir (gizli pencere); tema yine uygulanır.
  }
  applyTheme(pref);
  window.dispatchEvent(new Event(THEME_EVENT));
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  const onSystemChange = () => {
    if (getThemePreference() === "system") applyTheme("system");
    onChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      applyTheme(getThemePreference());
      onChange();
    }
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

function getSnapshot(): string {
  const pref = getThemePreference();
  return `${pref}:${resolveTheme(pref)}`;
}

function getServerSnapshot(): string {
  return "system:light";
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [preference, resolved] = snapshot.split(":") as [ThemePreference, ResolvedTheme];
  const setPreference = useCallback((pref: ThemePreference) => setThemePreference(pref), []);
  return { preference, resolved, setPreference };
}

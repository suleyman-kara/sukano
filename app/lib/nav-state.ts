import { useCallback, useSyncExternalStore } from "react";
import { NAV_STORAGE_KEY } from "./theme";

/**
 * Masaüstü sol panel durumu: "open" (248 px) | "rail" (72 px).
 * <html data-nav> özniteliğinde tutulur (CSS `railed:` varyantı buna bakar)
 * ve localStorage'da saklanır. İlk değer FOUC önleyici betikle yazılır.
 */
export type NavMode = "open" | "rail";
const NAV_EVENT = "sukano:kenar-panel-degisti";

function read(): NavMode {
  if (typeof document === "undefined") return "open";
  return document.documentElement.getAttribute("data-nav") === "rail" ? "rail" : "open";
}

export function setNavMode(mode: NavMode) {
  document.documentElement.setAttribute("data-nav", mode);
  try {
    window.localStorage.setItem(NAV_STORAGE_KEY, mode);
  } catch {
    // yoksay
  }
  window.dispatchEvent(new Event(NAV_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(NAV_EVENT, onChange);
  return () => window.removeEventListener(NAV_EVENT, onChange);
}

export function useNavMode() {
  const mode = useSyncExternalStore(subscribe, read, () => "open" as NavMode);
  const toggle = useCallback(() => setNavMode(read() === "rail" ? "open" : "rail"), []);
  return { mode, toggle, setMode: setNavMode };
}

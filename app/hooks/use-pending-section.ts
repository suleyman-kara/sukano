import { useLocation, useNavigation } from "react-router";
import { closeHref } from "~/components/notes/note-links";

/**
 * Bölümler arası bekleyen gezinmenin hedef yolu (ör. Notlarım → Arşiv, başka proje); yoksa
 * `null`. Kenar çubuğu ve görünüm kapsülü tıklanan öğeyi veri gelmeden seçili gösterir
 * (anında tepki). Aynı ızgarada not açıp kapamak bölüm değiştirmez.
 */
export function usePendingSectionPath(): string | null {
  const navigation = useNavigation();
  const location = useLocation();
  if (navigation.state !== "loading" || !navigation.location) return null;
  const next = navigation.location.pathname;
  return closeHref(next) !== closeHref(location.pathname) ? next : null;
}

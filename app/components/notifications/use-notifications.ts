import { useCallback, useEffect, useRef, useState } from "react";
import { PERSONAL_CHANNEL, useLiveChannel } from "~/components/realtime/use-live-channel";
import type { NotificationView } from "~/domain/notifications/copy";
import type { NotificationPage } from "~/lib/notifications.server";

export const NOTIFICATIONS_API = "/api/bildirimler";
/** Kişisel kanalda yeni bildirim ya da okundu değişikliği: açık listeler yenilenir. */
export const NOTIFICATIONS_EVENT = "sukano:bildirimler";

const defaultFetch: typeof fetch = (...a) => fetch(...a);

export function emitNotificationsChanged(unread?: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT, { detail: { unread } }));
}

async function postIntent(fields: Record<string, string>) {
  const res = await fetch(NOTIFICATIONS_API, { method: "POST", body: new URLSearchParams(fields) });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as { ok: true; unread: number; changed: number };
}

/**
 * Okunmamış bildirim sayısı (zil rozeti). Kök loader'ın değeriyle başlar; kişisel kanaldaki
 * `bildirim` olayında ve açık listelerdeki değişiklikte yeniden okunur. Kanala bağlanan tek
 * yer burasıdır; listeler `NOTIFICATIONS_EVENT` ile haber alır.
 */
export function useUnreadCount(
  initial: number,
  {
    live: subscribe = true,
    fetchImpl = defaultFetch,
  }: { live?: boolean; fetchImpl?: typeof fetch } = {},
) {
  const [live, setLive] = useState<{ base: number; value: number } | null>(null);
  const base = useRef(initial);
  useEffect(() => {
    base.current = initial;
  });
  const refresh = useCallback(async () => {
    try {
      const res = await fetchImpl(`${NOTIFICATIONS_API}?sayi=1`);
      if (!res.ok) return;
      const { unread } = (await res.json()) as { unread: number };
      setLive({ base: base.current, value: unread });
    } catch {
      // Bağlantı yok: rozet eski değerde kalır.
    }
  }, [fetchImpl]);

  useLiveChannel(subscribe ? PERSONAL_CHANNEL : null, (event) => {
    if (event.type !== "bildirim") return;
    void refresh();
    emitNotificationsChanged();
  });

  useEffect(() => {
    const onChange = (e: Event) => {
      const unread = (e as CustomEvent<{ unread?: number }>).detail?.unread;
      if (typeof unread === "number") setLive({ base: base.current, value: unread });
    };
    window.addEventListener(NOTIFICATIONS_EVENT, onChange);
    return () => window.removeEventListener(NOTIFICATIONS_EVENT, onChange);
  }, []);

  return live && live.base === initial ? live.value : initial;
}

type FeedState = {
  items: NotificationView[];
  hasMore: boolean;
  cursor: number | null;
  loading: boolean;
  error: boolean;
};

/**
 * Bildirim listesi (zil paneli ve `/bildirimler`): ilk sayfa, "Daha eski bildirimler",
 * tek tek ve topluca okundu sayma. `initial` verilirse (sayfa loader'ı) ilk istek atılmaz.
 */
export function useNotificationFeed({
  initial,
  enabled = true,
  fetchImpl = defaultFetch,
}: {
  initial?: NotificationPage;
  enabled?: boolean;
  fetchImpl?: typeof fetch;
} = {}) {
  const [state, setState] = useState<FeedState>(() => ({
    items: initial?.items ?? [],
    hasMore: initial?.hasMore ?? false,
    cursor: initial?.cursor ?? null,
    loading: !initial && enabled,
    error: false,
  }));
  const doFetch = useRef(fetchImpl);

  const load = useCallback(async () => {
    try {
      const res = await doFetch.current(NOTIFICATIONS_API);
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as NotificationPage;
      setState({
        items: page.items,
        hasMore: page.hasMore,
        cursor: page.cursor,
        loading: false,
        error: false,
      });
      emitNotificationsChanged(page.unread);
    } catch {
      setState((s) => ({ ...s, loading: false, error: true }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!initial) void load();
    const onChange = (e: Event) => {
      // Kendi okundu işlemimizin yankısı (sayı taşıyan) listeyi yeniden yüklemez.
      if (typeof (e as CustomEvent<{ unread?: number }>).detail?.unread === "number") return;
      void load();
    };
    window.addEventListener(NOTIFICATIONS_EVENT, onChange);
    return () => window.removeEventListener(NOTIFICATIONS_EVENT, onChange);
  }, [enabled, initial, load]);

  const loadMore = useCallback(async () => {
    if (!state.cursor) return;
    try {
      const res = await doFetch.current(`${NOTIFICATIONS_API}?once=${state.cursor}`);
      if (!res.ok) return;
      const page = (await res.json()) as NotificationPage;
      setState((s) => ({
        ...s,
        items: [...s.items, ...page.items.filter((i) => !s.items.some((x) => x.id === i.id))],
        hasMore: page.hasMore,
        cursor: page.cursor,
      }));
    } catch {
      // Sonra yeniden denenebilir.
    }
  }, [state.cursor]);

  const markRead = useCallback(async (id: string) => {
    setState((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === id ? { ...i, unread: false } : i)),
    }));
    try {
      const { unread } = await postIntent({ intent: "read", id });
      emitNotificationsChanged(unread);
    } catch {
      // Okundu bilgisi bir sonraki yüklemede düzelir.
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setState((s) => ({ ...s, items: s.items.map((i) => ({ ...i, unread: false })) }));
    try {
      const { unread } = await postIntent({ intent: "read-all" });
      emitNotificationsChanged(unread);
    } catch {
      void load();
    }
  }, [load]);

  return { ...state, load, loadMore, markRead, markAllRead };
}

const ZONE_KEY = "sukano:saat-dilimi";

/**
 * Tarayıcının saat dilimini sunucuya bildirir (hatırlatıcı saatleri ve bildirim metinleri
 * için; PLAN §5). Oturum başına bir kez, değiştiyse yeniden.
 */
export function useSyncTimeZone(fetchImpl: typeof fetch = defaultFetch) {
  useEffect(() => {
    let tz: string | undefined;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz || sessionStorage.getItem(ZONE_KEY) === tz) return;
      sessionStorage.setItem(ZONE_KEY, tz);
    } catch {
      return;
    }
    void fetchImpl(NOTIFICATIONS_API, {
      method: "POST",
      body: new URLSearchParams({ intent: "time-zone", timeZone: tz }),
    }).catch(() => {});
  }, [fetchImpl]);
}

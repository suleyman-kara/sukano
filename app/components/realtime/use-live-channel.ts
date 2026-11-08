import { useEffect, useRef, useState } from "react";
import { useContentRevalidator } from "~/lib/offline-revalidate";
import type { NoteCardData, NoteView } from "~/domain/notes/optimistic";
import {
  applyChannelEvent,
  applyChannelEvents,
  type ChannelEvent,
  type ChannelEventBody,
} from "~/domain/realtime/grid-events";
import {
  parseChannelServerMessage,
  PERSONAL_CHANNEL_PATH,
  projectChannelPath,
} from "~/domain/realtime/protocol";
import { useLiveConfig } from "./live-context";
import { LiveSocket, type LiveSocketOptions, type LiveStatus } from "./live-socket";

/** Abone olunacak kanal: proje ya da kişisel alan (Notlarım). */
export type LiveChannel = { kind: "project"; projectId: string } | { kind: "personal" };

/** Kişisel alan (Notlarım, arşiv, çöp) kanalı. */
export const PERSONAL_CHANNEL: LiveChannel = { kind: "personal" };

export const channelPath = (c: LiveChannel) =>
  c.kind === "project" ? projectChannelPath(c.projectId) : PERSONAL_CHANNEL_PATH;

export type LiveChannelState = {
  status: LiveStatus;
  /** Son olay ya da bağlantı anı (ms). */
  lastEventAt: number | null;
};

export type UseLiveChannelOptions = {
  /** Kopukken kaçan olay olabilir (yeniden bağlanınca sıra numarası atladıysa). */
  onGap?: () => void;
  socket?: Partial<LiveSocketOptions>;
};

/**
 * Kanal aboneliği: olaylar `onEvent`'e gelir. `channel` null ya da canlı katman kapalıysa
 * bağlanmaz. Yeniden bağlanınca sunucunun sıra numarası bilinenden büyükse olay kaçmıştır:
 * `onGap` çağrılır (ızgara yeniden doğrulanır).
 */
export function useLiveChannel(
  channel: LiveChannel | null,
  onEvent: (event: ChannelEvent) => void,
  { onGap, socket }: UseLiveChannelOptions = {},
): LiveChannelState | null {
  const { enabled } = useLiveConfig();
  const [state, setState] = useState<LiveChannelState>({ status: "baglaniyor", lastEventAt: null });
  const handlers = useRef({ onEvent, onGap });
  useEffect(() => {
    handlers.current = { onEvent, onGap };
  });
  const socketOptions = useRef(socket);
  const path = channel && enabled ? channelPath(channel) : null;

  useEffect(() => {
    if (!path) return;
    let lastSeq: number | null = null;
    const live = new LiveSocket({
      url: path,
      ...socketOptions.current,
      onStatus: (status) => setState((s) => ({ ...s, status })),
      onMessage: (data) => {
        if (typeof data !== "string") return;
        const msg = parseChannelServerMessage(data);
        if (!msg) return;
        setState((s) => ({ ...s, lastEventAt: Date.now() }));
        if (msg.t === "hosgeldin") {
          if (lastSeq !== null && msg.seq > lastSeq) handlers.current.onGap?.();
          lastSeq = msg.seq;
          return;
        }
        lastSeq = Math.max(lastSeq ?? 0, msg.seq);
        handlers.current.onEvent(msg.event);
      },
    });
    live.start();
    return () => live.stop();
  }, [path]);

  return path ? state : null;
}

/** Izgarayı yeniden doğrulamadan önce olayların birikmesi için bekleme (ms). */
export const GRID_REVALIDATE_MS = 250;

/**
 * Canlı ızgara: loader'ın not listesine kanal olaylarını uygular (`applyChannelEvent`) ve
 * gerektiğinde loader'ları (kısa bir birikmeyle) yeniden doğrular. Yeni loader verisi
 * gelince biriken olaylar atılır (sunucu verisi onları zaten içerir). `onEvent`: her olay
 * (ör. proje silindi / üyelik değişti → yönlendirme).
 */
export function useLiveGrid(
  notes: NoteCardData[],
  view: NoteView,
  channel: LiveChannel | null,
  { onEvent }: { onEvent?: (event: ChannelEvent) => void } = {},
): { notes: NoteCardData[]; live: LiveChannelState | null } {
  const eventHandler = useRef(onEvent);
  useEffect(() => {
    eventHandler.current = onEvent;
  });
  const [overlay, setOverlay] = useState<{ base: NoteCardData[]; events: ChannelEventBody[] }>({
    base: notes,
    events: [],
  });
  const revalidator = useContentRevalidator();
  const revalidate = useRef(revalidator.revalidate);
  useEffect(() => {
    revalidate.current = revalidator.revalidate;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef(notes);
  useEffect(() => {
    current.current = notes;
  });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void revalidate.current();
    }, GRID_REVALIDATE_MS);
  };

  const live = useLiveChannel(
    channel,
    (event) => {
      setOverlay((o) => {
        const events = o.base === current.current ? o.events : [];
        return { base: current.current, events: [...events, event] };
      });
      if (applyChannelEvent(current.current, event, view).revalidate) schedule();
      eventHandler.current?.(event);
    },
    { onGap: schedule },
  );

  const events = overlay.base === notes ? overlay.events : [];
  return { notes: events.length ? applyChannelEvents(notes, events, view).notes : notes, live };
}

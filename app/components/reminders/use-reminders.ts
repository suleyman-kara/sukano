import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  enablePush,
  markPushOffered,
  shouldOfferPush,
} from "~/components/notifications/push-client";
import { useContentRevalidator } from "~/lib/offline-revalidate";

export const REMINDERS_ACTION = "/api/hatirlaticilar";

/** Tarayıcının IANA saat dilimi (yoksa null; sunucu kayıtlıyı kullanır). */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

type ReminderResponse = { ok: true; at: string | null } | { ok: false; error: string };

async function post(fields: Record<string, string>): Promise<ReminderResponse> {
  const tz = browserTimeZone();
  try {
    const res = await fetch(REMINDERS_ACTION, {
      method: "POST",
      body: new URLSearchParams({ ...fields, ...(tz ? { timeZone: tz } : {}) }),
    });
    return (await res.json()) as ReminderResponse;
  } catch {
    return { ok: false, error: "Bağlantı kurulamadı. Tekrar dene." };
  }
}

/**
 * Hatırlatıcı kurulduktan sonra (bağlamında) tarayıcı bildirimi önerisi: izin henüz
 * sorulmadıysa bir kez toast'la sorulur, sayfa açılışında sorulmaz.
 */
export function offerPushAfterReminder() {
  if (!shouldOfferPush()) return;
  markPushOffered();
  toast("Zamanı gelince bu cihazda da bildirim alınsın mı?", {
    id: "push-onerisi",
    duration: 10_000,
    action: {
      label: "Bildirimleri aç",
      onClick: () => {
        void enablePush().then((status) => {
          if (status === "acik") toast.success("Tarayıcı bildirimleri bu cihazda açık.");
          else if (status === "engellendi")
            toast("Bildirim izni tarayıcıda engelli; site ayarlarından açabilirsin.");
        });
      },
    },
  });
}

/**
 * Not hatırlatıcısı: kur, değiştir, kaldır. Kayıttan sonra ızgara arkada yeniden doğrulanır
 * (karttaki hatırlatıcı çipi); not kapanışı ağ beklemediği için bunu kendisi yapmaz.
 */
export function useNoteReminder(noteId: string, initial: number | null) {
  const { revalidate } = useContentRevalidator();
  const [at, setAt] = useState<number | null>(initial);
  /** Son kaydın saat dilimi (tarayıcının); çip onunla yazılır. */
  const [zone, setZone] = useState<string | null>(null);
  const save = useCallback(
    async (date: string, time: string) => {
      const res = await post({ intent: "note", noteId, date, time });
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      setAt(res.at ? Date.parse(res.at) : null);
      setZone(browserTimeZone());
      offerPushAfterReminder();
      void revalidate();
      return true;
    },
    [noteId, revalidate],
  );
  const clear = useCallback(async () => {
    const res = await post({ intent: "note-clear", noteId });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    setAt(null);
    void revalidate();
    return true;
  }, [noteId, revalidate]);
  return { at, zone, save, clear };
}

/** Görev "Hatırlat" anahtarları (görev kimliği → an). */
export function useTaskReminders(noteId: string, initial: Record<string, number>) {
  const [map, setMap] = useState<Record<string, number>>(initial);
  const toggle = useCallback(
    async (taskId: string, on: boolean) => {
      const before = map;
      setMap((m) => {
        const next = { ...m };
        if (on) next[taskId] = next[taskId] ?? Date.now();
        else delete next[taskId];
        return next;
      });
      const res = await post({ intent: "task", noteId, taskId, on: on ? "1" : "0" });
      if (!res.ok) {
        setMap(before);
        toast.error(res.error);
        return;
      }
      setMap((m) => {
        const next = { ...m };
        if (res.at) next[taskId] = Date.parse(res.at);
        else delete next[taskId];
        return next;
      });
      if (on) offerPushAfterReminder();
    },
    [map, noteId],
  );
  const has = useCallback((taskId: string) => taskId in map, [map]);
  return { has, toggle };
}

export type TaskReminderControl = ReturnType<typeof useTaskReminders>;

import { useCallback, useMemo } from "react";
import { useFetchers, useSubmit } from "react-router";
import { toast } from "sonner";
import { withDurationBar } from "~/components/ui/sonner";
import { intentToForm, parseNoteIntent, type NoteIntent } from "~/domain/notes/validation";

export const NOTES_ACTION = "/api/notlar";
/** Geri al toast'ının süresi (PLAN §10: 6–8 sn). */
export const UNDO_TOAST_MS = 6000;

const newId = () => crypto.randomUUID();

/**
 * Not eylemleri: fetcher üzerinden `/api/notlar`'a gönderir (sayfa değişmez).
 * Arşivle, çöpe at ve kopyasını oluştur "Geri al" düğmeli toast gösterir.
 */
export function useNoteActions() {
  const submit = useSubmit();

  const run = useCallback(
    (intent: NoteIntent, fetcherKey?: string) =>
      submit(intentToForm(intent), {
        method: "post",
        action: NOTES_ACTION,
        navigate: false,
        ...(fetcherKey ? { fetcherKey } : {}),
      }),
    [submit],
  );

  return useMemo(() => {
    const undoToast = (message: string, undo: () => void) =>
      toast(message, {
        ...withDurationBar(UNDO_TOAST_MS),
        action: { label: "Geri al", onClick: undo },
      });

    return {
      run,
      create(note: Omit<Extract<NoteIntent, { intent: "create" }>, "intent" | "id">) {
        const id = newId();
        void run({ intent: "create", id, ...note });
        return id;
      },
      createTodo(note: Omit<Extract<NoteIntent, { intent: "create-todo" }>, "intent" | "id">) {
        const id = newId();
        void run({ intent: "create-todo", id, ...note });
        return id;
      },
      setColor: (id: string, color: Extract<NoteIntent, { intent: "color" }>["color"]) =>
        void run({ intent: "color", id, color }),
      setPinned: (id: string, pinned: boolean) => void run({ intent: "pin", id, pinned }),
      move: (id: string, pinned: boolean, toIndex: number) =>
        void run({ intent: "move", id, pinned, toIndex }),
      archive(id: string) {
        void run({ intent: "archive", id });
        undoToast("Not arşivlendi", () => void run({ intent: "unarchive", id }));
      },
      unarchive(id: string) {
        void run({ intent: "unarchive", id });
        undoToast("Not arşivden çıkarıldı", () => void run({ intent: "archive", id }));
      },
      trash(id: string) {
        void run({ intent: "trash", id });
        undoToast(
          "Not çöpe atıldı · 7 gün Çöp'te kalır",
          () => void run({ intent: "restore", id }),
        );
      },
      restore(id: string) {
        void run({ intent: "restore", id });
        toast("Not geri yüklendi", { duration: UNDO_TOAST_MS });
      },
      duplicate(id: string) {
        const copy = newId();
        void run({ intent: "duplicate", id, newId: copy });
        undoToast("Kopyası oluşturuldu", () => void run({ intent: "discard", id: copy }));
        return copy;
      },
      deletePermanently(id: string) {
        void run({ intent: "delete", id });
        toast("Not kalıcı olarak silindi", { duration: UNDO_TOAST_MS });
      },
      emptyTrash() {
        void run({ intent: "empty-trash" });
        toast("Çöp boşaltıldı", { duration: UNDO_TOAST_MS });
      },
    };
  }, [run]);
}

export type NoteActions = ReturnType<typeof useNoteActions>;

/** Sunucuya gitmiş, henüz tamamlanmamış (yeniden doğrulama dahil) not eylemleri. */
export function usePendingNoteIntents(): NoteIntent[] {
  const fetchers = useFetchers();
  return useMemo(
    () =>
      fetchers.flatMap((f) => {
        if (f.formAction !== NOTES_ACTION || !f.formData) return [];
        const parsed = parseNoteIntent(Object.fromEntries(f.formData));
        return parsed.ok ? [parsed.value] : [];
      }),
    [fetchers],
  );
}

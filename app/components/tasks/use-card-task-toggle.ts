import { useCallback } from "react";
import { useRevalidator } from "react-router";
import { toast } from "sonner";
import type { CardTask } from "~/domain/notes/optimistic";
import { makeTask, type Task } from "~/domain/tasks/model";
import { applyUndo, emptyUndo, TOAST_MS, toggleWithUndo } from "~/domain/tasks/undo";
import { postTaskOps } from "./use-todo-tasks";

/**
 * Bir tamamlama işleminde değişen görevler: sunucu zinciri tek anda yazar, değişenlerin
 * hepsi işaretlenen görevle aynı `completedAt`'i taşır (önceden tamamlanmış alt görevler
 * daha eskidir). Geri al tam olarak bunları açar.
 */
export function changedByCompletion(tasks: readonly Task[], id: string): string[] {
  const at = tasks.find((t) => t.id === id)?.completedAt;
  if (at == null) return [id];
  return tasks.filter((t) => t.completedAt === at).map((t) => t.id);
}

/**
 * Karttan görev işaretleme (not açılmadan; PLAN §3): açık editördeki zincirin aynısı
 * (`toggleWithUndo` → `result.ops`), kartta sonner toast'ı "X tamamlandı · Geri al".
 * Görev karttan hemen kalkar (`hide`); geri alınınca döner (`show`).
 */
export function useCardTaskToggle() {
  const revalidator = useRevalidator();
  const revalidate = revalidator.revalidate;

  return useCallback(
    (noteId: string, task: CardTask, view: { hide: () => void; show: () => void }) => {
      if (!task.id) return;
      const id = task.id;
      const r = toggleWithUndo(
        [makeTask(id, null, 0, { title: task.title })],
        emptyUndo(),
        id,
        Date.now(),
        "",
      );
      if (!r) return;
      view.hide();
      const sent = postTaskOps(noteId, r.result.ops).then(
        (res) => {
          void revalidate();
          if (!res.ok) {
            view.show();
            toast.error("Görev işaretlenemedi.");
            return null;
          }
          return res.tasks;
        },
        () => {
          view.show();
          toast.error("Görev işaretlenemedi. Bağlantını kontrol et.");
          return null;
        },
      );
      const text = r.undo.toasts[0]?.text ?? `${task.title} tamamlandı`;
      toast(text, {
        duration: TOAST_MS,
        action: {
          label: "Geri al",
          onClick: () => {
            void sent.then(async (tasks) => {
              if (!tasks) return;
              view.show();
              const undo = applyUndo(tasks, changedByCompletion(tasks, id));
              await postTaskOps(noteId, undo.ops).catch(() => null);
              void revalidate();
            });
          },
        },
      });
    },
    [revalidate],
  );
}

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useContentRevalidator } from "~/lib/offline-revalidate";
import { toast } from "sonner";
import {
  attachmentsReducer,
  EMPTY_ATTACHMENTS,
  usedSlots,
  visibleAttachments,
  type AttachmentView,
} from "~/domain/attachments/pending";
import { checkAttachment, MESSAGES, sanitizeFileName } from "~/domain/attachments/rules";
import { deleteAttachment, uploadAttachment } from "./upload";

export type NoteAttachments = ReturnType<typeof useNoteAttachments>;

let seq = 0;
const nextKey = () => `y${Date.now().toString(36)}-${++seq}`;

/**
 * Açık notun ekleri: sunucu listesi (loader) + yüklemeler + iyimser kaldırma.
 * `canAdd`: düzenlenebilir metin notu (görüntüleyici, çöp, çevrimdışı → false).
 * Başarılı yükleme ve kaldırmadan sonra loader'lar yeniden doğrulanır (kart kapağı,
 * dönüştürme engeli); diğer istemciler not odası / kanal olayıyla güncellenir.
 */
export function useNoteAttachments({
  noteId,
  server,
  canAdd,
}: {
  noteId: string;
  server: readonly AttachmentView[];
  canAdd: boolean;
}) {
  const revalidator = useContentRevalidator();
  const [state, dispatch] = useReducer(attachmentsReducer, EMPTY_ATTACHMENTS);
  const files = useRef(new Map<string, File>());
  const [dragging, setDragging] = useState(false);

  // Sunucu listesine ulaşan iyimser eklenenler atılır (sonra başka yerden kaldırılırsa
  // yeniden görünmesin).
  useEffect(() => dispatch({ type: "esitle", server }), [server]);
  const current = state;
  const visible = visibleAttachments(server, current);

  const revalidate = revalidator.revalidate;
  const start = useCallback(
    (key: string, file: File) => {
      void uploadAttachment(noteId, file, (loaded) =>
        dispatch({ type: "ilerle", key, loaded }),
      ).then((r) => {
        if (r.ok) {
          files.current.delete(key);
          dispatch({ type: "bitti", key, attachment: r.attachment });
          void revalidate();
        } else {
          dispatch({ type: "hata", key, error: r.error, retryable: r.retryable });
        }
      });
    },
    [noteId, revalidate],
  );

  const addFiles = useCallback(
    (list: Iterable<File>) => {
      if (!canAdd) return;
      let used = usedSlots(visible, current);
      for (const file of list) {
        const key = nextKey();
        const name = sanitizeFileName(file.name);
        dispatch({ type: "basla", key, name, size: file.size });
        const check = checkAttachment({ name, size: file.size }, used);
        if (!check.ok) {
          dispatch({ type: "hata", key, error: check.message });
          continue;
        }
        used++;
        files.current.set(key, file);
        start(key, file);
      }
    },
    [canAdd, visible, current, start],
  );

  const retry = (key: string) => {
    const file = files.current.get(key);
    if (!file) return;
    dispatch({ type: "yeniden", key });
    start(key, file);
  };

  const dismiss = (key: string) => {
    files.current.delete(key);
    dispatch({ type: "vazgec", key });
  };

  const remove = async (id: string) => {
    dispatch({ type: "kaldir", id });
    const r = await deleteAttachment(id);
    if (!r.ok) {
      dispatch({ type: "kaldirma-geri", id });
      toast.error(r.error ?? "Ek kaldırılamadı");
      return;
    }
    toast("Ek kaldırıldı", { id: `ek-kaldirildi:${id}` });
    void revalidate();
  };

  // Not kapanırken bekleyen dosyalar bırakılır.
  useEffect(() => {
    const map = files.current;
    return () => map.clear();
  }, []);

  return {
    visible,
    pending: current.pending,
    canAdd,
    addFiles,
    retry,
    dismiss,
    remove,
    dragging,
    setDragging,
  };
}

/** Sürüklenen veri dosya içeriyor mu? */
export const hasFiles = (e: React.DragEvent) =>
  Array.from(e.dataTransfer?.types ?? []).includes("Files");

/** Yapıştırılan dosyalar (ekran görüntüsü vb.). */
export function pastedFiles(e: React.ClipboardEvent): File[] {
  return Array.from(e.clipboardData?.files ?? []);
}

export { MESSAGES };

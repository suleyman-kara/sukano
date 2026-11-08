import { Info, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import type { NoteKind } from "~/db/schema";
import { ATTACHMENT_BLOCK_MESSAGE } from "~/domain/tasks/convert";
import { ConfirmDialog } from "./confirm-dialog";
import { NOTES_ACTION } from "./use-note-actions";

type Request = {
  id: string;
  to: NoteKind;
  attachmentCount?: number;
  /** Onaydan sonra, dönüşüm gönderilmeden önce (bekleyen kayıtlar). */
  before?: () => Promise<void> | void;
};

/**
 * Metin ↔ yapılacaklar dönüşümü (Dialogs2): onay diyaloğu + `convert` eylemi. Eki
 * olan metin notu dönüştürülemez; diyalog engel mesajı gösterir, sunucu da 409 döner.
 */
export function useConvertNote() {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [request, setRequest] = useState<Request | null>(null);
  const [shown, setShown] = useState<Request | null>(null);
  const lastData = useRef(fetcher.data);

  useEffect(() => {
    if (fetcher.state !== "idle" || fetcher.data === lastData.current) return;
    lastData.current = fetcher.data;
    if (fetcher.data && !fetcher.data.ok) {
      toast.error(fetcher.data.error ?? "Not dönüştürülemedi.");
    }
  }, [fetcher.state, fetcher.data]);

  const ask = (r: Request) => {
    setShown(r);
    setRequest(r);
  };

  const blocked = shown?.to === "todo" && (shown.attachmentCount ?? 0) > 0;
  const toTodo = shown?.to === "todo";

  const dialog = (
    <ConfirmDialog
      open={request !== null}
      onOpenChange={(open) => !open && setRequest(null)}
      tone="primary"
      title={toTodo ? "Yapılacaklar notuna dönüştürülsün mü?" : "Metin notuna dönüştürülsün mü?"}
      description={
        toTodo
          ? "Her satır bir görev olur. Kalın, italik ve bağlantılar düz metne döner."
          : "Her görev bir satır olur; alt görevler girintili madde olarak kalır."
      }
      note={
        blocked ? (
          <>
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
            <span>{ATTACHMENT_BLOCK_MESSAGE}</span>
          </>
        ) : toTodo ? (
          <>
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Yapılacaklar notunda dosya eki tutulmaz. Eki olan not, ekler kaldırılınca
              dönüştürülebilir.
            </span>
          </>
        ) : (
          <>
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
            <span>
              Tarihler, görev hatırlatıcıları ve açıklamalar kaldırılır. Önceki hal sürüm geçmişinde
              kalır.
            </span>
          </>
        )
      }
      confirmLabel={toTodo ? "Dönüştür" : "Metne dönüştür"}
      confirmDisabled={blocked}
      onConfirm={() => {
        const r = request;
        setRequest(null);
        if (!r) return;
        void (async () => {
          await r.before?.();
          await fetcher.submit(
            { intent: "convert", id: r.id, to: r.to },
            { method: "post", action: NOTES_ACTION },
          );
        })();
      }}
    />
  );

  return { ask, dialog, converting: fetcher.state !== "idle" };
}

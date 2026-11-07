import { Info, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { cn } from "cn";
import { Avatar } from "~/components/avatar";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import { VersionTaskTree } from "~/components/tasks/version-task-tree";
import { formatRelativeDateTime } from "~/domain/notes/dates";
import type { Task } from "~/domain/tasks/model";
import type { VersionListItem, VersionPreview } from "~/lib/notes.server";
import { ConfirmDialog } from "./confirm-dialog";
import { NoteEditorContent, useNoteEditor } from "./note-editor";
import { NOTES_ACTION } from "./use-note-actions";

type VersionsData = { versions: VersionListItem[]; preview: VersionPreview | null };

type VersionHistoryProps = {
  noteId: string;
  noteTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Geri yükleme sunucuda tamamlanınca. */
  onRestored?: () => void;
  /** Geri yükleme yetkisi (görüntüleyicide yok: yalnızca okur). */
  canRestore?: boolean;
};

/**
 * Sürüm geçmişi (Dialogs, MVersions): solda liste, sağda seçili sürümün salt okunur
 * önizlemesi; "Bu sürümü geri yükle" onaylıdır ve yeni sürüm olarak kaydedilir.
 */
export function VersionHistory({
  noteId,
  noteTitle,
  open,
  onOpenChange,
  onRestored,
  canRestore = true,
}: VersionHistoryProps) {
  const list = useFetcher<VersionsData>();
  const preview = useFetcher<VersionsData>();
  const restore = useFetcher<{ ok: boolean }>();
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const base = `/api/notlar/${encodeURIComponent(noteId)}/surumler`;

  const loadList = list.load;
  useEffect(() => {
    if (open) void loadList(base);
  }, [open, base, loadList]);

  const versions = list.data?.versions ?? [];
  const current =
    (selected && versions.some((v) => v.id === selected) ? selected : null) ??
    versions[1]?.id ??
    versions[0]?.id ??
    null;

  const loadPreview = preview.load;
  useEffect(() => {
    if (open && current) void loadPreview(`${base}?surum=${encodeURIComponent(current)}`);
  }, [open, current, base, loadPreview]);

  const restoring = restore.state !== "idle";
  // Geri yükleme isteği (ve ardından gelen yeniden doğrulama) bitince kapan.
  const awaitingRestore = useRef(false);
  useEffect(() => {
    if (!awaitingRestore.current || restoring || !restore.data) return;
    awaitingRestore.current = false;
    if (restore.data.ok) {
      onRestored?.();
      onOpenChange(false);
    }
  }, [restoring, restore.data, onRestored, onOpenChange]);

  const selectedItem = versions.find((v) => v.id === current);
  const shown = preview.data?.preview?.id === current ? preview.data.preview : null;
  const isCurrent = selectedItem?.current ?? false;
  const when = (v: VersionListItem) => formatRelativeDateTime(new Date(v.updatedAt));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[min(860px,calc(100dvh-2rem))] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border border-line bg-surface p-0 text-fg shadow-elevated ring-0 max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-t-[20px] max-md:rounded-b-none sm:max-w-[860px] md:flex-row"
        >
          <div className="flex min-h-0 flex-col gap-3.5 p-6 md:w-[420px] md:shrink-0 md:border-r md:border-line">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-semibold">Sürüm geçmişi</DialogTitle>
              <Button
                variant="ghost"
                size="icon-lg"
                className="rounded-full"
                aria-label="Kapat"
                onClick={() => onOpenChange(false)}
              >
                <X className="size-5" aria-hidden="true" />
              </Button>
            </div>
            <DialogDescription className="text-[13px] text-muted-foreground">
              {noteTitle || "Başlıksız not"} · son 50 sürüm saklanır. Bir sürümü seçince önizlemesi
              salt okunur gösterilir.
            </DialogDescription>
            <div
              className="-mx-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-1"
              role="listbox"
              aria-label="Sürümler"
            >
              {list.state === "loading" && versions.length === 0 && (
                <p className="m-0 py-6 text-center text-muted-foreground">Yükleniyor…</p>
              )}
              {list.state === "idle" && versions.length === 0 && (
                <p className="m-0 py-6 text-center text-muted-foreground">
                  Henüz kayıtlı sürüm yok.
                </p>
              )}
              {versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="option"
                  aria-selected={v.id === current}
                  onClick={() => setSelected(v.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50",
                    v.id === current && "bg-primary-soft hover:bg-primary-soft",
                  )}
                >
                  <Avatar name={v.authorName ?? "?"} color={v.authorColor ?? "#5F5D57"} size={28} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className="font-semibold">{when(v)}</b>
                    <small className="truncate text-xs text-muted-foreground">
                      {v.authorName ?? "Silinmiş kullanıcı"}
                      {v.current ? " · şu anki sürüm" : ""}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-2.5 rounded-[10px] bg-hover px-3 py-2.5 text-[13px] text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Geri yükleme yeni bir sürüm olarak kaydedilir; şu anki sürüm de geçmişte kalır.
              </span>
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-3.5 max-md:hidden">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Kapat
              </Button>
              <Button
                disabled={!canRestore || !selectedItem || isCurrent || restoring}
                onClick={() => setConfirming(true)}
              >
                Bu sürümü geri yükle
              </Button>
            </div>
          </div>

          <section
            aria-label={selectedItem ? `Önizleme: ${when(selectedItem)} sürümü` : "Önizleme"}
            className="flex min-h-0 flex-1 flex-col border-t border-line md:border-t-0"
          >
            {selectedItem && (
              <div className="flex items-center gap-2.5 bg-primary-soft py-2.5 pr-3 pl-4 text-[13px] text-primary">
                <span className="min-w-0 flex-1">
                  <b className="font-semibold">{when(selectedItem)}</b> sürümünü görüyorsun · salt
                  okunur
                </span>
                {!isCurrent && versions[0] && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setSelected(versions[0]!.id)}
                  >
                    Şu ana dön
                  </Button>
                )}
              </div>
            )}
            <div className="min-h-[160px] flex-1 overflow-y-auto px-5 pt-4 pb-5">
              {shown ? (
                <VersionBody
                  key={shown.id}
                  title={shown.title}
                  html={shown.html}
                  tasks={shown.tasks}
                />
              ) : (
                selectedItem && <p className="m-0 text-muted-foreground">Yükleniyor…</p>
              )}
            </div>
            <div className="flex gap-2 border-t border-line px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] md:hidden">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Vazgeç
              </Button>
              <Button
                className="flex-[2]"
                disabled={!canRestore || !selectedItem || isCurrent || restoring}
                onClick={() => setConfirming(true)}
              >
                Bu sürümü geri yükle
              </Button>
            </div>
          </section>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        tone="primary"
        title="Bu sürüm geri yüklensin mi?"
        description={
          selectedItem
            ? `Not, ${when(selectedItem)} sürümüne döner. Şu anki hali geçmişte kalır.`
            : "Not seçili sürüme döner."
        }
        confirmLabel="Geri yükle"
        onConfirm={() => {
          if (!current) return;
          awaitingRestore.current = true;
          void restore.submit(
            { intent: "restore-version", id: noteId, versionId: current },
            { method: "post", action: NOTES_ACTION },
          );
        }}
      />
    </>
  );
}

function VersionBody({ title, html, tasks }: { title: string; html: string; tasks?: Task[] }) {
  return (
    <div className="flex flex-col gap-2">
      {title && <b className="text-[17px] font-semibold">{title}</b>}
      {tasks ? <VersionTaskTree tasks={tasks} /> : <VersionHtml html={html} />}
    </div>
  );
}

function VersionHtml({ html }: { html: string }) {
  const editor = useNoteEditor({ initialHtml: html, editable: false, label: "Sürüm önizlemesi" });
  return <NoteEditorContent editor={editor} />;
}

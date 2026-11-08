import { Check, FileText, FolderOutput, TriangleAlert, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRevalidator } from "react-router";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "~/components/ui/button";
import type { NoteColor } from "~/db/schema";
import { MOVE_UNDO_MS } from "~/domain/projects/lifecycle";
import { roleLabel } from "~/domain/projects/permissions";
import { noteBg } from "./colors";
import { canAddTo, type MoveTarget, type NoteProject } from "./note-access";
import { noteHref } from "./note-links";
import { NOTES_ACTION } from "./use-note-actions";

/**
 * "Taşı veya kopyala…" (kişisel not: Taşı / Kopyala sekmeleri) ve "Kopyala…" (proje
 * notu: yalnızca kopya) diyalogları (Dialogs, Dialogs2 "Proje notu · kopyala", MMove).
 * Masaüstü ve tablette ortalanmış diyalog, mobilde alttan açılan sayfa. Görüntüleyici
 * olunan projeler seçilemez ("Görüntüleyici, not ekleyemez").
 */

/** Taşıma "Geri al" toast'ının süresi (sunucu penceresi 10 sn + ağ payı). */
export const MOVE_TOAST_MS = MOVE_UNDO_MS;

type Result = { ok: boolean; error?: string };

async function postNote(form: Record<string, string>): Promise<Result> {
  try {
    const res = await fetch(NOTES_ACTION, { method: "POST", body: new URLSearchParams(form) });
    const body = (await res.json().catch(() => ({}))) as Result;
    return res.ok && body.ok
      ? { ok: true }
      : { ok: false, error: body.error ?? "Bir sorun oluştu" };
  } catch {
    return { ok: false, error: "Bağlantı kurulamadı. Tekrar dene." };
  }
}

/** Kopyanın yeri: kişisel alan ya da proje. */
export type CopyPlace = { kind: "personal" } | { kind: "project"; project: NoteProject };

/**
 * Taşıma ve kopyalama istekleri. Taşımada 10 sn "Geri al" toast'ı (sonra kesinleşir);
 * kopyada "Aç" bağlantılı toast. Bitince sayfa verisi yeniden doğrulanır.
 */
export function useMoveCopy() {
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const revalidate = useRef(revalidator.revalidate);
  useEffect(() => {
    revalidate.current = revalidator.revalidate;
  });

  const move = useCallback(async (noteId: string, project: NoteProject) => {
    const r = await postNote({ intent: "move-to-project", id: noteId, projectId: project.id });
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    void revalidate.current();
    toast(`Not ${project.name} projesine taşındı`, {
      duration: MOVE_TOAST_MS,
      action: {
        label: "Geri al",
        onClick: () => {
          void postNote({ intent: "undo-move", id: noteId }).then((u) => {
            if (!u.ok) return void toast.error(u.error);
            toast("Taşıma geri alındı; not Notlarım'a döndü");
            void revalidate.current();
          });
        },
      },
    });
    return true;
  }, []);

  const copy = useCallback(
    async (noteId: string, place: CopyPlace) => {
      const newId = crypto.randomUUID();
      const form: Record<string, string> = { intent: "copy-to", id: noteId, newId };
      if (place.kind === "project") form.projectId = place.project.id;
      const r = await postNote(form);
      if (!r.ok) {
        toast.error(r.error);
        return false;
      }
      void revalidate.current();
      const href = noteHref({
        id: newId,
        projectId: place.kind === "project" ? place.project.id : null,
      });
      toast(
        place.kind === "personal"
          ? "Kopya Notlarım'da oluşturuldu"
          : `Kopya ${place.project.name} projesinde oluşturuldu`,
        { action: { label: "Aç", onClick: () => navigate(href) } },
      );
      return true;
    },
    [navigate],
  );

  return { move, copy };
}

type Source = { kind: "personal" } | { kind: "project"; project: NoteProject };

export type MoveCopyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: { id: string; title: string; color: NoteColor };
  source: Source;
  /** Üyesi olunan projeler (rolüyle). */
  targets: readonly MoveTarget[];
  /** Kişisel notta başlangıç sekmesi. */
  initialTab?: "move" | "copy";
  /** Onaydan önce (bekleyen kayıtlar gönderilsin). */
  before?: () => Promise<void>;
  onMoved?: (project: NoteProject) => void;
  onCopied?: (place: CopyPlace) => void;
};

type OptionKey = "personal" | string;

export function MoveCopyDialog({
  open,
  onOpenChange,
  note,
  source,
  targets,
  initialTab = "move",
  before,
  onMoved,
  onCopied,
}: MoveCopyDialogProps) {
  const personal = source.kind === "personal";
  const [tab, setTab] = useState<"move" | "copy">(personal ? initialTab : "copy");
  const [busy, setBusy] = useState(false);
  const actions = useMoveCopy();

  // Proje notunun kendi projesi hedef olamaz (aynı alanda "Kopyasını oluştur" var).
  const projects = useMemo(
    () => targets.filter((t) => source.kind === "personal" || t.id !== source.project.id),
    [targets, source],
  );
  const firstWritable = projects.find(canAddTo)?.id ?? null;
  const [moveSel, setMoveSel] = useState<OptionKey | null>(firstWritable);
  const [copySel, setCopySel] = useState<OptionKey>("personal");

  const move = tab === "move";
  const selected = move ? moveSel : copySel;
  const selectedProject = projects.find((p) => p.id === selected) ?? null;

  const title = move ? "Notu projeye taşı" : "Notu kopyala";
  const primary = move
    ? selectedProject
      ? `${selectedProject.name} projesine taşı`
      : "Projeye taşı"
    : selected === "personal"
      ? "Kişisel alanıma kopyala"
      : `${selectedProject?.name ?? ""} projesine kopyala`;

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await before?.();
      if (move) {
        if (!selectedProject) return;
        const p = {
          id: selectedProject.id,
          name: selectedProject.name,
          color: selectedProject.color,
        };
        if (await actions.move(note.id, p)) {
          onOpenChange(false);
          onMoved?.(p);
        }
      } else {
        const place: CopyPlace =
          selected === "personal" || !selectedProject
            ? { kind: "personal" }
            : {
                kind: "project",
                project: {
                  id: selectedProject.id,
                  name: selectedProject.name,
                  color: selectedProject.color,
                },
              };
        if (await actions.copy(note.id, place)) {
          onOpenChange(false);
          onCopied?.(place);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = tab === "move" ? "copy" : "move";
    setTab(next);
    tabRefs.current[next === "move" ? 0 : 1]?.focus();
  };

  const moveOptions: Option[] = projects.map((p) => projectOption(p));
  const copyOptions: Option[] = [
    { key: "personal", label: "Kişisel alanım", hint: "Notlarım", disabled: false },
    ...projects.map((p) => projectOption(p)),
  ];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-dim data-[state=open]:animate-in data-[state=open]:fade-in-0 reduced-motion:animate-none" />
        <DialogPrimitive.Content
          data-todo-esc=""
          aria-describedby="tasi-kopyala-aciklama"
          className={cn(
            "fixed z-50 flex max-h-[92dvh] flex-col gap-4 overflow-y-auto border border-line bg-surface text-fg shadow-elevated outline-none",
            "inset-x-0 bottom-0 rounded-t-[20px] px-4 pt-2 pb-[max(24px,env(safe-area-inset-bottom))]",
            "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 max-sm:data-[state=open]:slide-in-from-bottom-8 reduced-motion:animate-none",
          )}
        >
          <DialogPrimitive.Close asChild>
            <button
              type="button"
              aria-label="Kapat"
              className="mx-auto -mb-2 flex h-6 w-16 shrink-0 items-center justify-center sm:hidden"
            >
              <span className="h-1 w-10 rounded-full bg-line" aria-hidden="true" />
            </button>
          </DialogPrimitive.Close>
          <div className="flex items-center gap-3">
            {!personal && (
              <span
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"
                aria-hidden="true"
              >
                <FolderOutput className="size-5" />
              </span>
            )}
            <DialogPrimitive.Title className="m-0 flex-1 text-lg font-semibold">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Kapat"
                className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-hover hover:text-fg max-sm:hidden"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </DialogPrimitive.Close>
          </div>

          <div
            className={cn(
              "flex items-center gap-2.5 rounded-[10px] px-3 py-2.5",
              note.color === "default" && "border border-line",
            )}
            style={{ background: noteBg(note.color) }}
          >
            <span className="min-w-0 flex-1 truncate font-semibold">
              {note.title || "Başlıksız not"}
            </span>
            {source.kind === "personal" ? (
              <span className="shrink-0 text-[13px] text-muted-foreground">Kişisel not</span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
                <span
                  className="size-2 rounded-full"
                  style={{ background: `var(--p-${source.project.color})` }}
                  aria-hidden="true"
                />
                {source.project.name}
              </span>
            )}
          </div>

          {personal && (
            <div
              role="tablist"
              aria-label="İşlem"
              className="flex gap-[3px] self-stretch rounded-xl bg-hover p-[3px] sm:inline-flex sm:self-start sm:rounded-[10px]"
            >
              {(["move", "copy"] as const).map((t, i) => (
                <button
                  key={t}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`tasi-kopyala-${t}`}
                  aria-selected={tab === t}
                  aria-controls="tasi-kopyala-panel"
                  tabIndex={tab === t ? 0 : -1}
                  onClick={() => setTab(t)}
                  onKeyDown={onTabKey}
                  className={cn(
                    "h-10 flex-1 rounded-[9px] px-3.5 font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-8 sm:flex-none sm:rounded-lg",
                    tab === t && "bg-surface text-fg shadow-[0_1px_2px_rgba(0,0,0,.08)]",
                  )}
                >
                  {t === "move" ? "Taşı" : "Kopyala"}
                </button>
              ))}
            </div>
          )}

          <div
            id="tasi-kopyala-panel"
            role={personal ? "tabpanel" : undefined}
            aria-labelledby={personal ? `tasi-kopyala-${tab}` : undefined}
            className="flex flex-col gap-4"
          >
            {move ? (
              moveOptions.length ? (
                <OptionGroup
                  key="move"
                  label="Hedef proje"
                  options={moveOptions}
                  value={moveSel}
                  onChange={setMoveSel}
                />
              ) : (
                <p className="m-0 rounded-[10px] bg-hover px-3 py-2.5 text-[13px] text-muted-foreground">
                  Henüz bir projen yok. Sol menüden yeni proje açınca notu oraya taşıyabilirsin.
                </p>
              )
            ) : (
              <OptionGroup
                key="copy"
                label="Kopyanın yeri"
                options={copyOptions}
                value={copySel}
                onChange={(v) => setCopySel(v ?? "personal")}
              />
            )}
            {move && (
              <div className="flex gap-2.5 rounded-[10px] bg-warn-soft px-3 py-2.5 text-[13px] text-warn">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  Not projenin olur, kişisel alandan kalkar. Taşıdıktan sonra 10 sn içinde
                  toast&apos;tan geri alabilirsin; sonra kesinleşir.
                </span>
              </div>
            )}
            <DialogPrimitive.Description
              id="tasi-kopyala-aciklama"
              className="m-0 text-[13px] text-muted-foreground"
            >
              {move
                ? "Projedeki herkes notu görür; yöneticiler ve düzenleyiciler düzenleyebilir. Asıl notun kişisel alanında kalsın istiyorsan Kopyala'yı seç."
                : personal
                  ? "Kopya seçtiğin yerde yeni bir not olarak oluşur; asıl not kişisel alanında kalır. Sürüm geçmişi kopyalanmaz."
                  : "Proje notu taşınamaz, yalnızca kopyalanır. Asıl not projede kalır; kopya görev ağacıyla birlikte yeni bir not olarak oluşur. Kişisel alanda atama olmadığı için atamalar kopyalanmaz."}
            </DialogPrimitive.Description>
          </div>

          <div className="flex justify-end gap-2 max-sm:[&>*:first-child]:flex-1 max-sm:[&>*:last-child]:flex-[2]">
            <DialogPrimitive.Close asChild>
              <Button variant="outline" disabled={busy}>
                Vazgeç
              </Button>
            </DialogPrimitive.Close>
            <Button
              onClick={() => void confirm()}
              disabled={busy || (move && !selectedProject) || (!move && selected === null)}
            >
              {primary}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type Option = {
  key: OptionKey;
  label: string;
  hint: string;
  disabled: boolean;
  color?: string;
};

function projectOption(p: MoveTarget): Option {
  const writable = canAddTo(p);
  return {
    key: p.id,
    label: p.name,
    hint: writable ? roleLabel(p.role) : "Görüntüleyici, not ekleyemez",
    disabled: !writable,
    color: `var(--p-${p.color})`,
  };
}

/** Tek seçimli liste (radiogroup): ↑ / ↓ seçer, devre dışı seçenekler atlanır. */
function OptionGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option[];
  value: OptionKey | null;
  onChange: (key: OptionKey | null) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.filter((o) => !o.disabled);
  const focusKey = value ?? enabled[0]?.key;

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const dir =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? -1
          : 0;
    if (!dir) return;
    e.preventDefault();
    for (let j = i + dir; j >= 0 && j < options.length; j += dir) {
      const o = options[j]!;
      if (o.disabled) continue;
      onChange(o.key);
      refs.current[j]?.focus();
      return;
    }
  };

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      {options.map((o, i) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={o.disabled || undefined}
            tabIndex={o.key === focusKey && !o.disabled ? 0 : -1}
            onClick={() => !o.disabled && onChange(o.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "flex min-h-11 w-full items-center gap-3 rounded-[10px] border border-line px-3 py-2.5 text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-primary",
              on && "border-primary bg-primary-soft hover:bg-primary-soft",
              o.disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
            )}
          >
            {o.color ? (
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: o.color }}
                aria-hidden="true"
              />
            ) : (
              <FileText className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 truncate font-medium">{o.label}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>
            {on && (
              <Check
                className="size-[18px] shrink-0 text-primary"
                strokeWidth={2.5}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

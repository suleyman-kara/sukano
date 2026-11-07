import { Bell, ImageIcon, ListChecks, Palette, Paperclip, Pin, SquareCheckBig } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import type { NoteColor } from "~/db/schema";
import { isBlankHtml } from "~/domain/notes/html";
import { ColorPalette } from "./color-palette";
import { noteBg } from "./colors";
import { FormattingToolbar, NoteEditorContent, useNoteEditor } from "./note-editor";

export type ComposerDraft = { title: string; bodyHtml: string; color: NoteColor; pinned: boolean };

type ComposerProps = {
  /** Kapanınca, not boş değilse çağrılır. */
  onSave: (draft: ComposerDraft) => void;
  /** Başlangıçta açık (mobil tam ekran "Not al"). */
  defaultOpen?: boolean;
  /** Kapandıktan sonra (kaydetsin ya da kaydetmesin). */
  onClose?: () => void;
  className?: string;
};

const IB =
  "inline-flex size-[34px] shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-[color-mix(in_srgb,var(--fg)_7%,transparent)] hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45 pointer-coarse:size-11";

/**
 * "Not al" alanı. Kapalıyken tek satır; tıklanınca başlık, gövde ve araç
 * çubuğuyla açılır. Kapat düğmesi, Esc ya da dışarı tıklama notu kaydeder;
 * başlık ve gövde boşsa hiçbir şey kaydedilmez.
 */
export function Composer({ onSave, defaultOpen = false, onClose, className }: ComposerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState("");
  const [color, setColor] = useState<NoteColor>("default");
  const [pinned, setPinned] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const bodyRef = useRef("");
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const editor = useNoteEditor({
    initialHtml: "",
    onChange: (html) => {
      bodyRef.current = html;
    },
    placeholder: "Not al…",
    label: "Not",
    className: "text-[15px] leading-[1.65]",
  });

  const close = () => {
    const bodyHtml = bodyRef.current;
    if (title.trim() || !isBlankHtml(bodyHtml)) {
      onSave({
        title: title.trim(),
        bodyHtml: isBlankHtml(bodyHtml) ? "" : bodyHtml,
        color,
        pinned,
      });
    }
    setTitle("");
    setColor("default");
    setPinned(false);
    bodyRef.current = "";
    editor?.commands.clearContent();
    setOpen(false);
    onClose?.();
  };

  // Dışarı tıklama kapatır (ve kaydeder). Açılır palet/menü Radix portalında olduğu
  // için portal içindeki tıklamalar sayılmaz.
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || formRef.current?.contains(target)) return;
      if (
        target.closest("[data-radix-popper-content-wrapper], [role=dialog], [data-sonner-toaster]")
      )
        return;
      closeRef.current();
    };
    // Esc kapatır; açık palet ya da bağlantı penceresi önce kendisi kapanır.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (!formRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <div
        className={cn(
          "mx-auto flex w-full max-w-[600px] items-center gap-0.5 rounded-2xl border border-line bg-surface py-1 pr-1.5 pl-[18px] shadow-elevated md:gap-1",
          className,
        )}
      >
        <button
          type="button"
          id="not-al"
          onClick={() => setOpen(true)}
          className="h-11 min-w-0 flex-1 cursor-text text-left text-[15px] text-muted-foreground outline-none focus-visible:text-fg"
        >
          Not al…
        </button>
        <button
          type="button"
          disabled
          className={cn(IB, "size-11 md:size-9")}
          aria-label="Yeni yapılacaklar notu"
          title="Yapılacaklar notu (yakında)"
        >
          <SquareCheckBig className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled
          className={cn(IB, "size-11 md:size-9")}
          aria-label="Görsel ekleyerek not başlat"
          title="Görsel ekle (yakında)"
        >
          <ImageIcon className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      aria-label="Yeni not"
      onSubmit={(e) => {
        e.preventDefault();
        close();
      }}
      className={cn(
        "mx-auto flex w-full max-w-[600px] flex-col rounded-2xl border border-line shadow-elevated",
        className,
      )}
      style={{ background: noteBg(color) }}
    >
      <div className="flex items-center gap-2 pt-3 pr-2 pb-0.5 pl-[18px]">
        <label htmlFor="yeni-not-baslik" className="sr-only">
          Not başlığı
        </label>
        <input
          id="yeni-not-baslik"
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              editor?.commands.focus("end");
            }
          }}
          placeholder="Başlık"
          autoComplete="off"
          className="h-7 min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          className={cn(IB, pinned && "text-primary hover:text-primary")}
          aria-label={pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
          title={pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
          aria-pressed={pinned}
          onClick={() => setPinned((p) => !p)}
        >
          <Pin className="size-[18px]" fill={pinned ? "currentColor" : "none"} aria-hidden="true" />
        </button>
      </div>
      <FormattingToolbar editor={editor} className="px-3 py-0.5" />
      <div className="px-[18px] pt-1.5 pb-2">
        <NoteEditorContent editor={editor} />
      </div>
      <div className="flex items-center gap-0.5 pt-1.5 pr-2.5 pb-2 pl-3">
        <Popover open={paletteOpen} onOpenChange={setPaletteOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={IB} aria-label="Renk" title="Renk">
              <Palette className="size-[18px]" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto rounded-xl p-2.5">
            <ColorPalette value={color} onChange={setColor} />
          </PopoverContent>
        </Popover>
        <button
          type="button"
          disabled
          className={IB}
          aria-label="Not hatırlatıcısı"
          title="Not hatırlatıcısı (yakında)"
        >
          <Bell className="size-[18px]" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled
          className={IB}
          aria-label="Dosya ekle"
          title="Dosya ekle (yakında)"
        >
          <Paperclip className="size-[18px]" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled
          className={IB}
          aria-label="Yapılacaklar notuna dönüştür"
          title="Yapılacaklar notuna dönüştür (yakında)"
        >
          <ListChecks className="size-[18px]" aria-hidden="true" />
        </button>
        <span className="flex-1 px-3 text-right text-xs text-muted-foreground max-sm:hidden">
          Otomatik kaydedilir
        </span>
        <span className="flex-1 sm:hidden" />
        <Button type="submit" variant="ghost" className="h-[34px] px-3.5">
          Kapat
        </Button>
      </div>
    </form>
  );
}

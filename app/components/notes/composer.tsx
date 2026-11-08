import {
  Bell,
  FileText,
  GripVertical,
  ImageIcon,
  ListChecks,
  Palette,
  Paperclip,
  Pin,
  Plus,
  SquareCheckBig,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import type { NoteColor } from "~/db/schema";
import { isBlankHtml } from "~/domain/notes/html";
import { textToTaskLines } from "~/domain/tasks/convert";
import { ColorPalette } from "./color-palette";
import { noteBg } from "./colors";
import { FormattingToolbar, NoteEditorContent, useNoteEditor } from "./note-editor";

export type ComposerMode = "text" | "todo";

export type ComposerDraft = {
  kind: ComposerMode;
  title: string;
  bodyHtml: string;
  /** Yapılacaklar modunda üst seviye görev başlıkları (boşlar atılmış). */
  tasks: string[];
  color: NoteColor;
  pinned: boolean;
};

type TodoLine = { key: number; title: string };

/** Satır anahtarları (yalnızca React listesi için). */
let lineSeq = 0;
const nextLineKey = () => ++lineSeq;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type ComposerProps = {
  /** Kapanınca, not boş değilse çağrılır. */
  onSave: (draft: ComposerDraft) => void;
  /** Başlangıçta açık (mobil tam ekran "Not al"). */
  defaultOpen?: boolean;
  /** Açılış modu: metin ya da yapılacaklar notu (Composer `mode=todo`). */
  defaultMode?: ComposerMode;
  /** Kapandıktan sonra (kaydetsin ya da kaydetmesin). */
  onClose?: () => void;
  /** Kapalı alanın metni (proje sayfasında "Projeye not ekle…"). */
  label?: string;
  className?: string;
};

const IB =
  "inline-flex size-[34px] shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-[color-mix(in_srgb,var(--fg)_7%,transparent)] hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45 pointer-coarse:size-11";

/**
 * "Not al" alanı. Kapalıyken tek satır; tıklanınca başlık, gövde ve araç
 * çubuğuyla açılır. Kapat düğmesi, Esc ya da dışarı tıklama notu kaydeder;
 * başlık ve gövde boşsa hiçbir şey kaydedilmez.
 */
export function Composer({
  onSave,
  defaultOpen = false,
  defaultMode = "text",
  onClose,
  label = "Not al…",
  className,
}: ComposerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [mode, setMode] = useState<ComposerMode>(defaultMode);
  const blankLines = (): TodoLine[] => [
    { key: nextLineKey(), title: "" },
    { key: nextLineKey(), title: "" },
  ];
  const [lines, setLines] = useState<TodoLine[]>(blankLines);
  const linesRef = useRef<HTMLDivElement>(null);
  const focusLine = useRef<{ index: number; caret: number | "end" } | null>(null);
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
    const tasks = lines.map((l) => l.title.trim()).filter(Boolean);
    const hasContent = mode === "todo" ? tasks.length > 0 : !isBlankHtml(bodyHtml);
    if (title.trim() || hasContent) {
      onSave({
        kind: mode,
        title: title.trim(),
        bodyHtml: mode === "text" && !isBlankHtml(bodyHtml) ? bodyHtml : "",
        tasks: mode === "todo" ? tasks : [],
        color,
        pinned,
      });
    }
    setMode(defaultMode);
    setLines(blankLines());
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

  useLayoutEffect(() => {
    const f = focusLine.current;
    if (!f) return;
    focusLine.current = null;
    const el = linesRef.current?.querySelectorAll<HTMLInputElement>("input[data-line]")[f.index];
    if (!el) return;
    el.focus();
    const n = f.caret === "end" ? el.value.length : f.caret;
    el.setSelectionRange(n, n);
  });

  const switchMode = (next: ComposerMode) => {
    if (next === "todo") {
      const titles = textToTaskLines(bodyRef.current).map((l) => l.title);
      setLines(
        titles.length ? titles.map((t) => ({ key: nextLineKey(), title: t })) : blankLines(),
      );
    } else {
      const html = lines
        .map((l) => l.title.trim())
        .filter(Boolean)
        .map((t) => `<p>${escapeHtml(t)}</p>`)
        .join("");
      bodyRef.current = html;
      editor?.commands.setContent(html);
    }
    setMode(next);
  };

  const lineKey = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    const el = e.currentTarget;
    if (e.key === "Enter") {
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      const at = el.selectionStart ?? el.value.length;
      const before = el.value.slice(0, at);
      const after = el.value.slice(at);
      setLines((ls) => {
        const next = [...ls];
        next[index] = { ...next[index]!, title: before };
        next.splice(index + 1, 0, { key: nextLineKey(), title: after });
        return next;
      });
      focusLine.current = { index: index + 1, caret: 0 };
    } else if (e.key === "Backspace" && el.value === "" && lines.length > 1) {
      e.preventDefault();
      setLines((ls) => ls.filter((_, i) => i !== index));
      focusLine.current = { index: Math.max(0, index - 1), caret: "end" };
    } else if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault();
      focusLine.current = { index: index - 1, caret: el.selectionStart ?? 0 };
      setLines((ls) => [...ls]);
    } else if (e.key === "ArrowDown" && index < lines.length - 1) {
      e.preventDefault();
      focusLine.current = { index: index + 1, caret: el.selectionStart ?? 0 };
      setLines((ls) => [...ls]);
    }
  };

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
          {label}
        </button>
        <button
          type="button"
          className={cn(IB, "size-11 md:size-9")}
          aria-label="Yeni yapılacaklar notu"
          title="Yapılacaklar notu"
          onClick={() => {
            setMode("todo");
            setOpen(true);
          }}
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
      aria-label={mode === "todo" ? "Yeni yapılacaklar notu" : "Yeni not"}
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
              if (mode === "todo") {
                linesRef.current?.querySelector<HTMLInputElement>("input[data-line]")?.focus();
              } else editor?.commands.focus("end");
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
      {mode === "text" ? (
        <>
          <FormattingToolbar editor={editor} className="px-3 py-0.5" />
          <div data-grow="" className="px-[18px] pt-1.5 pb-2">
            <NoteEditorContent editor={editor} />
          </div>
        </>
      ) : (
        <div
          ref={linesRef}
          data-grow=""
          role="list"
          aria-label="Görevler"
          className="flex flex-col gap-0.5 px-2.5 pt-1.5 pb-1"
        >
          {lines.map((l, i) => (
            <div
              key={l.key}
              role="listitem"
              className="group/line flex min-h-[38px] items-center gap-1.5 rounded-lg py-0.5 pr-2 pl-1 focus-within:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] pointer-coarse:min-h-11"
            >
              <GripVertical
                className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/line:opacity-70"
                aria-hidden="true"
              />
              <span className="task-cb pointer-events-none" aria-hidden="true" />
              <input
                data-line=""
                value={l.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, title } : x)));
                }}
                onKeyDown={(e) => lineKey(e, i)}
                placeholder="Görev"
                aria-label="Görev başlığı"
                autoComplete="off"
                enterKeyHint="next"
                className="h-[30px] min-w-0 flex-1 bg-transparent px-1.5 text-[15px] outline-none placeholder:text-muted-foreground"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              setLines((ls) => [...ls, { key: nextLineKey(), title: "" }]);
              focusLine.current = { index: lines.length, caret: 0 };
            }}
            className="flex w-full items-center gap-2.5 rounded-lg py-2 pr-2 pl-[30px] text-muted-foreground outline-none hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-[18px]"
          >
            <Plus aria-hidden="true" />
            Görev ekle
          </button>
        </div>
      )}
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
        {mode === "text" ? (
          <button
            type="button"
            className={IB}
            aria-label="Yapılacaklar notuna dönüştür"
            title="Yapılacaklar notuna dönüştür"
            onClick={() => switchMode("todo")}
          >
            <ListChecks className="size-[18px]" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className={IB}
            aria-label="Metin notuna dönüştür"
            title="Metin notuna dönüştür"
            onClick={() => switchMode("text")}
          >
            <FileText className="size-[18px]" aria-hidden="true" />
          </button>
        )}
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

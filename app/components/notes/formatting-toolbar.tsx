import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
  CaseSensitive,
  Bold,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  RemoveFormatting,
  Strikethrough,
} from "lucide-react";
import { useId, useState } from "react";
import { cn } from "cn";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";

const TB =
  "ib ib-tb inline-flex shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-[color-mix(in_srgb,var(--fg)_7%,transparent)] hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-[color-mix(in_srgb,var(--fg)_12%,transparent)] aria-pressed:text-fg disabled:opacity-50";

const SEP = (
  <span
    className="mx-1 h-4 w-px shrink-0 bg-[color-mix(in_srgb,var(--fg)_16%,transparent)]"
    aria-hidden="true"
  />
);

type FormatState = {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  h2: boolean;
  h3: boolean;
  bullet: boolean;
  ordered: boolean;
  link: boolean;
};

const EMPTY: FormatState = {
  bold: false,
  italic: false,
  strike: false,
  h2: false,
  h3: false,
  bullet: false,
  ordered: false,
  link: false,
};

/**
 * Biçimlendirme çubuğu (tasarım v2): Kalın · İtalik · Üstü çizili | Başlık · Alt başlık |
 * Madde listesi · Numaralı liste | Bağlantı · Biçimi temizle. Açık notta ve Not al alanında
 * "Aa" düğmesinin arkasındadır (`FormatPanel`); seçim balonu yoktur.
 */
export function FormattingToolbar({
  editor,
  className,
}: {
  editor: Editor | null;
  className?: string;
}) {
  const state =
    useEditorState({
      editor,
      selector: ({ editor: e }): FormatState => ({
        bold: e?.isActive("bold") ?? false,
        italic: e?.isActive("italic") ?? false,
        strike: e?.isActive("strike") ?? false,
        h2: e?.isActive("heading", { level: 2 }) ?? false,
        h3: e?.isActive("heading", { level: 3 }) ?? false,
        bullet: e?.isActive("bulletList") ?? false,
        ordered: e?.isActive("orderedList") ?? false,
        link: e?.isActive("link") ?? false,
      }),
    }) ?? EMPTY;

  const chain = () => editor?.chain().focus();
  const button = (
    label: string,
    title: string,
    pressed: boolean,
    Icon: typeof Bold,
    run: () => void,
  ) => (
    <button
      type="button"
      className={TB}
      aria-label={label}
      title={title}
      aria-pressed={pressed}
      disabled={!editor}
      onClick={run}
    >
      <Icon aria-hidden="true" />
    </button>
  );

  return (
    <div
      role="toolbar"
      aria-label="Biçimlendirme"
      className={cn(
        "flex flex-wrap items-center gap-0.5 rounded-[10px] bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] p-[3px]",
        className,
      )}
    >
      {button("Kalın", "Kalın (Ctrl+B)", state.bold, Bold, () => chain()?.toggleBold().run())}
      {button("İtalik", "İtalik (Ctrl+I)", state.italic, Italic, () =>
        chain()?.toggleItalic().run(),
      )}
      {button("Üstü çizili", "Üstü çizili (Ctrl+Shift+S)", state.strike, Strikethrough, () =>
        chain()?.toggleStrike().run(),
      )}
      {SEP}
      {button("Başlık", "Başlık (## )", state.h2, Heading1, () =>
        chain()?.toggleHeading({ level: 2 }).run(),
      )}
      {button("Alt başlık", "Alt başlık (### )", state.h3, Heading2, () =>
        chain()?.toggleHeading({ level: 3 }).run(),
      )}
      {SEP}
      {button("Madde listesi", "Madde listesi (- )", state.bullet, List, () =>
        chain()?.toggleBulletList().run(),
      )}
      {button("Numaralı liste", "Numaralı liste (1. )", state.ordered, ListOrdered, () =>
        chain()?.toggleOrderedList().run(),
      )}
      {SEP}
      <LinkButton editor={editor} active={state.link} />
      <button
        type="button"
        className={TB}
        aria-label="Biçimi temizle"
        title="Biçimi temizle"
        disabled={!editor}
        onClick={() => chain()?.unsetAllMarks().clearNodes().run()}
      >
        <RemoveFormatting aria-hidden="true" />
      </button>
    </div>
  );
}

function LinkButton({ editor, active }: { editor: Editor | null; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const inputId = useId();

  const onOpenChange = (next: boolean) => {
    if (next) setUrl((editor?.getAttributes("link").href as string | undefined) ?? "");
    setOpen(next);
  };

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const href = url.trim();
    if (!editor) return;
    if (!href) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={TB}
          aria-label="Bağlantı"
          title="Bağlantı"
          aria-pressed={active}
          disabled={!editor}
        >
          <Link2 aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <form onSubmit={apply} className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-[13px] font-medium">
            Bağlantı adresi
          </label>
          <input
            id={inputId}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            inputMode="url"
            autoComplete="off"
            className="h-9 rounded-lg border border-line bg-surface px-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          />
          <div className="flex justify-end gap-2">
            {active && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  editor?.chain().focus().extendMarkRange("link").unsetLink().run();
                  setOpen(false);
                }}
              >
                Kaldır
              </Button>
            )}
            <Button type="submit" size="sm">
              Uygula
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Aa düğmesinin durumu: açık mı, klavyeyle mi açıldı (hareket kısalır). */
export function useFormatToggle(initial = false) {
  const [state, setState] = useState({ open: initial, quick: false });
  const id = useId();
  return {
    open: state.open,
    quick: state.quick,
    panelId: `bicim-${id}`,
    setOpen: (open: boolean) => setState({ open, quick: false }),
    /** Tıklama `detail === 0`: klavyeyle (Enter / Boşluk) basıldı. */
    toggle: (e?: React.MouseEvent) =>
      setState((s) => ({ open: !s.open, quick: e ? e.detail === 0 : false })),
  };
}

export type FormatToggleState = ReturnType<typeof useFormatToggle>;

/** "Aa" (Biçimlendirme) düğmesi: biçimlendirme çubuğunu açar/kapatır. */
export function FormatToggleButton({
  format,
  className,
}: {
  format: FormatToggleState;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label="Biçimlendirme"
      title="Biçimlendirme"
      aria-expanded={format.open}
      aria-controls={format.panelId}
      onClick={(e) => format.toggle(e)}
    >
      <CaseSensitive aria-hidden="true" />
    </button>
  );
}

/**
 * Biçimlendirme çubuğunun satırı (MotionSpec v2 "Aa çubuğu"): satır `grid-template-rows
 * 0fr → 1fr` 180 ms ease-in-out, çubuk saydamlık + 4 px kayma 180 ms ease-out, 40 ms
 * gecikmeli; kapanış 120 ms ease-in; klavyeyle açılınca 120 ms. Kapalıyken etkileşimsiz.
 */
export function FormatPanel({
  format,
  editor,
  className,
}: {
  format: FormatToggleState;
  editor: Editor | null;
  className?: string;
}) {
  return (
    <div
      id={format.panelId}
      className={cn("fmt-row", className)}
      data-open={format.open ? "" : undefined}
      data-hizli={format.quick ? "" : undefined}
      inert={!format.open}
    >
      <div>
        <div className="fmt-inner">
          <FormattingToolbar editor={editor} />
        </div>
      </div>
    </div>
  );
}

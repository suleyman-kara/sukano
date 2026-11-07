import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { Bold, Heading2, Italic, Link2, List } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { noteExtensions } from "~/domain/notes/editor-schema";

/**
 * Metin notu düzenleyicisinin eklentileri (şema tek kaynakta: `editor-schema.ts`;
 * Worker'daki not odası da aynı şemayı kullanır).
 */
export function createNoteExtensions(placeholder?: string) {
  return noteExtensions({ placeholder });
}

type UseNoteEditorOptions = {
  initialHtml: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  label: string;
  editable?: boolean;
  autofocus?: boolean;
  className?: string;
};

export function useNoteEditor({
  initialHtml,
  onChange,
  placeholder,
  label,
  editable = true,
  autofocus = false,
  className,
}: UseNoteEditorOptions) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  return useEditor({
    extensions: createNoteExtensions(placeholder),
    content: initialHtml || "",
    editable,
    autofocus: autofocus ? "end" : false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": label,
        "aria-multiline": "true",
        role: "textbox",
        class: cn("note-prose min-h-[84px] outline-none", className),
      },
    },
    onUpdate: ({ editor }) => onChangeRef.current?.(editor.isEmpty ? "" : editor.getHTML()),
  });
}

export function NoteEditorContent({
  editor,
  className,
}: {
  editor: Editor | null;
  className?: string;
}) {
  return <EditorContent editor={editor} className={className} />;
}

const TB =
  "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-[color-mix(in_srgb,var(--fg)_7%,transparent)] hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-[color-mix(in_srgb,var(--fg)_12%,transparent)] aria-pressed:text-fg disabled:opacity-50 pointer-coarse:size-11";

/** Biçimlendirme çubuğu: Kalın · İtalik · Başlık · Madde listesi · Bağlantı. */
export function FormattingToolbar({
  editor,
  className,
  children,
}: {
  editor: Editor | null;
  className?: string;
  children?: React.ReactNode;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      heading: e?.isActive("heading", { level: 2 }) ?? false,
      bullet: e?.isActive("bulletList") ?? false,
      link: e?.isActive("link") ?? false,
    }),
  }) ?? { bold: false, italic: false, heading: false, bullet: false, link: false };

  const chain = () => editor?.chain().focus();

  return (
    <div
      role="toolbar"
      aria-label="Biçimlendirme"
      className={cn("flex items-center gap-0.5", className)}
    >
      <button
        type="button"
        className={TB}
        aria-label="Kalın"
        title="Kalın (Ctrl+B)"
        aria-pressed={state.bold}
        disabled={!editor}
        onClick={() => chain()?.toggleBold().run()}
      >
        <Bold className="size-[18px]" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={TB}
        aria-label="İtalik"
        title="İtalik (Ctrl+I)"
        aria-pressed={state.italic}
        disabled={!editor}
        onClick={() => chain()?.toggleItalic().run()}
      >
        <Italic className="size-[18px]" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={TB}
        aria-label="Başlık"
        title="Başlık (## )"
        aria-pressed={state.heading}
        disabled={!editor}
        onClick={() => chain()?.toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-[18px]" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={TB}
        aria-label="Madde listesi"
        title="Madde listesi (- )"
        aria-pressed={state.bullet}
        disabled={!editor}
        onClick={() => chain()?.toggleBulletList().run()}
      >
        <List className="size-[18px]" aria-hidden="true" />
      </button>
      <LinkButton editor={editor} active={state.link} />
      {children}
    </div>
  );
}

function LinkButton({ editor, active }: { editor: Editor | null; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

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
          <Link2 className="size-[18px]" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <form onSubmit={apply} className="flex flex-col gap-2">
          <label htmlFor="baglanti-adresi" className="text-[13px] font-medium">
            Bağlantı adresi
          </label>
          <input
            id="baglanti-adresi"
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

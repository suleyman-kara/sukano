import type { Extensions } from "@tiptap/core";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { cn } from "cn";
import { noteExtensions } from "~/domain/notes/editor-schema";

/**
 * Metin notu düzenleyicisinin eklentileri (şema tek kaynakta: `editor-schema.ts`;
 * Worker'daki not odası da aynı şemayı kullanır).
 */
export function createNoteExtensions(placeholder?: string) {
  return noteExtensions({ placeholder });
}

/**
 * Ortak düzenleme: Yjs eklentileri (Collaboration + CollaborationCaret) not odası
 * sağlayıcısıyla birlikte tembel yüklenen modülde kurulur (`realtime/collab.ts`); Yjs
 * yalnızca not açılınca indirilir. `key` değişince (yeni sağlayıcı) editör yeniden kurulur.
 */
export type NoteEditorCollab = { key: object; extensions: Extensions };

type UseNoteEditorOptions = {
  initialHtml: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  label: string;
  editable?: boolean;
  autofocus?: boolean;
  className?: string;
  /**
   * Verilirse editör içeriği Yjs belgesinden alır (`initialHtml` ve `onChange` kullanılmaz;
   * gövde HTTP ile değil not odasıyla eşitlenir). Değişince editör yeniden kurulur.
   */
  collab?: NoteEditorCollab | null;
};

const noopSubscribe = () => () => {};

/**
 * Hidrasyon bitti mi: sunucuda ve hidrasyon çiziminde `false`, sonraki istemci
 * çizimlerinde `true`. Editör hidrasyondan sonra kurulurken (ızgaradan açılan not) ilk
 * çizimde oluşur: diyalog bir kare boş gövdeyle görünmez.
 */
function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function useNoteEditor({
  initialHtml,
  onChange,
  placeholder,
  label,
  editable = true,
  autofocus = false,
  className,
  collab = null,
}: UseNoteEditorOptions) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const hydrated = useHydrated();
  const editor = useEditor(
    {
      extensions: collab ? collab.extensions : createNoteExtensions(placeholder),
      ...(collab ? {} : { content: initialHtml || "" }),
      editable,
      autofocus: autofocus ? "end" : false,
      immediatelyRender: hydrated,
      editorProps: {
        attributes: {
          "aria-label": label,
          "aria-multiline": "true",
          role: "textbox",
          class: cn("note-prose min-h-[84px] outline-none", className),
        },
      },
      onUpdate: ({ editor }) => {
        if (!collab) onChangeRef.current?.(editor.isEmpty ? "" : editor.getHTML());
      },
    },
    [collab?.key],
  );
  // Düzenlenebilirlik (çevrimdışı, salt okunur) editörü yeniden kurmadan değişir.
  useEffect(() => {
    if (editor && !editor.isDestroyed && editor.isEditable !== editable)
      editor.setEditable(editable, false);
  }, [editor, editable]);
  return editor;
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

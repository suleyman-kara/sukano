/**
 * Metin notu düzenleyicisinin Tiptap eklentileri (tek kaynak). Tarayıcıdaki editör
 * (`note-editor.tsx`) ve Worker'daki ortak düzenleme odası (`NoteRoom`, Yjs ↔ HTML)
 * aynı şemayı buradan kurar; DOM gerektirmez.
 *
 * Sınırlı StarterKit: kalın, italik, üstü çizili, başlık (H2) ve alt başlık (H3), madde ve
 * numaralı liste, bağlantı. Markdown kısayolları (`## `, `### `, `- `, `1. `, `**kalın**`,
 * `*italik*`, `~~çizili~~`) StarterKit'in giriş kurallarıyla gelir.
 */
import { getSchema, type Extensions } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";

export type NoteExtensionOptions = {
  placeholder?: string;
  /**
   * Ortak düzenleme (Yjs): geri al / yinele geçmişi Collaboration eklentisine bırakılır
   * (StarterKit'in `undoRedo`'su Yjs ile birlikte çalışmaz).
   */
  collaborative?: boolean;
};

export function noteExtensions({
  placeholder,
  collaborative = false,
}: NoteExtensionOptions = {}): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      underline: false,
      ...(collaborative ? { undoRedo: false } : {}),
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
    }),
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
  ];
}

let schemaCache: ReturnType<typeof getSchema> | null = null;

/** Not şeması (ProseMirror); ilk çağrıda kurulur. */
export function noteSchema() {
  schemaCache ??= getSchema(noteExtensions());
  return schemaCache;
}

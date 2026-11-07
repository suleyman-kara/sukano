/**
 * Metin notunun ortak düzenleme belgesi (Yjs) ile D1'deki HTML kopyası arasındaki
 * dönüşümler. DOM gerektirmez; Worker'daki `NoteRoom` ve tarayıcı aynı kodu kullanır.
 *
 * - `htmlToNoteDoc(html)`: D1 HTML'i → editör şemasına uygun ProseMirror düğümü. Tiptap'in
 *   ürettiği sınırlı HTML (p, h2, ul/li, strong, em, a, br) ve eski kayıtlar için
 *   hoşgörülü küçük bir ayrıştırıcıdır: bilinmeyen etiketlerin metni korunur, h1–h6
 *   başlık (H2), ol madde listesi, b/i kalın/italik olur.
 * - `noteDocToHtml(doc)`: düğüm → HTML; editörün `getHTML()` çıktısıyla aynı biçim
 *   (Tiptap statik oluşturucusu, aynı eklentilerin `renderHTML`'i). Boş belge → "".
 * - `seedNoteYDoc(ydoc, html)`: boş Yjs belgesini HTML'den doldurur (oda ilk açılışta).
 * - `noteYDocToHtml(ydoc)`: Yjs belgesi → HTML (D1'e periyodik yazım).
 */
import type { JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { renderToHTMLString } from "@tiptap/static-renderer/pm/html-string";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from "@tiptap/y-tiptap";
import type * as Y from "yjs";
import { noteExtensions, noteSchema } from "~/domain/notes/editor-schema";
import { htmlToText } from "~/domain/notes/html";

/** Collaboration eklentisinin varsayılan alanı (`field: "default"`). */
export const NOTE_FRAGMENT = "default";

/* ------------------------------------------------------------------ */
/* HTML ayrıştırıcı                                                     */
/* ------------------------------------------------------------------ */

type El = { tag: string; attrs: Record<string, string>; children: Child[] };
type Child = El | string;

const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "wbr", "col", "area", "source"]);
const SKIP = new Set(["script", "style", "template", "head", "title"]);
const BLOCKS = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "section",
  "article",
  "header",
  "footer",
  "table",
  "tr",
  "hr",
]);

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const hex = code[1] === "x" || code[1] === "X";
      const n = hex ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const m of source.matchAll(re)) {
    attrs[m[1]!.toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

/** HTML → basit öğe ağacı (kapanmayan etiketler hoşgörüyle kapatılır). */
export function parseHtmlTree(html: string): El {
  const root: El = { tag: "#root", attrs: {}, children: [] };
  const stack: El[] = [root];
  const top = () => stack[stack.length - 1]!;
  const re =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>|([^<]+|<)/g;
  let skipping: string | null = null;
  for (const m of html.matchAll(re)) {
    const [, closing, rawTag, rest, text] = m;
    if (text !== undefined) {
      if (!skipping) top().children.push(decodeEntities(text));
      continue;
    }
    if (!rawTag) continue; // yorum, doctype
    const tag = rawTag.toLowerCase();
    if (skipping) {
      if (closing && tag === skipping) skipping = null;
      continue;
    }
    if (closing) {
      const at = stack.map((e) => e.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      continue;
    }
    if (SKIP.has(tag)) {
      if (!/\/\s*$/.test(rest ?? "")) skipping = tag;
      continue;
    }
    // <li> ve <p> açıkken aynı türden yenisi öncekini kapatır (HTML kuralı, yaklaşık).
    if (tag === "li" || tag === "p") {
      const at = stack.map((e) => e.tag).lastIndexOf(tag);
      const listAt = Math.max(
        stack.map((e) => e.tag).lastIndexOf("ul"),
        stack.map((e) => e.tag).lastIndexOf("ol"),
      );
      if (at > 0 && (tag === "p" || at > listAt)) stack.length = at;
    }
    const el: El = { tag, attrs: parseAttrs(rest ?? ""), children: [] };
    top().children.push(el);
    if (!VOID.has(tag) && !/\/\s*$/.test(rest ?? "")) stack.push(el);
  }
  return root;
}

/* ------------------------------------------------------------------ */
/* Öğe ağacı → ProseMirror JSON                                         */
/* ------------------------------------------------------------------ */

type Mark = { type: "bold" | "italic" | "link"; attrs?: Record<string, string> };

const UNSAFE_HREF = /^\s*(javascript|vbscript|data):/i;

function isBlock(c: Child): c is El {
  return typeof c !== "string" && BLOCKS.has(c.tag);
}

function inlineContent(children: readonly Child[], marks: readonly Mark[] = []): JSONContent[] {
  const out: JSONContent[] = [];
  for (const c of children) {
    if (typeof c === "string") {
      const text = c.replace(/[ \t\r\n\f]+/g, " ");
      if (text)
        out.push(marks.length ? { type: "text", text, marks: [...marks] } : { type: "text", text });
      continue;
    }
    if (c.tag === "br") {
      out.push({ type: "hardBreak" });
      continue;
    }
    let next = marks;
    if (c.tag === "strong" || c.tag === "b") next = withMark(marks, { type: "bold" });
    else if (c.tag === "em" || c.tag === "i") next = withMark(marks, { type: "italic" });
    else if (c.tag === "a" && c.attrs.href && !UNSAFE_HREF.test(c.attrs.href))
      next = withMark(
        marks.filter((m) => m.type !== "link"),
        { type: "link", attrs: { href: c.attrs.href } },
      );
    out.push(...inlineContent(c.children, next));
  }
  return out;
}

function withMark(marks: readonly Mark[], mark: Mark): Mark[] {
  return marks.some((m) => m.type === mark.type) ? [...marks] : [...marks, mark];
}

/** Paragraf içeriğinin başındaki ve sonundaki boşlukları atar (tarayıcı gibi). */
function trimInline(content: JSONContent[]): JSONContent[] {
  const out = content.map((n) => ({ ...n }));
  const first = out[0];
  if (first?.type === "text") first.text = first.text!.replace(/^ +/, "");
  const last = out[out.length - 1];
  if (last?.type === "text") last.text = last.text!.replace(/ +$/, "");
  return out.filter((n) => n.type !== "text" || n.text);
}

function paragraph(children: readonly Child[]): JSONContent {
  const content = trimInline(inlineContent(children));
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

function blockContent(children: readonly Child[]): JSONContent[] {
  const out: JSONContent[] = [];
  let run: Child[] = [];
  const flush = () => {
    const meaningful = run.some((c) => typeof c !== "string" || c.trim());
    if (meaningful) out.push(paragraph(run));
    run = [];
  };
  for (const c of children) {
    if (!isBlock(c)) {
      run.push(c);
      continue;
    }
    flush();
    out.push(...blockNode(c));
  }
  flush();
  return out;
}

function blockNode(el: El): JSONContent[] {
  switch (el.tag) {
    case "p":
      return [paragraph(el.children)];
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const content = trimInline(inlineContent(el.children));
      return [{ type: "heading", attrs: { level: 2 }, ...(content.length ? { content } : {}) }];
    }
    case "ul":
    case "ol": {
      const items: JSONContent[] = [];
      for (const c of el.children) {
        if (typeof c === "string" && !c.trim()) continue;
        items.push(listItem(typeof c !== "string" && c.tag === "li" ? c.children : [c]));
      }
      return items.length ? [{ type: "bulletList", content: items }] : [];
    }
    case "li":
      return [{ type: "bulletList", content: [listItem(el.children)] }];
    case "hr":
      return [];
    case "div":
      return el.children.some(isBlock) ? blockContent(el.children) : [paragraph(el.children)];
    default:
      return blockContent(el.children);
  }
}

function listItem(children: readonly Child[]): JSONContent {
  const blocks = blockContent(children);
  if (blocks[0]?.type !== "paragraph") blocks.unshift({ type: "paragraph" });
  return { type: "listItem", content: blocks };
}

/** HTML → ProseMirror JSON (şemaya uygun; boş HTML → tek boş paragraf). */
export function htmlToNoteJson(html: string | null | undefined): JSONContent {
  const content = blockContent(parseHtmlTree(html ?? "").children);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/**
 * HTML → editör şemasında ProseMirror düğümü. Yapı şemaya uymazsa (beklenmeyen eski
 * içerik) düz metin paragraflarına düşer; içerik kaybolmaz.
 */
export function htmlToNoteDoc(html: string | null | undefined): PMNode {
  const schema = noteSchema();
  try {
    const node = schema.nodeFromJSON(htmlToNoteJson(html));
    node.check();
    return node;
  } catch {
    const lines = htmlToText(html).split("\n").filter(Boolean);
    return schema.nodeFromJSON({
      type: "doc",
      content: lines.length
        ? lines.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] }))
        : [{ type: "paragraph" }],
    });
  }
}

/* ------------------------------------------------------------------ */
/* ProseMirror ↔ HTML / Yjs                                             */
/* ------------------------------------------------------------------ */

let renderExtensions: ReturnType<typeof noteExtensions> | null = null;

/** Belge boş mu (editörün `isEmpty` kuralı: tek boş paragraf). */
export function isEmptyNoteDoc(doc: PMNode): boolean {
  return (
    doc.childCount === 0 ||
    (doc.childCount === 1 &&
      doc.firstChild!.type.name === "paragraph" &&
      doc.firstChild!.content.size === 0)
  );
}

/** Düğüm → HTML; editörün `getHTML()` biçimi. Boş belge → "" (editör `onChange` kuralı). */
export function noteDocToHtml(doc: PMNode): string {
  if (isEmptyNoteDoc(doc)) return "";
  renderExtensions ??= noteExtensions();
  return renderToHTMLString({ extensions: renderExtensions, content: doc }).replace(
    /<br\/>/g,
    "<br>",
  );
}

/** HTML'i editör şemasından geçirip normalleştirir (karşılaştırma ve seed için). */
export function normalizeNoteHtml(html: string | null | undefined): string {
  return noteDocToHtml(htmlToNoteDoc(html));
}

/** Yjs belgesindeki not parçası boş mu (hiç öğe yok). */
export function isEmptyNoteYDoc(ydoc: Y.Doc): boolean {
  return ydoc.getXmlFragment(NOTE_FRAGMENT).length === 0;
}

/** Boş Yjs belgesini HTML'den doldurur; belge doluysa dokunmaz. Dolduysa true. */
export function seedNoteYDoc(ydoc: Y.Doc, html: string | null | undefined): boolean {
  const fragment = ydoc.getXmlFragment(NOTE_FRAGMENT);
  if (fragment.length > 0) return false;
  const doc = htmlToNoteDoc(html);
  ydoc.transact(() => {
    prosemirrorJSONToYXmlFragment(noteSchema(), doc.toJSON(), fragment);
  });
  return true;
}

/** Yjs belgesi → editör şemasında düğüm (şemaya uymayan parçalar atlanır). */
export function noteYDocToDoc(ydoc: Y.Doc): PMNode {
  return yXmlFragmentToProseMirrorRootNode(ydoc.getXmlFragment(NOTE_FRAGMENT), noteSchema());
}

/** Yjs belgesi → HTML (D1 kopyası). */
export function noteYDocToHtml(ydoc: Y.Doc): string {
  return noteDocToHtml(noteYDocToDoc(ydoc));
}

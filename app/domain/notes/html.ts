/**
 * Not gövdesinin HTML'i için DOM gerektirmeyen yardımcılar (Worker'da DOM yoktur):
 *
 * - `parseHtmlTree(html)`: hoşgörülü küçük ayrıştırıcı → öğe ağacı (not odası da kullanır,
 *   `realtime/note-doc.ts`).
 * - `htmlToText(html)`: arama ve kart etiketi için düz metin.
 * - `htmlToPreviewHtml(html)`: kartın biçimli önizlemesi. Gövde istemciden gelir, güvenilmez;
 *   çıktı yalnızca buradaki beyaz listeden kurulur (öznitelik yok, metin kaçışlı), kısaltılır.
 */

export type HtmlElement = { tag: string; attrs: Record<string, string>; children: HtmlChild[] };
export type HtmlChild = HtmlElement | string;

const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "wbr", "col", "area", "source"]);
const SKIP = new Set(["script", "style", "template", "head", "title"]);

/** Blok etiketleri (paragraf sınırı sayılır). */
export const BLOCK_TAGS = new Set([
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

const BLOCK = /<\/?(p|div|h[1-6]|li|ul|ol|blockquote|pre|tr|hr)\b[^>]*>/gi;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
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
export function parseHtmlTree(html: string): HtmlElement {
  const root: HtmlElement = { tag: "#root", attrs: {}, children: [] };
  const stack: HtmlElement[] = [root];
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
    const el: HtmlElement = { tag, attrs: parseAttrs(rest ?? ""), children: [] };
    top().children.push(el);
    if (!VOID.has(tag) && !/\/\s*$/.test(rest ?? "")) stack.push(el);
  }
  return root;
}

export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(BLOCK, "\n")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[\s\u00a0]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function isBlankHtml(html: string | null | undefined): boolean {
  return htmlToText(html) === "";
}

/* ------------------------------------------------------------------ */
/* Kart önizlemesi (biçimli, güvenli, kısaltılmış)                       */
/* ------------------------------------------------------------------ */

/**
 * Önizlemenin sınırları. Kart en çok 10 satır gösterir (CSS `line-clamp`); yük bundan
 * fazlasını taşımasın diye blok ve karakter sayısı da sınırlanır.
 */
export const PREVIEW_LIMITS = { blocks: 14, chars: 900 } as const;

const escapeText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Satır içi etiket → önizleme etiketi (bağlantı gezinmeyen `span`; kart zaten bağlantı). */
const INLINE: Record<string, string> = {
  strong: "strong",
  b: "strong",
  em: "em",
  i: "em",
  s: "s",
  del: "s",
  strike: "s",
};

type Budget = { chars: number; blocks: number; cut: boolean };

function inlineHtml(children: readonly HtmlChild[], budget: Budget): string {
  let out = "";
  for (const c of children) {
    if (budget.chars <= 0) {
      budget.cut = true;
      break;
    }
    if (typeof c === "string") {
      const text = c.replace(/[ \t\r\n\f]+/g, " ");
      if (text.length > budget.chars) {
        out += escapeText(text.slice(0, budget.chars).trimEnd()) + "…";
        budget.chars = 0;
        budget.cut = true;
        break;
      }
      budget.chars -= text.length;
      out += escapeText(text);
      continue;
    }
    if (c.tag === "br") {
      out += "<br>";
      continue;
    }
    const inner = inlineHtml(c.children, budget);
    if (!inner) continue;
    const tag = INLINE[c.tag];
    if (tag) out += `<${tag}>${inner}</${tag}>`;
    else if (c.tag === "a") out += `<span class="pv-a">${inner}</span>`;
    else out += inner;
  }
  return out;
}

const isBlockChild = (c: HtmlChild): c is HtmlElement =>
  typeof c !== "string" && BLOCK_TAGS.has(c.tag);

function blocksHtml(children: readonly HtmlChild[], budget: Budget): string {
  let out = "";
  let run: HtmlChild[] = [];
  const flush = () => {
    if (run.some((c) => typeof c !== "string" || c.trim())) out += block("p", run, budget);
    run = [];
  };
  for (const c of children) {
    if (budget.blocks <= 0 || budget.chars <= 0) {
      budget.cut = true;
      break;
    }
    if (!isBlockChild(c)) {
      run.push(c);
      continue;
    }
    flush();
    out += blockHtml(c, budget);
  }
  flush();
  return out;
}

function block(tag: "p" | "h", children: readonly HtmlChild[], budget: Budget): string {
  budget.blocks -= 1;
  const inner = inlineHtml(children, budget).trim();
  // Boş paragraf boş satır olarak görünür (editördeki gibi).
  const body = inner || "<br>";
  return tag === "h" ? `<p class="pv-h">${body}</p>` : `<p>${body}</p>`;
}

function blockHtml(el: HtmlElement, budget: Budget): string {
  switch (el.tag) {
    case "p":
      return block("p", el.children, budget);
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return block("h", el.children, budget);
    case "ul":
    case "ol": {
      let items = "";
      for (const c of el.children) {
        if (typeof c === "string" && !c.trim()) continue;
        if (budget.blocks <= 0 || budget.chars <= 0) {
          budget.cut = true;
          break;
        }
        const kids = typeof c !== "string" && c.tag === "li" ? c.children : [c];
        budget.blocks -= 1;
        const inner = kids.some(isBlockChild)
          ? listItemHtml(kids, budget)
          : inlineHtml(kids, budget).trim();
        items += `<li>${inner}</li>`;
      }
      return items ? `<${el.tag}>${items}</${el.tag}>` : "";
    }
    case "li":
      return blockHtml({ tag: "ul", attrs: {}, children: [el] }, budget);
    case "hr":
      return "";
    default:
      return blocksHtml(el.children, budget);
  }
}

/** Liste öğesi: ilk paragraf satır içi, iç listeler korunur, diğer bloklar `<br>` ile. */
function listItemHtml(children: readonly HtmlChild[], budget: Budget): string {
  const parts: string[] = [];
  for (const c of children) {
    if (typeof c === "string") {
      if (c.trim()) parts.push(inlineHtml([c], budget).trim());
    } else if (c.tag === "ul" || c.tag === "ol") {
      parts.push(blockHtml(c, budget));
    } else if (BLOCK_TAGS.has(c.tag)) {
      const inner = inlineHtml(c.children, budget).trim();
      if (inner)
        parts.push(parts.length && !/<\/(ul|ol)>$/.test(parts.at(-1)!) ? `<br>${inner}` : inner);
    } else {
      parts.push(inlineHtml([c], budget));
    }
  }
  return parts.join("");
}

/**
 * Not gövdesi → kartın biçimli önizlemesi: kalın, italik, üstü çizili, başlık
 * (`p.pv-h`), madde ve numaralı liste, satır sonu ve boş satır, bağlantı (`span.pv-a`,
 * gezinmez). Diğer her şeyin yalnızca metni kalır. Sondaki boş satırlar atılır; sınır
 * aşılırsa metin "…" ile kesilir. Boş gövde → "".
 */
export function htmlToPreviewHtml(html: string | null | undefined): string {
  if (!html || isBlankHtml(html)) return "";
  const budget: Budget = { chars: PREVIEW_LIMITS.chars, blocks: PREVIEW_LIMITS.blocks, cut: false };
  const out = blocksHtml(parseHtmlTree(html).children, budget);
  return out.replace(/(<p><br><\/p>)+$/, "");
}

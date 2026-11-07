/**
 * Not gövdesinin HTML'inden arama ve kart önizlemesi için düz metin üretir.
 * Worker'da DOM yoktur; Tiptap'in ürettiği sınırlı HTML (p, h2, ul/li, strong,
 * em, a, br) için basit bir dönüştürücü yeterlidir.
 */

const BLOCK = /<\/?(p|div|h[1-6]|li|ul|ol|blockquote|pre|tr|hr)\b[^>]*>/gi;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
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
    .map((line) => line.replace(/[\s ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function isBlankHtml(html: string | null | undefined): boolean {
  return htmlToText(html) === "";
}

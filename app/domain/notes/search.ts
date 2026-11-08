/**
 * Arama: Türkçe büyük/küçük harf ve aksan duyarsız. `normalizeTr` her karakteri
 * tek karakterle değiştirir; böylece normalleştirilmiş metindeki eşleşme konumları
 * özgün metinde de geçerlidir (vurgulama için).
 */

const MAP: Record<string, string> = {
  ı: "i",
  İ: "i",
  I: "i",
  ş: "s",
  Ş: "s",
  ğ: "g",
  Ğ: "g",
  ç: "c",
  Ç: "c",
  ö: "o",
  Ö: "o",
  ü: "u",
  Ü: "u",
  â: "a",
  Â: "a",
  î: "i",
  Î: "i",
  û: "u",
  Û: "u",
};

export function normalizeTr(text: string): string {
  let out = "";
  for (const ch of text) {
    const mapped = MAP[ch];
    if (mapped) {
      out += mapped;
      continue;
    }
    const lower = ch.toLowerCase();
    // Tek karakter kalmayan dönüşümler (ör. birleşik harfler) olduğu gibi kalır.
    out += lower.length === ch.length ? lower : ch;
  }
  return out;
}

/** Sorguyu normalleştirilmiş, boş olmayan sözcüklere ayırır. */
export function queryTerms(query: string): string[] {
  return normalizeTr(query).split(/\s+/).filter(Boolean);
}

/** Metin sorgudaki her sözcüğü içeriyor mu? */
export function matchesQuery(text: string, query: string): boolean {
  const terms = queryTerms(query);
  if (terms.length === 0) return false;
  const haystack = normalizeTr(text);
  return terms.every((t) => haystack.includes(t));
}

export type HighlightPart = { text: string; match: boolean };

/** Metni eşleşen ve eşleşmeyen parçalara böler (özgün yazımla). */
export function highlight(text: string, query: string): HighlightPart[] {
  if (!text) return [];
  const terms = queryTerms(query);
  if (terms.length === 0) return [{ text, match: false }];
  const hay = normalizeTr(text);
  const marks = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = hay.indexOf(term, from);
      if (at === -1) break;
      marks.fill(true, at, at + term.length);
      from = at + 1;
    }
  }
  const parts: HighlightPart[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marks[i] !== marks[start]) {
      parts.push({ text: text.slice(start, i), match: marks[start]! });
      start = i;
    }
  }
  return parts;
}

/** İlk eşleşmenin çevresinden kısa bir özet (yaklaşık `radius` karakter iki yanda). */
export function snippet(text: string, query: string, radius = 60): string {
  if (text.length <= radius * 2) return text;
  const hay = normalizeTr(text);
  const at = queryTerms(query)
    .map((t) => hay.indexOf(t))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  if (at === undefined) return cutEnd(text, radius * 2);
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + radius);
  const head = start > 0 ? "…" + text.slice(start, end).replace(/^\S*\s/, "") : text.slice(0, end);
  return end < text.length ? head.replace(/\s\S*$/, "") + " …" : head;
}

function cutEnd(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut) + " …";
}

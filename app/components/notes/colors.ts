import { NOTE_COLORS, type NoteColor } from "~/db/schema";

export { NOTE_COLORS };

/** Renk paleti etiketleri (Türkçe, ekran okuyucu ve ipucu için). */
export const NOTE_COLOR_LABELS: Record<NoteColor, string> = {
  default: "Varsayılan",
  sari: "Sarı",
  turuncu: "Turuncu",
  pembe: "Pembe",
  mor: "Mor",
  mavi: "Mavi",
  turkuaz: "Turkuaz",
  yesil: "Yeşil",
  kahve: "Kahve",
  gri: "Gri",
};

/** Not zemini: `var(--n-<renk>)`. */
export const noteBg = (color: NoteColor) => `var(--n-${color})`;

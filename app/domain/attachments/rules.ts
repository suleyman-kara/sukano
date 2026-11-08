/**
 * Dosya ekleri (PLAN §3): yalnızca metin notunda; görsel ve genel dosya, dosya başına
 * 10 MB, R2 üzerinde. Saf kurallar — sunucu ve arayüz aynı denetimi yapar.
 *
 * - Tür uzantıdan belirlenir; tarayıcının bildirdiği MIME türüne güvenilmez (sunucu
 *   R2'ye ve indirme yanıtına bu listeden gelen türü yazar).
 * - İzin listesi: görseller (SVG hariç: betik taşıyabilir), PDF, ofis belgeleri, düz
 *   metin / CSV / Markdown, zip ve kısa ses / video. Çalıştırılabilir dosyalar, betikler
 *   ve HTML listede olmadığı için reddedilir.
 * - Not başına en çok {@link MAX_ATTACHMENTS_PER_NOTE} ek.
 */

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_NOTE = 20;
/** Temizlenmiş dosya adının en çok uzunluğu (uzantı dahil). */
export const MAX_FILE_NAME_LENGTH = 120;

export type AttachmentKind = "image" | "file";

/** Uzantı → saklanan içerik türü. */
const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  rtf: "application/rtf",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  zip: "application/zip",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

/** Dosya seçme penceresinin `accept` özniteliği. */
export const ACCEPT_ATTR = ["image/*", ...Object.keys(TYPES).map((ext) => `.${ext}`)].join(",");

export const MESSAGES = {
  type: "Bu dosya türü eklenemez",
  empty: "Dosya boş",
  limit: `Bir nota en fazla ${MAX_ATTACHMENTS_PER_NOTE} dosya eklenebilir`,
  network: "Yüklenemedi · bağlantını denetleyip tekrar dene",
  textOnly: "Dosya yalnızca metin notuna eklenebilir",
  offline: "Çevrimdışıyken ekleme kapalıdır",
} as const;

export const tooLargeMessage = (size: number) =>
  `${formatSize(size)} · dosya başına en fazla ${formatSize(MAX_ATTACHMENT_BYTES)}`;

export type AttachmentErrorCode = "tur" | "cok_buyuk" | "bos" | "sinir";

export type AttachmentCheck =
  | { ok: true; contentType: string; kind: AttachmentKind; ext: string }
  | { ok: false; code: AttachmentErrorCode; message: string };

/** Dosya adının küçük harfli uzantısı (yoksa boş). */
export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}

export const attachmentKind = (contentType: string): AttachmentKind =>
  contentType.startsWith("image/") ? "image" : "file";

/**
 * Eklenebilir mi? Sıra: tür → boş → boyut → nottaki ek sayısı (`existing`).
 */
export function checkAttachment(
  file: { name: string; size: number; type?: string },
  existing = 0,
): AttachmentCheck {
  const ext = extensionOf(file.name);
  const contentType = TYPES[ext];
  if (!contentType) return { ok: false, code: "tur", message: MESSAGES.type };
  if (file.size <= 0) return { ok: false, code: "bos", message: MESSAGES.empty };
  if (file.size > MAX_ATTACHMENT_BYTES)
    return { ok: false, code: "cok_buyuk", message: tooLargeMessage(file.size) };
  if (existing >= MAX_ATTACHMENTS_PER_NOTE)
    return { ok: false, code: "sinir", message: MESSAGES.limit };
  return { ok: true, contentType, kind: attachmentKind(contentType), ext };
}

/** Tarayıcıda açılabilen türler (görseller ve PDF); diğerleri her zaman indirilir. */
export const canInline = (contentType: string) =>
  attachmentKind(contentType) === "image" || contentType === "application/pdf";

/* ------------------------------------------------------------------ */
/* Metinler                                                            */
/* ------------------------------------------------------------------ */

const KB = 1024;
const MB = 1024 * 1024;

const decimal = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace(".", ",");
};

function unitOf(bytes: number): "B" | "KB" | "MB" {
  if (bytes < KB) return "B";
  return Math.round(bytes / KB) < 1024 ? "KB" : "MB";
}

function inUnit(bytes: number, unit: "B" | "KB" | "MB"): string {
  if (unit === "B") return String(Math.round(bytes));
  if (unit === "KB") return String(Math.round(bytes / KB));
  return decimal(bytes / MB);
}

/** "512 B", "12 KB", "1,8 MB", "10 MB". */
export function formatSize(bytes: number): string {
  const unit = unitOf(bytes);
  return `${inUnit(bytes, unit)} ${unit}`;
}

/** Yükleme ilerlemesi: "2,4 / 3,1 MB" (birim toplamdan). */
export function formatProgress(loaded: number, total: number): string {
  const unit = unitOf(total);
  return `${inUnit(loaded, unit)} / ${inUnit(total, unit)} ${unit}`;
}

export type BadgeTone = "pdf" | "image" | "doc" | "sheet" | "slide" | "neutral";

/** Dosya simgesindeki uzantı rozeti ("PDF") ve tonu. */
export function fileBadge(name: string): { label: string; tone: BadgeTone } {
  const ext = extensionOf(name);
  if (!ext) return { label: "DOSYA", tone: "neutral" };
  const label = ext.toUpperCase().slice(0, 4);
  const type = TYPES[ext] ?? "";
  let tone: BadgeTone = "neutral";
  if (ext === "pdf") tone = "pdf";
  else if (type.startsWith("image/")) tone = "image";
  else if (["doc", "docx", "odt", "rtf"].includes(ext)) tone = "doc";
  else if (["xls", "xlsx", "ods", "csv"].includes(ext)) tone = "sheet";
  else if (["ppt", "pptx", "odp"].includes(ext)) tone = "slide";
  return { label, tone };
}

/* ------------------------------------------------------------------ */
/* Ad ve başlıklar                                                     */
/* ------------------------------------------------------------------ */

// Denetim ve yön karakterleri (U+202E gibi adı ters gösterenler dahil).
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/**
 * Saklanacak ve gösterilecek dosya adı: yol parçaları atılır, denetim karakterleri
 * silinir, Windows/Unix'te ayrılmış karakterler tireye döner, boşluklar sadeleşir,
 * baştaki ve sondaki nokta / boşluk atılır, en çok 120 karakter (uzantı korunur).
 */
export function sanitizeFileName(raw: string): string {
  let name = (raw.split(/[\\/]/).pop() ?? "").normalize("NFC");
  name = name
    .replace(CONTROL, "")
    .replace(/[<>:"|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  if (!name) return "dosya";
  if (name.length > MAX_FILE_NAME_LENGTH) {
    const ext = extensionOf(name);
    const suffix = ext && ext.length < 10 ? `.${ext}` : "";
    name = name.slice(0, MAX_FILE_NAME_LENGTH - suffix.length).trimEnd() + suffix;
  }
  return name;
}

const TR_ASCII: Record<string, string> = {
  ı: "i",
  İ: "I",
  ş: "s",
  Ş: "S",
  ğ: "g",
  Ğ: "G",
  ü: "u",
  Ü: "U",
  ö: "o",
  Ö: "O",
  ç: "c",
  Ç: "C",
};

function asciiFallback(name: string): string {
  return [...name]
    .map((ch) => TR_ASCII[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, (c) => `\\${c}`);
}

const rfc5987 = (s: string) =>
  encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * `Content-Disposition` başlığı: eski istemciler için ASCII `filename`, diğerleri için
 * UTF-8 `filename*` (RFC 6266 / 5987).
 */
export function contentDisposition(name: string, mode: "inline" | "attachment"): string {
  return `${mode}; filename="${asciiFallback(name)}"; filename*=UTF-8''${rfc5987(name)}`;
}

/** R2 nesne anahtarı. */
export const r2KeyFor = (noteId: string, attachmentId: string) => `ekler/${noteId}/${attachmentId}`;

/** İndirme / önizleme adresi. */
export const attachmentUrl = (id: string, download = false) =>
  `/api/ekler/${id}${download ? "?indir=1" : ""}`;

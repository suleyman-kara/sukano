import { describe, expect, it } from "vitest";
import {
  ACCEPT_ATTR,
  attachmentKind,
  canInline,
  checkAttachment,
  contentDisposition,
  fileBadge,
  formatProgress,
  formatSize,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_NOTE,
  MESSAGES,
  r2KeyFor,
  sanitizeFileName,
} from "~/domain/attachments/rules";

const MB = 1024 * 1024;

describe("dosya boyutu metni", () => {
  it("bayt, KB ve MB Türkçe ondalık virgülle yazılır", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1024)).toBe("1 KB");
    expect(formatSize(12.4 * 1024)).toBe("12 KB");
    expect(formatSize(1.8 * MB)).toBe("1,8 MB");
    expect(formatSize(3.14 * MB)).toBe("3,1 MB");
  });

  it("tam MB'de ondalık yazılmaz", () => {
    expect(formatSize(10 * MB)).toBe("10 MB");
    expect(formatSize(48 * MB)).toBe("48 MB");
  });

  it("1 MB'nin hemen altı KB olarak kalır, 1023,9 KB yuvarlanınca 1 MB olur", () => {
    expect(formatSize(1000 * 1024)).toBe("1000 KB");
    expect(formatSize(MB - 10)).toBe("1 MB");
  });

  it("yükleme ilerlemesi toplamın biriminde yazılır", () => {
    expect(formatProgress(2.4 * MB, 3.1 * MB)).toBe("2,4 / 3,1 MB");
    expect(formatProgress(300 * 1024, 800 * 1024)).toBe("300 / 800 KB");
    expect(formatProgress(0, 2 * MB)).toBe("0 / 2 MB");
  });
});

describe("dosya türü ve boyutu denetimi", () => {
  it("görsel kabul edilir ve türü uzantıdan belirlenir", () => {
    const r = checkAttachment({ name: "salon-olcu.JPG", size: 3 * MB, type: "" });
    expect(r).toEqual({ ok: true, contentType: "image/jpeg", kind: "image", ext: "jpg" });
  });

  it("tarayıcının bildirdiği tür yerine uzantı esas alınır", () => {
    const r = checkAttachment({ name: "teklif.pdf", size: 10, type: "text/html" });
    expect(r).toMatchObject({ ok: true, contentType: "application/pdf", kind: "file" });
  });

  it("ofis, metin ve zip dosyaları kabul edilir", () => {
    for (const name of ["a.docx", "b.xlsx", "c.pptx", "d.odt", "e.txt", "f.csv", "g.zip", "h.md"]) {
      expect(checkAttachment({ name, size: 100, type: "" }).ok, name).toBe(true);
    }
  });

  it("çalıştırılabilir ve betik dosyaları reddedilir", () => {
    for (const name of ["kur.exe", "a.bat", "b.sh", "c.msi", "d.js", "e.html", "f.svg", "g.apk"]) {
      expect(checkAttachment({ name, size: 100, type: "" })).toEqual({
        ok: false,
        code: "tur",
        message: MESSAGES.type,
      });
    }
  });

  it("uzantısız dosya reddedilir", () => {
    expect(checkAttachment({ name: "README", size: 10, type: "text/plain" })).toMatchObject({
      ok: false,
      code: "tur",
    });
  });

  it("10 MB'ye kadar kabul edilir, üstü boyutuyla birlikte reddedilir", () => {
    expect(checkAttachment({ name: "a.png", size: MAX_ATTACHMENT_BYTES, type: "" }).ok).toBe(true);
    expect(checkAttachment({ name: "balkon-video.mov", size: 48 * MB, type: "" })).toEqual({
      ok: false,
      code: "cok_buyuk",
      message: "48 MB · dosya başına en fazla 10 MB",
    });
  });

  it("boş dosya reddedilir", () => {
    expect(checkAttachment({ name: "a.txt", size: 0, type: "" })).toMatchObject({
      ok: false,
      code: "bos",
    });
  });

  it("not başına sınır dolunca reddedilir", () => {
    expect(
      checkAttachment({ name: "a.png", size: 10, type: "" }, MAX_ATTACHMENTS_PER_NOTE),
    ).toEqual({ ok: false, code: "sinir", message: MESSAGES.limit });
    expect(
      checkAttachment({ name: "a.png", size: 10, type: "" }, MAX_ATTACHMENTS_PER_NOTE - 1).ok,
    ).toBe(true);
  });

  it("seçim penceresinin kabul listesi izin verilen uzantıları içerir", () => {
    expect(ACCEPT_ATTR).toContain(".pdf");
    expect(ACCEPT_ATTR).toContain("image/*");
    expect(ACCEPT_ATTR).not.toContain(".exe");
  });
});

describe("dosya adı temizleme", () => {
  it("yol parçaları atılır", () => {
    expect(sanitizeFileName("C:\\Users\\ayse\\teklif.pdf")).toBe("teklif.pdf");
    expect(sanitizeFileName("../../etc/passwd.txt")).toBe("passwd.txt");
  });

  it("Türkçe harfler korunur, ayrılmış karakterler tireye döner", () => {
    expect(sanitizeFileName('Şubat: "bütçe" <son>?.xlsx')).toBe("Şubat- -bütçe- -son-.xlsx");
  });

  it("denetim karakterleri silinir, boşluklar sadeleşir, baştaki ve sondaki nokta atılır", () => {
    expect(sanitizeFileName("  a\u0000b\u202E  c  .txt. ")).toBe("ab c .txt");
    expect(sanitizeFileName("..gizli.txt")).toBe("gizli.txt");
  });

  it("çok uzun ad uzantısı korunarak kısaltılır", () => {
    const name = sanitizeFileName(`${"a".repeat(300)}.pdf`);
    expect(name.length).toBe(120);
    expect(name.endsWith(".pdf")).toBe(true);
  });

  it("boş kalan ada varsayılan verilir", () => {
    expect(sanitizeFileName("///")).toBe("dosya");
    expect(sanitizeFileName("")).toBe("dosya");
  });

  it("ayrışmış Unicode birleşik biçime getirilir", () => {
    expect(sanitizeFileName("s\u0327ehir.txt")).toBe("şehir.txt");
  });
});

describe("Content-Disposition", () => {
  it("ASCII adda yalnızca filename yeterli değildir; ikisi de yazılır", () => {
    expect(contentDisposition("teklif.pdf", "attachment")).toBe(
      "attachment; filename=\"teklif.pdf\"; filename*=UTF-8''teklif.pdf",
    );
  });

  it("Türkçe ad ASCII'ye çevrilir ve UTF-8 olarak kodlanır", () => {
    expect(contentDisposition("Şubat bütçesi ığ.xlsx", "inline")).toBe(
      "inline; filename=\"Subat butcesi ig.xlsx\"; filename*=UTF-8''%C5%9Eubat%20b%C3%BCt%C3%A7esi%20%C4%B1%C4%9F.xlsx",
    );
  });

  it("tırnak ve ters bölü kaçırılır, diğer ASCII dışı karakterler alt çizgi olur", () => {
    expect(contentDisposition('a"b\\c日.txt', "attachment")).toBe(
      'attachment; filename="a\\"b\\\\c_.txt"; filename*=UTF-8\'\'a%22b%5Cc%E6%97%A5.txt',
    );
  });

  it("RFC 5987'de ayrılmış karakterler de kodlanır", () => {
    expect(contentDisposition("a'(b)*.txt", "attachment")).toContain(
      "filename*=UTF-8''a%27%28b%29%2A.txt",
    );
  });
});

describe("tür yardımcıları", () => {
  it("görsel ve dosya ayrılır", () => {
    expect(attachmentKind("image/png")).toBe("image");
    expect(attachmentKind("application/pdf")).toBe("file");
  });

  it("yalnızca görseller ve PDF tarayıcıda açılır", () => {
    expect(canInline("image/webp")).toBe(true);
    expect(canInline("application/pdf")).toBe(true);
    expect(canInline("text/plain")).toBe(false);
    expect(canInline("application/zip")).toBe(false);
  });

  it("rozet uzantıyı büyük harfle yazar; PDF kırmızı tondadır", () => {
    expect(fileBadge("usta-teklifi-kasim.pdf")).toEqual({ label: "PDF", tone: "pdf" });
    expect(fileBadge("rapor.docx")).toEqual({ label: "DOCX", tone: "doc" });
    expect(fileBadge("tablo.xlsx")).toEqual({ label: "XLSX", tone: "sheet" });
    expect(fileBadge("foto.jpeg")).toEqual({ label: "JPEG", tone: "image" });
    expect(fileBadge("arsiv.zip")).toEqual({ label: "ZIP", tone: "neutral" });
    expect(fileBadge("adsiz")).toEqual({ label: "DOSYA", tone: "neutral" });
  });

  it("R2 anahtarı not ve ek kimliğinden oluşur", () => {
    expect(r2KeyFor("not-1", "ek-1")).toBe("ekler/not-1/ek-1");
  });
});

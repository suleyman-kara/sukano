import { describe, expect, it } from "vitest";
import { highlight, matchesQuery, normalizeTr, snippet } from "~/domain/notes/search";

describe("arama normalizasyonu (Türkçe)", () => {
  it("büyük/küçük harf ve Türkçe karakterleri sadeleştirir", () => {
    expect(normalizeTr("IĞDIR İstanbul ışık")).toBe("igdir istanbul isik");
    expect(normalizeTr("Şeker Çiçek Göl Üzüm")).toBe("seker cicek gol uzum");
    expect(normalizeTr("Kâğıt Âşık Îmân Ûmit")).toBe("kagit asik iman umit");
  });

  it("aynı uzunlukta kalır (vurgulama konumları için)", () => {
    const s = "İĞNE ışığı";
    expect(normalizeTr(s)).toHaveLength(s.length);
  });

  it("aksan ve harf duyarsız eşleşir", () => {
    expect(matchesQuery("Kış Uykusu", "kis")).toBe(true);
    expect(matchesQuery("Toplantı notları", "TOPLANTI")).toBe(true);
    expect(matchesQuery("Şile sahil hattı", "sile")).toBe(true);
    expect(matchesQuery("Yürüyüş rotaları", "yuruyus")).toBe(true);
    expect(matchesQuery("Market", "kedi")).toBe(false);
  });

  it("birden çok sözcükte her sözcük geçmelidir (sıra önemsiz)", () => {
    expect(matchesQuery("Ustadan iki ayrı teklif al", "teklif usta")).toBe(true);
    expect(matchesQuery("Ustadan iki ayrı teklif al", "teklif fatura")).toBe(false);
  });

  it("boş sorgu hiçbir şeyle eşleşmez", () => {
    expect(matchesQuery("Herhangi", "   ")).toBe(false);
  });
});

describe("eşleşme vurgusu", () => {
  it("eşleşen parçaları özgün yazımıyla işaretler", () => {
    expect(highlight("Teklif karşılaştırması: teklifler", "teklif")).toEqual([
      { text: "Teklif", match: true },
      { text: " karşılaştırması: ", match: false },
      { text: "teklif", match: true },
      { text: "ler", match: false },
    ]);
  });

  it("Türkçe harflerle yazılmış metinde sade sorguyla vurgular", () => {
    expect(highlight("Işık ve gölge", "isik")).toEqual([
      { text: "Işık", match: true },
      { text: " ve gölge", match: false },
    ]);
  });

  it("birden çok sözcüğün hepsi vurgulanır, çakışanlar birleşir", () => {
    expect(highlight("abc def", "ab bc def")).toEqual([
      { text: "abc", match: true },
      { text: " ", match: false },
      { text: "def", match: true },
    ]);
  });

  it("sorgu boşsa metin tek parça döner", () => {
    expect(highlight("metin", "")).toEqual([{ text: "metin", match: false }]);
    expect(highlight("", "x")).toEqual([]);
  });
});

describe("sonuç özeti", () => {
  const long =
    "Birinci cümle burada. İkinci cümle biraz daha uzun ve ayrıntılı. Burada aranan teklif sözcüğü geçiyor ve devam ediyor. Son cümle.";

  it("eşleşmenin çevresinden kısaltılmış bir parça döner", () => {
    const s = snippet(long, "teklif", 20);
    expect(s).toContain("teklif");
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
  });

  it("eşleşme yoksa ya da metin kısaysa baştan kesilir", () => {
    expect(snippet("Kısa metin", "yok", 20)).toBe("Kısa metin");
    expect(snippet(long, "bulunmayan", 10)).toBe("Birinci cümle …");
  });

  it("eşleşme başa yakınsa önüne üç nokta konmaz", () => {
    expect(snippet(long, "birinci", 10).startsWith("Birinci")).toBe(true);
  });
});

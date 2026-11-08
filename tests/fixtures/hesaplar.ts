/**
 * Test hesapları (PLAN §11). Tohum betiği (`scripts/seed.ts`) bu hesapları
 * oluşturur; birim, Worker ve uçtan uca testler aynı kaynaktan okur.
 *
 * Saf TypeScript: uygulama koduna ya da test çatısına bağımlılık yoktur, böylece
 * Node betikleri, Vitest ve Playwright tarafından doğrudan içe aktarılabilir.
 */

/** Proje bazında roller (PLAN §2). */
export type ProjeRolu = "yonetici" | "duzenleyici" | "goruntuleyici";

export type TestHesabi = {
  /** Kısa anahtar; testlerde `hesaplar.ayse` gibi kullanılır. */
  anahtar: HesapAnahtari;
  ad: string;
  eposta: string;
  sifre: string;
  /** Avatar zemin rengi (beyaz metinle ≥ 4,5:1). */
  avatarRengi: string;
  /** E-posta doğrulanmış mı? (Doğrulanmamış hesap davet alamaz.) */
  epostaDogrulandi: boolean;
  /** Örnek projedeki ("Web Sitesi Yenileme") rolü. */
  ornekProjeRolu: ProjeRolu;
};

export type HesapAnahtari = "suleyman" | "ayse" | "mehmet" | "zeynep" | "can";

/** Tüm test hesaplarının ortak şifresi. Yalnızca yerel ve önizleme ortamları içindir. */
export const TEST_SIFRESI = "Test1234!";

export const TEST_EPOSTA_ALANI = "test.sukano";

export const hesaplar = {
  suleyman: {
    anahtar: "suleyman",
    ad: "Süleyman Kara",
    eposta: "suleyman@test.sukano",
    sifre: TEST_SIFRESI,
    avatarRengi: "#3F6E5A",
    epostaDogrulandi: true,
    ornekProjeRolu: "yonetici",
  },
  ayse: {
    anahtar: "ayse",
    ad: "Ayşe Demir",
    eposta: "ayse@test.sukano",
    sifre: TEST_SIFRESI,
    avatarRengi: "#597895",
    epostaDogrulandi: true,
    ornekProjeRolu: "yonetici",
  },
  mehmet: {
    anahtar: "mehmet",
    ad: "Mehmet Kaya",
    eposta: "mehmet@test.sukano",
    sifre: TEST_SIFRESI,
    avatarRengi: "#8A5A3C",
    epostaDogrulandi: true,
    ornekProjeRolu: "duzenleyici",
  },
  zeynep: {
    anahtar: "zeynep",
    ad: "Zeynep Arslan",
    eposta: "zeynep@test.sukano",
    sifre: TEST_SIFRESI,
    avatarRengi: "#7A4F86",
    epostaDogrulandi: true,
    ornekProjeRolu: "duzenleyici",
  },
  can: {
    anahtar: "can",
    ad: "Can Yılmaz",
    eposta: "can@test.sukano",
    sifre: TEST_SIFRESI,
    avatarRengi: "#5C6670",
    epostaDogrulandi: true,
    ornekProjeRolu: "goruntuleyici",
  },
} as const satisfies Record<HesapAnahtari, TestHesabi>;

export const tumHesaplar: readonly TestHesabi[] = Object.values(hesaplar);

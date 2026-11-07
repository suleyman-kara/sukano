/**
 * Tasarımdaki örnek veri (docs/design: Main, Project, TodoNote, MProjectSettings).
 *
 * Tohum betiği (`scripts/seed.ts`) bu dosyayı içe aktarıp yerel / önizleme
 * veritabanına yazar; uçtan uca testler de beklenen içerik için aynı kaynağı
 * kullanır. Bu yüzden dosya saf TypeScript'tir: veritabanı şemasına, uygulama
 * koduna ya da test çatısına bağımlılık yoktur. Kişiler `hesaplar.ts` içindeki
 * anahtarlarla (`"ayse"`, `"mehmet"` …) anılır; kimlikler tohumlama sırasında
 * üretilir ya da `id` alanları olduğu gibi kullanılabilir.
 *
 * Değer kümeleri `app/db/schema.ts` ile aynı adları kullanır
 * (renkler, roller, not türleri).
 */
import type { HesapAnahtari, ProjeRolu } from "./hesaplar";

export type ProjeRengi = "turuncu" | "mavi" | "yesil" | "pembe" | "mor" | "sari" | "grimavi";

export type NotRengi =
  "default" | "sari" | "turuncu" | "pembe" | "mor" | "mavi" | "turkuaz" | "yesil" | "kahve" | "gri";

export type OrnekGorev = {
  baslik: string;
  tamamlandi?: boolean;
  /** Tamamlayan kişi (yoksa notun sahibi / oluşturanı). */
  tamamlayan?: HesapAnahtari;
  aciklama?: string;
  /** ISO tarih (YYYY-AA-GG). */
  baslangic?: string;
  bitis?: string;
  /** SS:DD */
  saat?: string;
  atananlar?: HesapAnahtari[];
  altGorevler?: OrnekGorev[];
};

type OrnekNotOrtak = {
  /** Kararlı kimlik: testler notu bununla bulabilir. */
  id: string;
  baslik: string;
  renk: NotRengi;
  sabitlendi?: boolean;
  arsivlendi?: boolean;
  copte?: boolean;
  olusturan: HesapAnahtari;
  sonDuzenleyen?: HesapAnahtari;
};

export type OrnekMetinNotu = OrnekNotOrtak & { tur: "text"; metin: string };
export type OrnekYapilacaklarNotu = OrnekNotOrtak & { tur: "todo"; gorevler: OrnekGorev[] };
export type OrnekNot = OrnekMetinNotu | OrnekYapilacaklarNotu;

export type OrnekUye = { kisi: HesapAnahtari; rol: ProjeRolu };

export type OrnekDavet = { eposta: string; rol: ProjeRolu; davetEden: HesapAnahtari };

export type OrnekProje = {
  id: string;
  ad: string;
  renk: ProjeRengi;
  aciklama?: string;
  olusturan: HesapAnahtari;
  uyeler: OrnekUye[];
  bekleyenDavetler: OrnekDavet[];
  notlar: OrnekNot[];
};

export type OrnekKisiselAlan = { sahip: HesapAnahtari; notlar: OrnekNot[] };

// ---------------------------------------------------------------------------
// Projeler
// ---------------------------------------------------------------------------

export const webSitesiYenileme: OrnekProje = {
  id: "web-sitesi-yenileme",
  ad: "Web Sitesi Yenileme",
  renk: "turuncu",
  aciklama: "Kurumsal sitenin yeni tasarımı ve içerik taşıması. Lansman 24 Kasım.",
  olusturan: "suleyman",
  uyeler: [
    { kisi: "suleyman", rol: "yonetici" },
    { kisi: "ayse", rol: "yonetici" },
    { kisi: "mehmet", rol: "duzenleyici" },
    { kisi: "zeynep", rol: "duzenleyici" },
    { kisi: "can", rol: "goruntuleyici" },
  ],
  bekleyenDavetler: [],
  notlar: [
    {
      id: "lansman-hazirligi",
      tur: "todo",
      baslik: "Lansman hazırlığı",
      renk: "default",
      sabitlendi: true,
      olusturan: "ayse",
      sonDuzenleyen: "mehmet",
      gorevler: [
        { baslik: "Tasarım onayı", tamamlandi: true, tamamlayan: "ayse" },
        {
          baslik: "İçerik yazımı",
          atananlar: ["zeynep"],
          baslangic: "2026-11-09",
          bitis: "2026-11-16",
          altGorevler: [
            { baslik: "Ana sayfa metni", tamamlandi: true, tamamlayan: "zeynep" },
            { baslik: "Hakkımızda sayfası" },
            { baslik: "Ürün açıklamaları" },
          ],
        },
        { baslik: "SEO kontrolleri", atananlar: ["mehmet"], bitis: "2026-11-20" },
        {
          baslik: "Lansman duyurusu",
          atananlar: ["ayse", "can"],
          bitis: "2026-11-24",
          saat: "10:00",
          aciklama: "Bülten ve sosyal medya aynı saatte çıkacak.",
        },
      ],
    },
    {
      id: "karar-gunlugu",
      tur: "text",
      baslik: "Karar günlüğü",
      renk: "sari",
      sabitlendi: true,
      olusturan: "suleyman",
      metin:
        "3 Kas: Barındırma için yıllık ödeme seçildi, en uygun teklif ikinci firmanın.\n5 Kas: Logo değişmiyor, yalnızca renk paleti güncellenecek.",
    },
    {
      id: "fotograf-cekimi",
      tur: "text",
      baslik: "Fotoğraf çekimi",
      renk: "mavi",
      olusturan: "zeynep",
      metin: "Stüdyo 18 Kasım, 10:00. Ürünler bir gün önce hazır olmalı; Can kargo ile gönderecek.",
    },
    {
      id: "teklif-karsilastirmasi",
      tur: "text",
      baslik: "Teklif karşılaştırması",
      renk: "default",
      olusturan: "mehmet",
      metin:
        "Üç barındırma teklifi alındı. Aylık yerine yıllık ödemede %20 indirim var; sözleşme süresi 12 ay.",
    },
    {
      id: "musteri-geri-bildirimleri",
      tur: "todo",
      baslik: "Müşteri geri bildirimleri",
      renk: "pembe",
      olusturan: "ayse",
      gorevler: [
        { baslik: "Ana sayfa görseli daha sıcak olsun" },
        { baslik: "İletişim formuna telefon alanı", tamamlandi: true, tamamlayan: "mehmet" },
        { baslik: "Referanslar bölümü" },
        { baslik: "Alt bilgiye sosyal medya bağlantıları" },
        { baslik: "Blog sayfası şimdilik kalksın" },
      ],
    },
    {
      id: "renk-paleti",
      tur: "text",
      baslik: "Renk paleti",
      renk: "yesil",
      olusturan: "zeynep",
      metin: "Koyu yeşil, kum, kömür. Vurgu olarak kiremit kırmızısı yalnızca düğmelerde.",
    },
    {
      id: "toplanti-4-kasim",
      tur: "text",
      baslik: "Toplantı, 4 Kasım",
      renk: "default",
      olusturan: "suleyman",
      metin:
        "Mehmet SEO raporunu çıkardı. Zeynep içerik takvimini hazırlayacak. Lansman tarihi 24 Kasım olarak kesinleşti.",
    },
    {
      id: "erisilebilirlik-kontrol-listesi",
      tur: "todo",
      baslik: "Erişilebilirlik kontrol listesi",
      renk: "mor",
      olusturan: "mehmet",
      gorevler: [{ baslik: "Kontrast oranları" }, { baslik: "Klavye ile gezinme" }],
    },
  ],
};

export const evTasinma: OrnekProje = {
  id: "ev-tasinma",
  ad: "Ev Taşınma",
  renk: "mavi",
  aciklama: "Aralık sonunda yeni eve geçiş.",
  olusturan: "suleyman",
  uyeler: [
    { kisi: "suleyman", rol: "yonetici" },
    { kisi: "ayse", rol: "duzenleyici" },
  ],
  bekleyenDavetler: [],
  notlar: [
    {
      id: "nakliye-listesi",
      tur: "todo",
      baslik: "Nakliye listesi",
      renk: "default",
      olusturan: "suleyman",
      gorevler: [
        { baslik: "Nakliye firmasından teklif al", atananlar: ["suleyman"], bitis: "2026-11-30" },
        { baslik: "Koli ve bant", tamamlandi: true, tamamlayan: "ayse" },
        { baslik: "Adres değişikliği bildirimleri" },
      ],
    },
  ],
};

export const kitapKulubu: OrnekProje = {
  id: "kitap-kulubu",
  ad: "Kitap Kulübü",
  renk: "yesil",
  olusturan: "suleyman",
  uyeler: [
    { kisi: "suleyman", rol: "yonetici" },
    { kisi: "zeynep", rol: "goruntuleyici" },
  ],
  // Ayşe'nin bekleyen bir daveti var (kabuktaki "Davetler, 1 bekleyen davet").
  bekleyenDavetler: [{ eposta: "ayse@test.sukano", rol: "duzenleyici", davetEden: "suleyman" }],
  notlar: [
    {
      id: "kasim-kitabi",
      tur: "text",
      baslik: "Kasım kitabı",
      renk: "kahve",
      olusturan: "suleyman",
      metin: "Saatleri Ayarlama Enstitüsü. Buluşma 28 Kasım, 19:30.",
    },
  ],
};

export const ornekProjeler: readonly OrnekProje[] = [webSitesiYenileme, evTasinma, kitapKulubu];

// ---------------------------------------------------------------------------
// Kişisel alanlar (Notlarım)
// ---------------------------------------------------------------------------

export const suleymaninNotlari: OrnekKisiselAlan = {
  sahip: "suleyman",
  notlar: [
    {
      id: "haftalik-plan",
      tur: "todo",
      baslik: "Haftalık plan",
      renk: "default",
      sabitlendi: true,
      olusturan: "suleyman",
      gorevler: [
        { baslik: "Spor salonu üyeliğini yenile" },
        { baslik: "Diş hekimi randevusu al", bitis: "2026-11-12" },
        { baslik: "Annemi ara", tamamlandi: true },
        { baslik: "Elektrik faturası", bitis: "2026-11-15" },
        { baslik: "Kütüphane kitaplarını iade et" },
        { baslik: "Arabayı muayeneye götür" },
        { baslik: "Kargo iadesini gönder" },
        { baslik: "Bitkileri sula", tamamlandi: true },
      ],
    },
    {
      id: "market",
      tur: "todo",
      baslik: "Market",
      renk: "sari",
      sabitlendi: true,
      olusturan: "suleyman",
      gorevler: [
        { baslik: "Süt, yumurta" },
        { baslik: "Zeytinyağı" },
        { baslik: "Kedi maması" },
        { baslik: "Mercimek" },
      ],
    },
    {
      id: "ev-tadilati-fikirleri",
      tur: "text",
      baslik: "Ev tadilatı fikirleri",
      renk: "turuncu",
      olusturan: "suleyman",
      metin:
        "Salon duvarı için sıcak gri tonları. Mutfak dolaplarını boyamak yerine kapakları değiştirmek daha ucuz olabilir. Balkona katlanır masa.",
    },
    {
      id: "kitap-listesi",
      tur: "todo",
      baslik: "Kitap listesi",
      renk: "yesil",
      olusturan: "suleyman",
      gorevler: [
        { baslik: "Tutunamayanlar" },
        { baslik: "Kürk Mantolu Madonna", tamamlandi: true },
        { baslik: "Saatleri Ayarlama Enstitüsü" },
        { baslik: "Beyaz Kale" },
      ],
    },
    {
      id: "hediye-fikirleri",
      tur: "todo",
      baslik: "Hediye fikirleri",
      renk: "pembe",
      olusturan: "suleyman",
      gorevler: [
        { baslik: "Babam için termos" },
        { baslik: "Elif için kulaklık" },
        { baslik: "Ofis için kahve seti" },
      ],
    },
    {
      id: "toplanti-notlari-5-kasim",
      tur: "text",
      baslik: "Toplantı notları, 5 Kasım",
      renk: "default",
      olusturan: "suleyman",
      metin:
        "Bütçe revizyonu aralık başına kaldı. Yeni tedarikçi için üç teklif toplanacak. Deniz pazartesi sunum taslağını paylaşacak.",
    },
    {
      id: "yuruyus-rotalari",
      tur: "text",
      baslik: "Yürüyüş rotaları",
      renk: "turkuaz",
      olusturan: "suleyman",
      metin:
        "Belgrad Ormanı uzun parkur, yaklaşık 12 km. Polonezköy çevre yolu. Şile sahil hattı, gün batımına denk getir.",
    },
    {
      id: "pazartesi-aramalar",
      tur: "todo",
      baslik: "Pazartesi aramalar",
      renk: "default",
      olusturan: "suleyman",
      gorevler: [{ baslik: "Sigorta şirketi, poliçe yenileme" }, { baslik: "Apartman yöneticisi" }],
    },
    {
      id: "wifi-sifresi",
      tur: "text",
      baslik: "Wifi şifresi",
      renk: "gri",
      olusturan: "suleyman",
      metin: "Modemin altındaki etiket, misafirler için ayrı ağ aç.",
    },
    {
      id: "film-onerileri",
      tur: "text",
      baslik: "Film önerileri",
      renk: "mor",
      olusturan: "suleyman",
      metin:
        "Kış Uykusu, Bir Zamanlar Anadolu'da, Ahlat Ağacı. Ayşe'nin önerdiği Koreli yönetmenin yeni filmi.",
    },
    {
      id: "eski-alisveris-listesi",
      tur: "text",
      baslik: "Eski alışveriş listesi",
      renk: "default",
      arsivlendi: true,
      olusturan: "suleyman",
      metin: "Ampul, pil, çöp poşeti.",
    },
    {
      id: "silinecek-taslak",
      tur: "text",
      baslik: "Taslak",
      renk: "default",
      copte: true,
      olusturan: "suleyman",
      metin: "Çöp kutusu görünümü için örnek.",
    },
  ],
};

export const aysenNotlari: OrnekKisiselAlan = {
  sahip: "ayse",
  notlar: [
    {
      id: "ayse-okuma-listesi",
      tur: "todo",
      baslik: "Okuma listesi",
      renk: "default",
      olusturan: "ayse",
      gorevler: [{ baslik: "Bir Zamanlar Anadolu'da (film)" }, { baslik: "Beyaz Kale" }],
    },
  ],
};

export const ornekKisiselAlanlar: readonly OrnekKisiselAlan[] = [suleymaninNotlari, aysenNotlari];

# Sukano

Kişisel notlar ve ekiple paylaşılan projeler için, Google Keep benzeri, Türkçe arayüzlü bir not
uygulaması: metin ve yapılacaklar notları, gerçek zamanlı ortak düzenleme, hatırlatıcılar ve
çevrimdışı okuma; tamamı Cloudflare Workers üzerinde.

> [!NOTE]
> **Durum:** Geliştirme tamamlandı ve durduruldu; canlı site yayından kaldırılıyor. Depo, bir
> başvuru ve portföy çalışması olarak korunuyor. Aşağıdaki ekran görüntüleri, uygulamanın son
> sürümünden kurgusal örnek veriyle alınmıştır. Uygulamayı yerelde çalıştırmak ya da kendi
> Cloudflare hesabında yayınlamak mümkündür (bkz. [Hızlı başlangıç](#hızlı-başlangıç)).

<p align="center">
  <img src="docs/ekran-goruntuleri/masaustu-notlarim.webp" alt="Notlarım ızgarası: sabitlenmiş ve renkli notlar, görsel kapaklı kart, yapılacaklar kartları ve hatırlatıcı çipleri" width="100%">
</p>

## Ekran görüntüleri

Tüm görüntüler: [`docs/ekran-goruntuleri/`](docs/ekran-goruntuleri/). Kişiler ve içerik
kurgusaldır.

### Masaüstü

<table>
  <tr>
    <td width="50%"><img src="docs/ekran-goruntuleri/masaustu-metin-notu.webp" alt="Açık metin notu ve Aa biçimlendirme çubuğu"><br><sub>Açık metin notu: <b>Aa</b> ile açılan biçimlendirme çubuğu, hatırlatıcı çipi.</sub></td>
    <td width="50%"><img src="docs/ekran-goruntuleri/masaustu-yapilacaklar-menu.webp" alt="Yapılacaklar notu ve ⋯ menüsü"><br><sub>Proje içinde yapılacaklar notu: alt görevler, tarihler, atananlar ve <b>⋯</b> menüsü.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/ekran-goruntuleri/masaustu-proje.webp" alt="Proje sayfası"><br><sub>Proje sayfası: üyeler, rol rozeti, davet düğmesi, proje notları.</sub></td>
    <td><img src="docs/ekran-goruntuleri/masaustu-proje-ayarlari.webp" alt="Proje ayarları"><br><sub>Proje ayarları: üyeler ve roller, davet gönderme, bekleyen davet, tehlikeli bölge.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/ekran-goruntuleri/masaustu-arama.webp" alt="Arama sonuçları"><br><sub>Arama: notlarda, görevlerde ve projelerde; vurgulu eşleşmeler ve kapsam süzgeci.</sub></td>
    <td><img src="docs/ekran-goruntuleri/masaustu-bildirimler.webp" alt="Bildirim paneli"><br><sub>Bildirimler: davet, göreve atanma, hatırlatıcı, rol değişikliği.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/ekran-goruntuleri/masaustu-davetler.webp" alt="Davetler sayfası"><br><sub>Gelen davetler: kabul et ya da reddet.</sub></td>
    <td><img src="docs/ekran-goruntuleri/masaustu-ayarlar.webp" alt="Ayarlar"><br><sub>Ayarlar: profil, tema, hareketi azaltma, bildirim tercihleri.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/ekran-goruntuleri/masaustu-giris.webp" alt="Giriş sayfası"><br><sub>Giriş: "yükselen ızgara" arka planı.</sub></td>
    <td><img src="docs/ekran-goruntuleri/anim-masaustu-not-ac.webp" alt="Kartın açık nota dönüşmesi (animasyon)"><br><sub>Hareket: kart açık nota büyür, kapanınca yerine döner.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/ekran-goruntuleri/masaustu-koyu-notlarim.webp" alt="Koyu tema: Notlarım"><br><sub>Koyu tema: Notlarım.</sub></td>
    <td><img src="docs/ekran-goruntuleri/masaustu-koyu-not.webp" alt="Koyu tema: açık not"><br><sub>Koyu tema: proje içinde açık metin notu.</sub></td>
  </tr>
</table>

### Tablet

<table>
  <tr>
    <td width="50%"><img src="docs/ekran-goruntuleri/tablet-notlarim.webp" alt="Tablet: Notlarım ve dar kenar çubuğu"><br><sub>Dar (ray) kenar çubuğu ve iki sütunlu ızgara.</sub></td>
    <td width="50%"><img src="docs/ekran-goruntuleri/tablet-not.webp" alt="Tablet: görsel ekli açık not"><br><sub>Görsel eki olan açık not.</sub></td>
  </tr>
</table>

### Mobil

<table>
  <tr>
    <td width="20%"><img src="docs/ekran-goruntuleri/mobil-notlarim.webp" alt="Mobil: Notlarım"><br><sub>Notlarım</sub></td>
    <td width="20%"><img src="docs/ekran-goruntuleri/mobil-metin-notu.webp" alt="Mobil: metin notu"><br><sub>Metin notu</sub></td>
    <td width="20%"><img src="docs/ekran-goruntuleri/mobil-yapilacaklar.webp" alt="Mobil: yapılacaklar notu"><br><sub>Yapılacaklar, alt görevler açık</sub></td>
    <td width="20%"><img src="docs/ekran-goruntuleri/mobil-menu.webp" alt="Mobil: ⋯ alt sayfası"><br><sub><b>⋯</b> alt sayfası</sub></td>
    <td width="20%"><img src="docs/ekran-goruntuleri/mobil-cekmece.webp" alt="Mobil: gezinme çekmecesi"><br><sub>Gezinme çekmecesi</sub></td>
  </tr>
  <tr>
    <td><img src="docs/ekran-goruntuleri/mobil-koyu-notlarim.webp" alt="Mobil koyu: Notlarım"><br><sub>Koyu: Notlarım</sub></td>
    <td><img src="docs/ekran-goruntuleri/mobil-koyu-metin-notu.webp" alt="Mobil koyu: metin notu"><br><sub>Koyu: metin notu</sub></td>
    <td><img src="docs/ekran-goruntuleri/mobil-koyu-yapilacaklar.webp" alt="Mobil koyu: yapılacaklar notu"><br><sub>Koyu: yapılacaklar</sub></td>
    <td><img src="docs/ekran-goruntuleri/mobil-koyu-menu.webp" alt="Mobil koyu: ⋯ alt sayfası"><br><sub>Koyu: <b>⋯</b> alt sayfası</sub></td>
    <td><img src="docs/ekran-goruntuleri/mobil-koyu-cekmece.webp" alt="Mobil koyu: gezinme çekmecesi"><br><sub>Koyu: çekmece</sub></td>
  </tr>
  <tr>
    <td><img src="docs/ekran-goruntuleri/anim-mobil-not-ac.webp" alt="Mobil: kartın açık nota geçişi (animasyon)"><br><sub>Kart → açık not geçişi</sub></td>
    <td colspan="4"></td>
  </tr>
</table>

### Tasarım taslakları

Uygulamadan önce hazırlanan tasarım dosyalarından birkaç ekran (taslaktır, uygulamanın kendisi
değildir; kaynaklar [`docs/design/`](docs/design/)):

<table>
  <tr>
    <td width="40%"><img src="docs/ekran-goruntuleri/tasarim/Project.webp" alt="Tasarım taslağı: proje sayfası"><br><sub>Taslak: proje sayfası (masaüstü)</sub></td>
    <td width="20%"><img src="docs/ekran-goruntuleri/tasarim/MHome.webp" alt="Tasarım taslağı: mobil ana sayfa"><br><sub>Taslak: mobil ana sayfa</sub></td>
    <td width="20%"><img src="docs/ekran-goruntuleri/tasarim/MText.webp" alt="Tasarım taslağı: mobil metin notu"><br><sub>Taslak: mobil metin notu</sub></td>
    <td width="20%"><img src="docs/ekran-goruntuleri/tasarim/MTodo.webp" alt="Tasarım taslağı: mobil yapılacaklar"><br><sub>Taslak: mobil yapılacaklar</sub></td>
  </tr>
</table>

## Özellikler

- **Kişisel notlar:** metin ve yapılacaklar notları; 10 not rengi, sabitleme, arşiv, çöp (7 gün),
  sürükle-bırak sıralama, sürüm geçmişi ve geri yükleme, kopyalama, metin ↔ yapılacaklar dönüşümü.
  Metin notunda zengin biçim: kalın, italik, üstü çizili, iki başlık düzeyi, madde ve numaralı
  liste, bağlantı.
- **Yapılacaklar:** iç içe alt görevler, başlangıç ve bitiş tarihi, saat, açıklama, kişiye atama,
  "Tamamlananlar" bölümü, klavyeyle tam kullanım (girinti, taşıma, tamamlama kısayolları).
- **Projeler:** paylaşılan not alanları; **yönetici**, **düzenleyici** ve **görüntüleyici** rolleri;
  e-postayla ve uygulama içinden davet, rol değiştirme, üyeyi çıkarma, projeden ayrılma; silinen
  proje 7 gün geri getirilebilir. Kişisel not projeye taşınabilir (geri alınabilir).
- **Gerçek zamanlı ortak çalışma:** metin notlarında Yjs ile eşzamanlı düzenleme ve imleçler,
  yapılacaklarda canlı görev işlemleri, notu kimlerin açık tuttuğunu gösteren varlık (presence),
  ızgaranın canlı güncellenmesi; kopan bağlantıda yeniden bağlanma.
- **Dosya ekleri:** metin notuna görsel ve dosya (R2, dosya başına 10 MB); kartta görsel kapak,
  görsel görüntüleyici, sürükle-bırak ve panodan yapıştırma.
- **Hatırlatıcılar ve bildirimler:** not ve görev hatırlatıcıları (kişinin saat diliminde),
  dakikalık cron, uygulama içi bildirim zili, **Web Push** (bağımlılıksız VAPID + RFC 8291),
  e-posta (davet, doğrulama, şifre sıfırlama).
- **Arama:** notlarda, görevlerde ve projelerde; proje bazında süzme, vurgulu eşleşmeler.
- **Kimlik:** e-posta + şifre (doğrulama ve sıfırlama), isteğe bağlı Google ile giriş, Turnstile ile
  bot koruması, hız sınırları.
- **PWA ve çevrimdışı:** kurulabilir uygulama; son açılan sayfalar çevrimdışı okunur (oturum başına
  ayrı önbellek), çevrimdışı bandı.
- **Hareket ve erişilebilirlik:** kart → not geçişleri ve mikro etkileşimler (Motion); "Hareketi
  azalt" tercihi; klavye ile tam gezinme, odak yönetimi, ekran okuyucu duyuruları; her sayfada
  axe denetimi ve Lighthouse erişilebilirlik ≥ 95.
- **Koyu tema:** Açık / Koyu / Sistem; not ve proje renkleri iki temada da kontrast denetimli.
- **Duyarlı arayüz:** masaüstü (kenar çubuğu), tablet (ray) ve mobil (çekmece, alt sayfalar) için
  ayrı düzenler.

## Mimari

```mermaid
flowchart LR
  B["Tarayıcı<br/>React · Tiptap · Yjs<br/>Service Worker (PWA, push)"]
  subgraph CF["Cloudflare"]
    W["Worker<br/>React Router v7 SSR · API<br/>Better Auth · güvenlik başlıkları"]
    D1[("D1<br/>SQLite: kullanıcılar, notlar,<br/>görevler, projeler, bildirimler")]
    R2[("R2<br/>sukano-files<br/>dosya ekleri")]
    NR["Durable Object<br/>NoteRoom<br/>not başına: Yjs, varlık"]
    PR["Durable Object<br/>ProjectRoom<br/>alan başına yayın kanalı"]
    CRON["Cron (dakikalık)<br/>hatırlatıcı, bildirim,<br/>temizlik"]
    TS["Turnstile"]
  end
  RS["Resend<br/>e-posta"]
  WP["Web Push<br/>hizmetleri"]

  B -- "HTTPS (SSR, .data, API)" --> W
  B <-- "WebSocket" --> W
  W <--> NR
  W <--> PR
  W --> D1
  W --> R2
  NR -- "kadanslı kopya" --> D1
  CRON --> W
  W --> TS
  W --> RS
  W --> WP
```

Tek bir Worker hem sunucu tarafı oluşturmayı (React Router v7 framework modu) hem API'yi hem de
canlı WebSocket yollarını karşılar. Metin notunun ortak düzenleme durumu not başına bir
`NoteRoom`'da (Yjs) tutulur ve birkaç saniyede bir D1'e HTML olarak yazılır; proje ve kişisel alan
ızgaraları `ProjectRoom` kanalından canlı güncellenir. Ayrıntılar:
[`docs/TEKNIK.md` → Gerçek zamanlı](docs/TEKNIK.md#gerçek-zamanlı).

## Teknolojiler

| Alan            | Kullanılanlar                                                                      |
| --------------- | ---------------------------------------------------------------------------------- |
| Arayüz          | React 19, React Router v7 (framework modu), TypeScript, Tailwind CSS v4, shadcn/ui |
| Düzenleyici     | Tiptap 3 (ProseMirror), Yjs, `@tiptap/y-tiptap`                                    |
| Hareket         | Motion, dnd-kit (sürükle-bırak)                                                    |
| Sunucu          | Cloudflare Workers, Durable Objects (WebSocket hibernation), Cron Triggers         |
| Veri            | Cloudflare D1 (SQLite) + Drizzle ORM, Cloudflare R2                                |
| Kimlik          | Better Auth (e-posta + şifre, Google OAuth), Cloudflare Turnstile                  |
| E-posta ve push | Resend, Web Push (VAPID, WebCrypto ile)                                            |
| Test            | Vitest, Testing Library, `@cloudflare/vitest-plugin`, Playwright, axe-core         |
| Kalite          | ESLint (typescript-eslint, react-hooks, jsx-a11y), Prettier, Lighthouse            |
| CI / CD         | GitHub Actions: denetim ve testler; dağıtım iş akışı (artık yalnızca elle)         |

## Hızlı başlangıç

Yalnızca yerel geliştirme içindir; Cloudflare hesabı gerekmez (D1, R2 ve Durable Object'ler
yerel `workerd` içinde çalışır). Gereksinim: Node.js 22 (`.nvmrc`).

```sh
nvm use                         # Node 22
npx npm@11 install              # postinstall: wrangler types
cp .dev.vars.example .dev.vars  # yerel gizli değerler (test anahtarları hazır)
npm run db:migrate:local        # D1 şeması
npm run db:seed                 # örnek kullanıcılar, projeler, notlar
npm run dev                     # http://localhost:5173
```

Tohum hesapları `<ad>@test.sukano` biçimindedir (`suleyman`, `ayse`, `mehmet`, `zeynep`, `can`),
ortak şifre `Test1234!`; yalnızca yerel ve önizleme ortamları içindir. E-posta anahtarı boşken
e-postalar konsola yazılır. Komutların tamamı ve yerel ayrıntılar:
[`docs/TEKNIK.md` → Kurulum](docs/TEKNIK.md#kurulum).

## Testler

| Katman           | Araç                                               | Ölçek                                             |
| ---------------- | -------------------------------------------------- | ------------------------------------------------- |
| Birim ve bileşen | Vitest (jsdom) + Testing Library                   | 67 dosya, ~920 test; saf mantıkta kapsam ≥ %85    |
| Worker / API     | Vitest + `@cloudflare/vitest-plugin` (workerd, D1) | 16 dosya, ~330 test (rol matrisleri, güvenlik)    |
| Uçtan uca        | Playwright (Chromium) + axe-core                   | 15 dosya, 411 çalıştırma: masaüstü, tablet, mobil |
| Lighthouse       | `scripts/lighthouse.ts`                            | erişilebilirlik her sayfada ≥ 95                  |

```sh
npm test                 # birim + bileşen
npm run coverage         # aynısı, kapsam eşikleriyle
npm run test:workers     # Worker / API testleri
npm run e2e              # uçtan uca, üç görünüm (ilk kez: npx playwright install chromium)
npm run e2e:duman        # yalnızca duman seti
npm run lighthouse       # Lighthouse denetimi
npm run typecheck && npm run lint
```

Uçtan uca testler üretim derlemesini `vite preview` ile ayrı bir yerel veritabanına karşı çalıştırır
ve her sayfada açık ve koyu temada axe denetimi yapar. Ayrıntılar:
[`docs/TEKNIK.md` → Testler](docs/TEKNIK.md#testler).

## Kendi hesabında yayınlamak

Workers Paid planlı bir Cloudflare hesabı, D1 veritabanı, R2 kovası, Worker gizli değişkenleri,
Turnstile, Resend ve (isteğe bağlı) Google OAuth gerekir. Adım adım kontrol listesi, CI ile dağıtım,
güvenlik başlıkları ve performans notları: [`docs/OPERASYON.md`](docs/OPERASYON.md). Yayını
kapatmak için aynı dosyadaki
[Yayından kaldırma](docs/OPERASYON.md#6-yayından-kaldırma) bölümüne bakın.

## Lisans

[Apache License 2.0](LICENSE).

## Belgeler

- [`docs/TEKNIK.md`](docs/TEKNIK.md): ayrıntılı teknik belgeler (yapı, veritabanı, kimlik, notlar,
  projeler, gerçek zamanlı, ekler, bildirimler, hareket, PWA, testler, CI)
- [`docs/OPERASYON.md`](docs/OPERASYON.md): yayına alma, güvenlik, PWA, performans, yayından
  kaldırma
- [`docs/PLAN.md`](docs/PLAN.md): ürün ve teknik plan
- [`docs/design/`](docs/design/): tasarım kaynakları
- [`docs/ekran-goruntuleri/`](docs/ekran-goruntuleri/): ekran görüntüleri

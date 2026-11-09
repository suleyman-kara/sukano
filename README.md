# Sukano

Kişisel notlar ve ekiple paylaşılan projeler için Türkçe arayüzlü bir not uygulaması. Metin ve
yapılacaklar notları, gerçek zamanlı ortak düzenleme, hatırlatıcılar ve çevrimdışı okuma; tamamı
Cloudflare Workers üzerinde.

> [!NOTE]
> **Durum:** Geliştirme tamamlandı ve durduruldu; canlı site yayından kaldırıldı. Depo, yapılan
> işin kaydı olarak korunuyor. Ekran görüntüleri son sürümden, kurgusal örnek veriyle alınmıştır.

<p align="center">
  <img src="docs/ekran-goruntuleri/masaustu-notlarim.webp" alt="Notlarım ızgarası" width="100%">
</p>

## Ekran görüntüleri

<table>
  <tr>
    <td width="50%"><img src="docs/ekran-goruntuleri/masaustu-metin-notu.webp" alt="Açık metin notu"><br><sub>Açık not ve <b>Aa</b> biçimlendirme çubuğu</sub></td>
    <td width="50%"><img src="docs/ekran-goruntuleri/masaustu-yapilacaklar-menu.webp" alt="Yapılacaklar notu"><br><sub>Yapılacaklar: alt görevler, tarihler, atananlar, <b>⋯</b> menüsü</sub></td>
  </tr>
  <tr>
    <td><img src="docs/ekran-goruntuleri/masaustu-proje.webp" alt="Proje sayfası"><br><sub>Proje: üyeler, roller, ortak notlar</sub></td>
    <td><img src="docs/ekran-goruntuleri/masaustu-koyu-notlarim.webp" alt="Koyu tema"><br><sub>Koyu tema</sub></td>
  </tr>
  <tr>
    <td><img src="docs/ekran-goruntuleri/masaustu-arama.webp" alt="Arama"><br><sub>Arama</sub></td>
    <td><img src="docs/ekran-goruntuleri/masaustu-bildirimler.webp" alt="Bildirimler"><br><sub>Bildirimler</sub></td>
  </tr>
  <tr>
    <td><img src="docs/ekran-goruntuleri/tablet-notlarim.webp" alt="Tablet"><br><sub>Tablet</sub></td>
    <td><img src="docs/ekran-goruntuleri/masaustu-giris.webp" alt="Giriş"><br><sub>Giriş</sub></td>
  </tr>
</table>

<table>
  <tr>
    <td width="25%"><img src="docs/ekran-goruntuleri/mobil-notlarim.webp" alt="Mobil notlar"><br><sub>Mobil</sub></td>
    <td width="25%"><img src="docs/ekran-goruntuleri/mobil-metin-notu.webp" alt="Mobil not"><br><sub>Açık not</sub></td>
    <td width="25%"><img src="docs/ekran-goruntuleri/mobil-yapilacaklar.webp" alt="Mobil yapılacaklar"><br><sub>Yapılacaklar</sub></td>
    <td width="25%"><img src="docs/ekran-goruntuleri/mobil-koyu-notlarim.webp" alt="Mobil koyu"><br><sub>Koyu tema</sub></td>
  </tr>
</table>

Diğer görüntüler ve kart → not açılış animasyonu: [`docs/ekran-goruntuleri/`](docs/ekran-goruntuleri/).

## Neler yapıldı

- **Notlar:** metin (kalın, italik, başlık, liste, bağlantı) ve yapılacaklar notları; renk,
  sabitleme, arşiv, çöp ve "Geri al"; sürükleyerek sıralama; sürüm geçmişi; biçimli kart önizlemesi.
- **Yapılacaklar:** iç içe alt görevler, başlangıç–bitiş tarihleri, kişi atama, klavye kısayolları.
- **Projeler:** üyeler ve roller (sahip, düzenleyici, görüntüleyici), e-posta ile davet, notu
  projeye taşıma/kopyalama, proje silme ve geri getirme.
- **Gerçek zamanlı:** aynı notu birlikte düzenleme (Yjs), kimin nerede olduğu göstergesi, ızgaranın
  canlı güncellenmesi.
- **Ekler, hatırlatıcılar, bildirimler:** görsel ve dosya ekleri, not hatırlatıcıları, uygulama içi
  ve Web Push bildirimleri.
- **Hesap:** e-posta ile kayıt ve doğrulama, şifre sıfırlama, isteğe bağlı Google ile giriş, bot
  koruması (Turnstile).
- **Deneyim:** açık/koyu tema, masaüstü–tablet–mobil düzenleri, hareket sistemi ve "Hareketi
  azalt" ayarı, erişilebilirlik (klavye, ekran okuyucu, axe), PWA ve çevrimdışı okuma.
- **Güvenlik ve hız:** nonce'lu CSP, istek sınırları, yetki denetimi testleri; az sayıda veritabanı
  turu, önden yükleme ve not açılınca düzenleyicinin beklemeden hazır olması.

## Teknolojiler

React Router v7 · TypeScript · Cloudflare Workers, D1 (Drizzle), R2, Durable Objects · Better Auth
· Tiptap + Yjs · Tailwind CSS + shadcn/ui · Motion · Resend · Vitest · Playwright.

## Nasıl geliştirildi

Plan ve tasarımın ardından yedi aşamada ilerledi: iskelet ve CI → kimlik doğrulama ve notlar →
yapılacaklar → projeler ve roller → gerçek zamanlı → ekler ve hatırlatıcılar → PWA, güvenlik,
hareket ve erişilebilirlik. Yayından sonra hız iyileştirmeleri ve ikinci bir tasarım turu yapıldı.

Her değişiklik testlerden geçerek birleştirildi: ~920 birim/bileşen testi, ~330 Worker testi ve
masaüstü, tablet, mobil görünümlerde axe taramalı ~400 uçtan uca test, ayrıca Lighthouse.

## Yerelde çalıştırma

```bash
npx npm@11 install
cp .dev.vars.example .dev.vars
npm run db:migrate:local && npm run db:seed
npm run dev
```

Testler: `npm run test`, `npm run test:workers`, `npm run e2e`.

## Lisans

[Apache 2.0](LICENSE)

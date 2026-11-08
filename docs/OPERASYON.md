# Sukano · Operasyon

Yayına alma, gizli değişkenler, güvenlik ve performans notları. Geliştirme kurulumu için
[`README.md`](../README.md); ürün planı için [`PLAN.md`](PLAN.md).

## 1. Yayın öncesi kontrol listesi (Workers Paid)

Aşağıdakilerin hepsi bir kez, Cloudflare panelinde ya da `wrangler login` / `CLOUDFLARE_API_TOKEN`
ile yapılır. Kutucuklar sırayla işaretlenmeli; bir adım atlanırsa dağıtım ya da ilk giriş düşer.

- [ ] **Plan:** hesabı **Workers Paid**'e (ayda 5 $) geçir. Gerekçe: şifre hash'leme (scrypt)
      ücretsiz planın 10 ms CPU sınırını aşabilir; Paid'de istek başına 30 sn CPU, D1 / R2 / Durable
      Object kotaları büyür.
- [ ] **GitHub depo gizli değişkenleri** (Settings → Secrets and variables → Actions):
  - `CLOUDFLARE_API_TOKEN`: "Edit Cloudflare Workers" şablonundan; izinler en az
    **Account · Workers Scripts: Edit**, **Account · D1: Edit**, **Account · Workers R2 Storage:
    Edit** (kova oluşturmak için), **User · User Details: Read**.
  - `CLOUDFLARE_ACCOUNT_ID`: panelin sağ sütunundaki hesap kimliği.
- [ ] **D1:** `npx wrangler d1 create sukano` → çıktıdaki `database_id`'yi `wrangler.jsonc`'deki
      `00000000-0000-0000-0000-000000000000` yer tutucusunun yerine yaz ve commit'le; sonra
      `npm run db:migrate:remote` (CI de her `main` dağıtımında uygular).
- [ ] **R2:** panelde R2'yi etkinleştir (ödeme bilgisi ister), sonra
      `npx wrangler r2 bucket create sukano-files`. Kova herkese açık **yapılmaz** (dosyalar
      Worker'dan yetkiyle akar).
- [ ] **Worker gizli değişkenleri** (`npx wrangler secret put <AD>`; önizleme sürümleri de
      aynılarını kullanır):

  | Ad                     | Değer                                                                 |
  | ---------------------- | --------------------------------------------------------------------- |
  | `BETTER_AUTH_SECRET`   | `openssl rand -base64 32` (≥ 32 karakter; değişirse oturumlar düşer)  |
  | `BETTER_AUTH_URL`      | Üretim kök adresi, ör. `https://sukano.app` (sonunda `/` yok)         |
  | `RESEND_API_KEY`       | Resend API anahtarı (boşsa e-posta gitmez, kayıt doğrulanamaz)        |
  | `TURNSTILE_SECRET_KEY` | Turnstile gizli anahtarı (test anahtarı üretimde **kullanılmaz**)     |
  | `VAPID_PUBLIC_KEY`     | `npx web-push generate-vapid-keys` çıktısı (yeni çift üret!)          |
  | `VAPID_PRIVATE_KEY`    | Aynı çiftin özel anahtarı                                             |
  | `GOOGLE_CLIENT_ID`     | İsteğe bağlı: Google OAuth istemci kimliği (boşsa düğme gizli)        |
  | `GOOGLE_CLIENT_SECRET` | İsteğe bağlı: Google OAuth gizli anahtarı                             |

  Boş bırakılacak isteğe bağlı değerler için de `wrangler secret put` ile boş değer yazılabilir;
  `wrangler.jsonc → secrets.required` listesi tip üretimi içindir.

- [ ] **Gizli olmayan değerler** (`wrangler.jsonc → vars`, commit'le):
  - `EMAIL_FROM`: Resend'de **doğrulanmış alan adından** gönderen, ör. `Sukano <info@sukano.suleymankara.com>`.
  - `TURNSTILE_SITE_KEY`: panelde oluşturulan Turnstile sitesinin anahtarı (alan adı listesine
    üretim adresini ve önizleme için `*.workers.dev` alt alanını ekle).
  - `VAPID_SUBJECT`: gerçek iletişim adresi (`mailto:…`).
- [ ] **Resend:** hesap aç, gönderici alan adını ekle, DNS'e SPF / DKIM (ve önerilen DMARC)
      kayıtlarını gir, doğrulanana kadar bekle.
- [ ] **Google OAuth** (isteğe bağlı): Google Cloud Console → Credentials → OAuth client (Web);
      yetkili yönlendirme URI'si `<BETTER_AUTH_URL>/api/auth/callback/google`.
- [ ] **Alan adı:** Workers → sukano → Settings → Domains & Routes → Custom domain. HSTS iki yıl
      gönderilir: alan adı ve **tüm alt alan adları** HTTPS olmalı.
- [ ] **İlk dağıtım:** `main`'e push (CI → Dağıtım iş akışı) ya da elle aşağıdaki adımlar.
- [ ] **Duman denetimi:** `/health` → `{ "ok": true }`; kayıt → doğrulama e-postası gelir; giriş;
      not oluştur; iki tarayıcıda canlı düzenleme; Ayarlar → Bildirimler → "Bu cihazda aç";
      `E2E_BASE_URL=https://… npm run e2e:duman` (üretim veritabanında test hesabı gerekir; tercihen
      önizleme adresine karşı).

## 2. Dağıtım

**CI ile (önerilen).** `.github/workflows/deploy.yml`, CI başarıyla bitince koşar:

- `main`: `wrangler d1 migrations apply sukano --remote` → `wrangler deploy`.
- Diğer dallar: `wrangler versions upload --preview-alias <dal>` (önizleme adresi iş özetinde).
  **Dikkat:** önizleme sürümleri üretimle **aynı D1, R2 ve gizli değişkenleri** kullanır; yalnızca
  kod farklıdır. Önizlemede `BETTER_AUTH_URL` üretim adresidir (e-posta bağlantıları üretime gider).

**Elle:**

```sh
npm ci
npm run typecheck && npm run lint && npm run coverage && npm run test:workers
npm run build
npm run db:migrate:remote
npx wrangler deploy
```

**Geri alma:** `npx wrangler rollback` (bir önceki sürüm). D1 migration'ları geri alınmaz; yıkıcı
migration'dan önce `npx wrangler d1 time-travel info sukano` ile geri dönüş noktası not edilir.

## 3. Güvenlik

### Başlıklar

Worker'ın ürettiği her yanıt (`workers/app.ts` → `app/domain/security/headers.ts`) ve statik
dosyalar (`public/_headers`):

| Başlık                       | Değer                                                               |
| ---------------------------- | ------------------------------------------------------------------- |
| `Content-Security-Policy`    | HTML: nonce tabanlı (aşağıda); JSON / `.data`: `default-src 'none'` |
| `Strict-Transport-Security`  | `max-age=63072000; includeSubDomains` (yalnızca HTTPS)              |
| `X-Frame-Options`            | `DENY` (+ CSP `frame-ancestors 'none'`)                             |
| `X-Content-Type-Options`     | `nosniff`                                                           |
| `Referrer-Policy`            | `strict-origin-when-cross-origin`                                   |
| `Permissions-Policy`         | kamera, mikrofon, konum, ödeme, USB … kapalı                        |
| `Cross-Origin-Opener-Policy` | `same-origin`                                                       |

**CSP kararı (HTML):**

```
default-src 'self'; script-src 'nonce-…' 'strict-dynamic' 'self' https://challenges.cloudflare.com;
style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.googleusercontent.com;
font-src 'self'; connect-src 'self' wss://<alan> https://challenges.cloudflare.com;
media-src 'self' blob:; frame-src https://challenges.cloudflare.com; worker-src 'self';
manifest-src 'self'; object-src 'none'; base-uri 'self';
form-action 'self' https://accounts.google.com; frame-ancestors 'none'; upgrade-insecure-requests
```

- Her istekte 128 bit nonce üretilir; React Router'ın hidrasyon betikleri (`ServerRouter nonce`),
  React'in akış betikleri (`renderToReadableStream({ nonce })`), `<Scripts>`,
  `<ScrollRestoration>` ve tema betiği bunu taşır. `'strict-dynamic'` sayesinde bu betiklerin
  yüklediği rota parçaları ve Turnstile çalışır; **nonce'suz satır içi betik ve `on*` öznitelikleri
  engellenir** (`'unsafe-inline'` ve `'unsafe-eval'` yok). `'self'` ve Turnstile kökeni yalnızca
  CSP 2 tarayıcıları için yedektir.
- **Bilinen ödünleşim:** `style-src 'unsafe-inline'`. React `style` öznitelikleri, Radix, Motion
  ve sonner satır içi stil yazar; nonce stil özniteliklerini kapsamaz. Stil enjeksiyonu betik
  çalıştırmaz; risk CSS ile veri sızdırma girişimleriyle sınırlıdır (metin girdileri zaten
  kaçışlanır, HTML gövdesi Tiptap şemasından geçer).
- `connect-src` aynı kökenin WebSocket'ini (`wss://<alan>`, yerelde `ws://`) açıkça yazar
  (Safari `'self'` ile WebSocket'i eşleştirmez).
- Geliştirme sunucusunda (`npm run dev`) belge CSP'si kapalıdır (Vite HMR nonce'suz betik ekler);
  önizleme (`vite preview`), Worker testleri ve üretimde açıktır.
- Ek indirme rotası kendi CSP'sini korur (görsellerde `default-src 'none'; sandbox`).

### CSRF

Başka kökenden gelen her durum değiştiren istek (`POST`, `PUT`, `PATCH`, `DELETE`; `Origin`
farklı ya da `null`, `Origin` yoksa `Sec-Fetch-Site: cross-site`) Worker girişinde 403 alır;
rotanın ayrıca denetlemesi gerekmez. Oturum çerezi ayrıca `SameSite=Lax`'tır.

### Hız sınırları

Workers Rate Limiting (`wrangler.jsonc → ratelimits`; `namespace_id` hesapta tekil olmalı).
Aşılınca **429**, `Retry-After: 60` ve Türkçe ileti.

| Binding              | Anahtar                    | Sınır    | Kapsam                                                   |
| -------------------- | -------------------------- | -------- | -------------------------------------------------------- |
| `AUTH_IP_LIMITER`    | IP + eylem                 | 20 / dk  | giriş, kayıt, şifre sıfırlama isteği, doğrulama e-postası |
| `AUTH_EMAIL_LIMITER` | e-posta + eylem            | 5 / dk   | aynı eylemler                                            |
| `UPLOAD_LIMITER`     | kullanıcı                  | 30 / dk  | `POST /api/notlar/:id/ekler`                             |
| `INVITE_LIMITER`     | kullanıcı                  | 20 / dk  | proje daveti (`intent=invite`)                           |
| `PUSH_LIMITER`       | kullanıcı                  | 10 / dk  | `POST /api/push/abonelik`                                |

İletiler: kimlik "Çok fazla deneme yaptın. Lütfen bir dakika sonra tekrar dene.", diğerleri
"Çok fazla istek gönderdin. Lütfen bir dakika sonra tekrar dene." Sayaçlar konum başına ve
yaklaşıktır (kötüye kullanım freni, kesin kota değil). Not yazımı, görev işlemleri ve canlı
bağlantılar sınırsızdır (otomatik kayıt sık istek atar; kötüye kullanım oturum gerektirir).

### Yetki denetimi

- Kök middleware varsayılan kapalıdır: herkese açık yollar dışında her rota oturum ister.
- `tests/workers/guvenlik.test.ts` derlenmiş rota tablosunun **tamamını** dolaşır: oturumsuz her
  korumalı rota GET / POST / `.data` isteğinde girişe yönlendirir; herkese açık yol listesi
  testte sabittir (yeni açık rota bilinçli eklenmeli). Canlı WebSocket yolları oturumsuz 401.
  Üye olmayan kullanıcı başka alanın not, proje, üye, sürüm, görev ve eklerini hiçbir uçta
  göremez ve değiştiremez (403 / 404).
- Rol × eylem matrisleri her aşamanın kendi Worker testlerinde (`projeler`, `notlar`, `gorevler`,
  `ekler`, `bildirimler`, `canli`).

## 4. PWA ve çevrimdışı

- `public/manifest.webmanifest` (ad, `standalone`, simgeler 192 / 512 / maskable, tema rengi),
  `apple-touch-icon.png`; simgeler `public/icons/*.svg`'den üretilmiştir (2×2 ızgara, yeşil zemin).
- `public/sw.js`: Web Push + önbellek. Statik dosyalar ayrı önbellekte; sayfalar (belge ve
  `.data`) her zaman önce ağdan, yalnızca sunucunun `X-Sukano-Oturum` başlığıyla işaretlediği
  yanıtlar **oturum başına ayrı** önbelleğe (en çok 40 sayfa). Çıkış (`POST /cikis`), hesap silme
  ve oturum değişimi önbelleği siler; bir oturumun sayfası başka oturuma hiç verilmez. API,
  WebSocket, `/__test/*` önbelleğe girmez.
- Çevrimdışıyken: son açılan sayfalar önbellekten açılır; canlı katman "Çevrimdışısın" bandını
  gösterir ve düzenleme kapalıdır; yeniden doğrulama yapılmaz (ekrandaki veri kalır); hiç
  açılmamış sayfa `cevrimdisi.html` gösterir. Not ekleri (görseller) çevrimdışı önbelleğe alınmaz.
- Service worker sürümü `sw.js`'teki `VERSION` ile; statik önbellek adı değişince eskisi silinir.
  `sw.js` `Cache-Control: no-cache` ile gelir, tarayıcı her açılışta yenisini denetler.

## 5. Performans

### Paket boyutu (ilk yükleme, gzip, `npm run build` sonrası rota başına JS)

| Rota       | Aşama 6a öncesi | Sonrası | Not                                                    |
| ---------- | --------------- | ------- | ------------------------------------------------------ |
| Notlarım   | 408 kB          | 290 kB  | "Not al" düzenleyicisi (Tiptap) tembel yükleniyor      |
| Proje      | 415 kB          | 296 kB  | aynı                                                   |
| Açık not   | 445 kB          | 450 kB  | düzenleyici gerekli (değişmedi)                        |
| Giriş      | 177 kB          | 183 kB  | Aşama 6b hareket katmanı                               |

Derleme dosyaları `Cache-Control: public, max-age=31536000, immutable` ile gelir.

### D1

- Izgara listesi (`notes.server.ts → list`): kart görevleri, ekleri ve hatırlatıcıları **paralel**
  sorgulanır (önceden sıralı üç gidiş-dönüş). Not ayrıntısında ekler ve iki kişi sorgusu paralel.
- **Düzeltilen hata:** kart görevleri ve atananlar sorgusu `IN (…)` listesini bölmüyordu; D1
  sorgu başına 100 bağlı parametre kabul ettiği için 100'den çok yapılacaklar notu olan ızgara
  düşüyordu. Artık 90'lık parçalarla (Worker testiyle).
- Dizinler: not listeleri (`owner/project, trashed_at, archived_at, position`), görevler
  (`note_id, parent_id, position`), hatırlatıcılar (`sent_at, at`, hedef tekil), bildirimler
  (`user_id, read_at` / `created_at`), davetler, ekler, sürümler. Izgara sorguları dizinlerle
  karşılanıyor; N+1 yok (kart ayrıntıları toplu `IN` sorgularıyla).

### Durable Object maliyeti

- Not başına bir `NoteRoom`, proje / kişisel alan başına bir `ProjectRoom`; WebSocket
  **hibernation** ile: bağlı ama sessiz istemci süre faturası üretmez. Canlılık `ping`'i
  `setWebSocketAutoResponse` ile Durable Object uyandırılmadan yanıtlanır.
- Maliyet esas olarak gelen iletiler (yazım, imleç) ve D1 kopya yazımlarıdır (kadanslı).
  10 kişilik ekip için Workers Paid'in dahil kotası (aylık 1 M istek, 400 K GB-s) fazlasıyla yeter.
- Oda boşalınca depolama silinir (kalıcı silme / hesap silme yolları).

### Lighthouse

`npm run lighthouse` (yerel; CI'da `lighthouse` işi): üretim derlemesi, mobil emülasyon (bir sayfa
masaüstü). Erişilebilirlik < 95 işi düşürür. Lighthouse 12+ "PWA" kategorisini kaldırdı;
kurulabilirlik `tests/e2e/pwa.spec.ts`'te Chromium'un `Page.getInstallabilityErrors` denetimiyle
doğrulanır.

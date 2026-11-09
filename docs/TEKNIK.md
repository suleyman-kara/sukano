# Sukano · Teknik belgeler

Bu dosya, depo kökündeki README'nin önceki ayrıntılı teknik bölümlerini olduğu gibi taşır. Genel
tanıtım, ekran görüntüleri ve hızlı başlangıç için [`README.md`](../README.md); yayına alma ve
yayından kaldırma için [`OPERASYON.md`](OPERASYON.md); ürün ve teknik plan için
[`PLAN.md`](PLAN.md); tasarım kaynakları için [`design/`](design/).

**Yığın:** React Router v7 (framework modu) · Vite · TypeScript · Tailwind CSS v4 · shadcn/ui ·
Cloudflare Workers.

## İçindekiler

- [Kurulum](#kurulum)
- [Betikler](#betikler)
- [Yapı](#yapı)
- [Tasarım sistemi](#tasarım-sistemi)
- [Veritabanı ve migration](#veritabanı-ve-migration)
- [Dağıtım ve gizli değişkenler](#dağıtım-ve-gizli-değişkenler)
- [Kimlik doğrulama](#kimlik-doğrulama)
  - [Kimlik testleri](#kimlik-testleri)
- [Kişisel notlar](#kişisel-notlar)
- [Projeler, roller, davetler](#projeler-roller-davetler)
- [Proje arayüzü](#proje-arayüzü)
- [Proje notları arayüzü](#proje-notları-arayüzü)
- [Gerçek zamanlı](#gerçek-zamanlı)
  - [Durable Object'ler](#durable-objectler)
  - [Bağlantı ve yetki (workers/live-routes.ts)](#bağlantı-ve-yetki-workerslive-routests)
  - [Protokol (app/domain/realtime/protocol.ts)](#protokol-appdomainrealtimeprotocolts)
  - [Metin notu: Yjs ve D1 kopyası](#metin-notu-yjs-ve-d1-kopyası)
  - [Yapılacaklar: yazım yolu](#yapılacaklar-yazım-yolu)
  - [Canlı ızgara](#canlı-ızgara)
  - [İstemci kancaları](#i̇stemci-kancaları)
  - [Testler](#testler)
  - [Bilinen sınırlar](#bilinen-sınırlar)
  - [Canlı arayüz (Aşama 4b)](#canlı-arayüz-aşama-4b)
- [Dosya ekleri](#dosya-ekleri)
- [Hatırlatıcılar ve bildirimler](#hatırlatıcılar-ve-bildirimler)
- [Hareket ve erişilebilirlik](#hareket-ve-erişilebilirlik)
- [PWA, çevrimdışı ve güvenlik](#pwa-çevrimdışı-ve-güvenlik)
- [Cloudflare tarafında yapılacaklar](#cloudflare-tarafında-yapılacaklar)
- [Testler](#testler)
- [CI](#ci)

## Kurulum

Gereksinimler: Node.js 22 (`.nvmrc`), npm.

```sh
nvm use          # Node 22
npm install      # postinstall: wrangler types → worker-configuration.d.ts
npm run dev      # http://localhost:5173
```

Geliştirme sunucusu Cloudflare Vite eklentisiyle Worker'ı yerel `workerd` içinde çalıştırır.

| Yol                     | Açıklama                                                       |
| ----------------------- | -------------------------------------------------------------- |
| `/`                     | Uygulama kabuğu + Notlarım (oturum ister)                      |
| `/giris`, `/kayit`      | Giriş ve kayıt; bkz. [Kimlik doğrulama](#kimlik-doğrulama)     |
| `/ayarlar`              | Ayarlar: profil, görünüm, hesap ve güvenlik                    |
| `/proje/:projeId`       | Proje sayfası; bkz. [Proje arayüzü](#proje-arayüzü)            |
| `/davetler`             | Gelen davetler                                                 |
| `/bildirimler`          | Bildirim listesi (mobilde zil buraya açılır)                   |
| `/health`               | Sağlık denetimi, `{ "ok": true }`                              |
| `/api/auth/*`           | Better Auth uçları (`/api/auth/ok`, `/api/auth/get-session` …) |
| `/api/notlar/:id/canli` | Not odası WebSocket'i; bkz. [Gerçek zamanlı](#gerçek-zamanlı)  |
| `/api/kanal/*`          | Proje / kişisel alan yayın kanalı (WebSocket)                  |

## Betikler

| Komut                           | İş                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`                   | Geliştirme sunucusu                                                                 |
| `npm run build`                 | Üretim derlemesi (`build/client`, `build/server`)                                   |
| `npm run preview`               | Derleyip üretim çıktısını yerelde önizler                                           |
| `npm run typecheck`             | `wrangler types` + `react-router typegen` + `tsc -b`                                |
| `npm run lint`                  | ESLint (typescript-eslint, react-hooks, jsx-a11y) + Prettier denetimi               |
| `npm run format`                | Prettier ile biçimlendirir                                                          |
| `npm run db:*`                  | Veritabanı betikleri; bkz. [Veritabanı ve migration](#veritabanı-ve-migration)      |
| `npm run test*`, `npm run e2e*` | Testler; bkz. [Testler](#testler)                                                   |
| `npm run lighthouse`            | Lighthouse denetimi (erişilebilirlik ≥ 95); bkz. [PWA](#pwa-çevrimdışı-ve-güvenlik) |

## Yapı

```
app/
  app.css                 Tailwind v4 + tasarım belirteçleri (--bg, --accent, --n-*, --p-* …)
  root.tsx                <html lang="tr">, FOUC önleyici tema betiği, Toaster, ErrorBoundary
  routes.ts               Rota tablosu
  routes/
    home.tsx              /        Notlarım
    giris.tsx             /giris   Giriş ekranı
    health.ts             /health  JSON sağlık denetimi
    not-found.tsx         *        404
  components/
    logo.tsx              LogoMark (2×2 ızgara) + Logo (kelime işaretiyle)
    rising-grid.tsx       Giriş ekranı "Yükselen ızgara" arka planı
    theme-toggle.tsx      Tema seçici (Açık / Koyu / Sistem)
    avatar.tsx            Baş harfli avatar
    not-found.tsx         404 görünümü
    shell/                app-shell, sidebar, topbar, account-menu, view-switch, types
    ui/                   shadcn/ui bileşenleri (CLI ile eklenir: npx shadcn add …)
  hooks/                  use-media-query
  components/realtime/    Canlı istemci: LiveSocket, not odası sağlayıcısı, useLiveNote, useLiveChannel
  domain/realtime/        Protokol, Yjs ↔ HTML, varlık, yeniden bağlanma, ızgara olayları (saf)
  db/
    schema.ts             Drizzle şeması (PLAN §6 veri modeli)
    client.ts             createDb(env.DB)
    seed.ts               seedDatabase / clearSeed (veri tests/fixtures'tan)
  lib/
    auth.server.ts        Better Auth yapılandırması, getAuth(env)
    auth-client.ts        Tarayıcı istemcisi (signIn, signUp, signOut, useSession)
    session.server.ts     getSession / requireUser
    context.ts            cloudflareContext, getCloudflare(context) → { env, ctx }
    shell.server.ts       Kök loader'ın kabuk verisi (kullanıcı, projeler, sayaçlar)
    shell.ts              useShellData(), emptyShell
    email.server.ts       E-posta (şimdilik konsola yazar)
    theme.ts, nav-state.ts, utils.ts
workers/
  app.ts                  Worker giriş noktası: canlı yollar, React Router, scheduled
  live-routes.ts          Canlı WebSocket yollarının yetki denetimi ve odaya yönlendirme
  note-room.ts            NoteRoom Durable Object (Yjs, varlık, görev sırası, D1 kopyası)
  project-room.ts         ProjectRoom Durable Object (proje / kişisel alan yayın kanalı)
  scheduled.ts            Dakikalık cron işleri (hatırlatıcı + bildirim dağıtımı, temizlik)
migrations/               drizzle-kit ile üretilen D1 SQL migration'ları
scripts/
  seed.ts                 Yerel D1 tohumlama (npm run db:seed)
  ws-smoke.ts             NoteRoom WebSocket duman testi
public/
  fonts/                  Onest (self-host, latin + latin-ext)
  icons/                  PWA simgeleri (SVG kaynakları + PNG)
  favicon.svg, apple-touch-icon.png, manifest.webmanifest
tests/
  unit/                   Birim + bileşen testleri (Vitest, jsdom)
  workers/                Worker / API testleri (Vitest, workerd)
  e2e/                    Uçtan uca testler (Playwright)
  fixtures/               Test hesapları ve örnek veri (tohum betiği de kullanır)
  helpers/                Test yardımcıları (matchMedia sahtesi …)
.github/workflows/        CI ve dağıtım
docs/                     Plan ve tasarım
wrangler.jsonc            Worker yapılandırması
```

## Tasarım sistemi

- Belirteçler `app/app.css` içinde CSS değişkenleri olarak tanımlıdır (açık + koyu). shadcn
  değişkenleri (`--background`, `--primary`, `--border` …) bunlara bağlıdır.
- Tailwind sınıfları: `bg-bg`, `bg-surface`, `text-fg`, `text-muted-foreground`, `border-line`,
  `bg-hover`, `bg-primary` / `text-primary` (vurgu), `bg-primary-soft`, `text-danger`,
  `bg-note-sari`, `bg-project-mavi`, `shadow-elevated` …
- Tema: `<html data-theme="light|dark">`; tercih localStorage'da (`sukano:tema`), `system`
  varsayılan. Bkz. `app/lib/theme.ts`.
- Yeni shadcn bileşeni: `npx shadcn@latest add <ad>`.

## Veritabanı ve migration

Cloudflare D1 (SQLite) + Drizzle ORM. Şema `app/db/schema.ts`; migration'lar `migrations/`
altında SQL olarak tutulur ve Wrangler ile uygulanır.

| Komut                       | İş                                                                           |
| --------------------------- | ---------------------------------------------------------------------------- |
| `npm run db:generate`       | Şema değişikliğinden yeni migration üretir (`drizzle-kit generate`)          |
| `npm run db:migrate:local`  | Migration'ları yerel D1'e uygular (`.wrangler/state/v3/d1`)                  |
| `npm run db:migrate:remote` | Migration'ları uzak (üretim) D1'e uygular                                    |
| `npm run db:seed`           | Yerel D1'e test hesaplarını ve örnek veriyi yükler (tekrar çalıştırılabilir) |
| `npm run db:reset:local`    | Yerel D1'i silip migration + tohum uygular (önce `npm run dev`'i durdur)     |

İlk kurulum:

```sh
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run db:seed
npm run dev
```

**Tohum verisi.** `tests/fixtures/hesaplar.ts` ve `tests/fixtures/ornek-veri.ts` dosyalarından
gelir: 5 test hesabı (`<ad>@test.sukano`, ortak şifre `Test1234!`, e-postalar doğrulanmış),
"Web Sitesi Yenileme" projesi ve üyeleri, "Lansman hazırlığı" notu, kişisel notlar. Seçenekler:
`npm run db:seed -- --sifirla` (varsayılan: önceki tohum kayıtlarını silip yükler), `--ekle`
(silmeden), `--temizle` (yalnızca tohum kayıtlarını siler); tohum dışı kayıtlara dokunulmaz.
Kimlikler kararlıdır: kullanıcı `user-<anahtar>`, proje ve not kimlikleri fikstürdeki `id`,
görevler `<notId>-g<sıra>[-<sıra>…]` (ör. `lansman-hazirligi-g2-1`). Workers testlerinde:
`await seedDatabase(env.DB, { hesaplar, projeler: ornekProjeler, kisiselAlanlar: ornekKisiselAlanlar })`.

**Kurallar.**

- Kimlikler metin (UUID); zaman damgaları milisaniye tamsayı (`Date`); görev tarihleri
  `YYYY-MM-DD`, saat `HH:MM` metin; sıralar (`position`) kesirli sayı.
- Enum değerleri (renk, rol, tür, durum) sütunlarda `CHECK` ile korunur; listeler `schema.ts`
  içinde dışa aktarılır (`PROJECT_COLORS`, `NOTE_COLORS`, `PROJECT_ROLES` …).
- Not ya kişiseldir (`owner_user_id`) ya da projeye aittir (`project_id`); ikisi birden olamaz.
- Better Auth tabloları (`user`, `session`, `account`, `verification`) Better Auth CLI'nin
  sqlite çıktısıyla aynı alanları kullanır; tek ek alan `user.avatar_color`.
- Şema değişince: `npm run db:generate` → oluşan SQL'i gözden geçir → commit'le →
  `npm run db:migrate:local`. Uygulanmış migration dosyaları düzenlenmez.

Yerel veriyi incelemek için: `npx wrangler d1 execute sukano --local --command "select …"`.

## Dağıtım ve gizli değişkenler

Gizli değerler depoya yazılmaz: yerelde `.dev.vars` (git'e girmez; şablon `.dev.vars.example`),
üretimde `npx wrangler secret put <AD>`. Adlar `wrangler.jsonc` → `secrets.required` içinde
listelidir; `Env` tipi (`npm run cf-typegen` → `worker-configuration.d.ts`) bunlardan üretilir,
`npm run dev` eksik olanlar için uyarır.

| Gizli değişken         | Açıklama                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`   | Oturum imzalama anahtarı, ≥ 32 karakter (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL`      | Uygulamanın kök adresi (yerelde `http://localhost:5173`)            |
| `GOOGLE_CLIENT_ID`     | Google OAuth istemci kimliği (boşsa Google girişi kapalı)           |
| `GOOGLE_CLIENT_SECRET` | Google OAuth istemci gizli anahtarı                                 |
| `RESEND_API_KEY`       | E-posta gönderimi (Resend); boşsa e-postalar konsola yazılır        |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile gizli anahtarı (yerelde test anahtarı)         |
| `VAPID_PUBLIC_KEY`     | Web Push genel anahtarı (`npx web-push generate-vapid-keys`)        |
| `VAPID_PRIVATE_KEY`    | Web Push özel anahtarı; ikisi boşsa push kapalı                     |

Gizli olmayan değerler `wrangler.jsonc` → `vars`: `APP_NAME`, `EMAIL_FROM`, `TURNSTILE_SITE_KEY`,
`VAPID_SUBJECT` (Web Push iletişim adresi, varsayılan `mailto:bildirim@sukano.app`).
`.dev.vars.example`'daki VAPID çifti yalnızca yerel geliştirme ve testler içindir (herkese açık);
üretimde yeni çift üretilmelidir.

Binding'ler: `DB` (D1 `sukano`), `FILES` (R2 `sukano-files`), `NOTE_ROOM` (Durable Object
`NoteRoom`), `PROJECT_ROOM` (Durable Object `ProjectRoom`), cron `* * * * *`
(`workers/scheduled.ts`). Loader/action içinde
`getCloudflare(context).env` ile erişilir. Yerelde cron'u elle tetiklemek için:
`curl "http://localhost:5173/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"`. NoteRoom duman testi:
`npm run dev` açıkken `npx tsx scripts/ws-smoke.ts`.

Elle dağıtım (CI iş akışı dışında):

```sh
npm run db:migrate:remote
npm run build
npx wrangler deploy
```

## Kimlik doğrulama

Better Auth (`app/lib/auth.server.ts`), e-posta + şifre (doğrulama zorunlu) ve Google
(`GOOGLE_CLIENT_ID` ve `GOOGLE_CLIENT_SECRET` tanımlıysa; düğme de yalnızca o zaman görünür).
Oturum 30 gün. Sayfalar Better Auth'u sunucu tarafında (action/loader içinde `auth.api.*`)
çağırır; formlar JavaScript olmadan da çalışır, hatalar Türkçedir.

| Yol                      | İş                                                                              |
| ------------------------ | ------------------------------------------------------------------------------- |
| `/giris`                 | Giriş (`?next=` korunur; doğrulanmamış hesap `/dogrula`'ya gider)               |
| `/kayit`                 | Kayıt: ad, e-posta, şifre (≥ 8), görünmez Turnstile                             |
| `/dogrula?eposta=`       | "E-postanı doğrula" ekranı; 60 sn beklemeli "Bağlantıyı tekrar gönder"          |
| `/dogrula/:jeton`        | E-postadaki bağlantı: doğrular, oturum açar, `next`'e (yoksa `/`) gider         |
| `/sifremi-unuttum`       | Sıfırlama bağlantısı ister (Turnstile); hesap varlığını sızdırmaz               |
| `/sifre-sifirla?token=`  | Yeni şifre ×2; kaydedince diğer oturumlar kapanır ve oturum açılır              |
| `POST /cikis`            | Çıkış; `/giris`'e döner                                                         |
| `/ayarlar`               | Ad, tema (`user_preferences`'a da yazılır), e-posta/şifre değiştirme, oturumlar |
| `GET /__test/outbox?to=` | Yalnızca geliştirme/test: yerel posta kutusu (aşağıya bakın)                    |

**Koruma.** `app/root.tsx` middleware'i varsayılan olarak kapalıdır: kimlik sayfaları, `/cikis`,
`/health`, `/api/auth/*` ve `/__test/*` dışındaki **her** yol oturum ister; oturumsuz istek
`/giris?next=<yol>` adresine gider (`next` yalnızca site içi yol olabilir,
`app/domain/auth/redirects.ts`). Yeni rotalar ek bir şey yapmadan korunur. Loader/action içinde
kullanıcıya tipli erişim: `const { user } = await requireUser(request, context)`
(`app/lib/session.server.ts`; aynı istekte oturum D1'den bir kez okunur). Kimlik sayfaları
(`routes/_kimlik.tsx` kabuksuz düzeni) oturum varsa `/`'a yönlendirir. Kök loader kabuksuz
sayfalarda kabuk verisi göndermez.

**Hız sınırı.** Cloudflare **Workers Rate Limiting** binding'leri (`wrangler.jsonc` →
`ratelimits`): `AUTH_IP_LIMITER` IP başına dakikada 20, `AUTH_EMAIL_LIMITER` e-posta başına
dakikada 5 istek; giriş, kayıt, şifre sıfırlama isteği ve doğrulama e-postası için ayrı sayılır
(anahtarlar `app/domain/auth/rate-limit.ts`). Denetim Better Auth `hooks.before` içinde
(`app/lib/auth-policy.server.ts`) olduğu için doğrudan `/api/auth/*` istekleri de kapsanır. Aşıldığında
429 ve "Çok fazla deneme yaptın. Lütfen bir dakika sonra tekrar dene." Better Auth'un yerleşik
sınırlayıcısı kapalıdır (isolate belleğinde sayar; Workers'ta güvenilmez). Yerelde ve testlerde
Miniflare aynı binding'leri bellekte taklit eder. Sayaçlar yaklaşık ve konum başınadır; kesin
kota değil, kötüye kullanıma karşı fren olarak düşünülmeli.

**Turnstile.** Kayıt ve şifremi unuttum formlarında görünmez widget (`appearance:
interaction-only`; site anahtarı `vars.TURNSTILE_SITE_KEY`), form altında "Bu form Cloudflare
Turnstile ile korunur." satırı. Jeton `x-captcha-response` başlığıyla Better Auth'a gider ve
sunucuda `TURNSTILE_SECRET_KEY` ile doğrulanır; boş jeton her zaman reddedilir. Varsayılanlar
Cloudflare'in test anahtarlarıdır (site `1x00000000000000000000AA`, gizli
`1x0000000000000000000000000000000AA`); test gizli anahtarlarının sonucu sabit olduğundan sunucu
bunlar için siteverify'a gitmez (yerel, CI ve testler dış ağa bağımlı değil).

**E-posta.** `app/lib/email.server.ts`: `RESEND_API_KEY` varsa Resend HTTP API'si, gönderen
`vars.EMAIL_FROM`. Yoksa ileti konsola yazılır ve aynı isolate'teki `globalThis.__sukanoOutbox`
dizisine eklenir. Şablonlar (doğrulama, şifre sıfırlama, e-posta değişikliği; HTML + düz metin):
`app/lib/email-templates.ts`. `GET /__test/outbox?to=<adres>` bu kutuyu JSON olarak döner; yalnızca
Resend anahtarı yokken **ve** geliştirme sunucusunda ya da `BETTER_AUTH_URL` yerel
(localhost/127.0.0.1) iken açıktır, üretim ve önizleme dağıtımlarında 404.

### Kimlik testleri

- **Birim (önce test):** `tests/unit/kimlik/` — şifre kuralı, e-posta normalizasyonu, güvenli
  `next`, herkese açık yollar, hız sınırı anahtarları, hata metinleri, Turnstile test anahtarları,
  form doğrulamaları, bağlantılar.
- **Bileşen:** `tests/unit/kimlik-formlar.test.tsx` — giriş/kayıt formu doğrulama mesajları,
  şifre göster/gizle.
- **Worker:** `tests/workers/kimlik.test.ts` — kayıt → outbox → doğrulama → giriş, yanlış şifre,
  doğrulanmamış giriş, sıfırlama, hız sınırı, Turnstile, rota koruması, Ayarlar eylemleri.
  Değerler `vitest.workers.config.ts`'te sabittir (`.dev.vars` gerekmez).
- **Uçtan uca:** `tests/e2e/kimlik.spec.ts` (`@duman`, üç görünüm). `tests/e2e/global-setup.ts`
  sunucu yoksa ayrı yerel durumu (`.wrangler/e2e`, `SUKANO_PERSIST_DIR`) silip migration + tohum
  uygular, **sonra** `vite preview`'u bu klasörle başlatır ve `ayse@test.sukano` ile giriş yapıp
  oturumu `tests/e2e/.auth/ayse.json`'a yazar. Testler varsayılan olarak bu oturumla koşar;
  oturumsuz testler `test.use({ storageState: OTURUMSUZ })` (`tests/e2e/ortam.ts`). Turnstile
  betiği testte sahte sürümle değiştirilir (`sahteTurnstile`), e-posta bağlantıları
  `/__test/outbox`'tan okunur (`epostaBaglantisi`). Uçtan uca testler `.dev.vars` ister (CI'da
  `.dev.vars.example`'dan kopyalanır).

## Kişisel notlar

Aşama 1'in not parçası: kişisel metin notları (proje notları Aşama 3'te).

| Yol                             | Açıklama                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                             | Notlarım: not al alanı, Sabitlenmiş + Diğerleri masonry ızgarası                                                                                                               |
| `/not/:id`, `/arsiv/not/:id`    | Açık not (ızgaranın üstünde modal, mobilde tam ekran); `?surumler` ile sürüm geçmişi açık                                                                                      |
| `/arsiv`, `/cop`                | Arşiv; çöp (7 gün, kalan gün, Geri yükle, Kalıcı olarak sil, Çöpü boşalt)                                                                                                      |
| `/ara?q=`                       | Türkçe harf ve aksan duyarsız arama (başlık, metin, görev başlıkları)                                                                                                          |
| `POST /api/notlar`              | Not eylemleri (`intent`: create, create-todo, update, convert, color, pin, archive, unarchive, trash, restore, delete, discard, empty-trash, duplicate, move, restore-version) |
| `GET /api/notlar/:id/surumler`  | Sürüm listesi; `?surum=<id>` ile önizleme                                                                                                                                      |
| `GET /api/notlar/:id/gorevler`  | Yapılacaklar notunun görevleri (`{ tasks, assignees }`, düz liste, ağaç sırasında)                                                                                             |
| `POST /api/notlar/:id/gorevler` | Toplu görev işlemleri (JSON `{ ops }`; tek batch, hepsi ya da hiçbiri; 400 / 404 / 409 / 415)                                                                                  |

- **Katmanlar:** saf kurallar `app/domain/notes/` (sıralama, sürüm penceresi, arama
  normalizasyonu, HTML→metin, doğrulama, iyimser arayüz); D1 sorguları
  `app/lib/notes.server.ts` (`personalNotes(env, userId)`, her işlemde sahiplik denetimi,
  başkasının notu → 404); arayüz `app/components/notes/`.
- **Sıralama:** `position` kesirli; taşınan not iki komşusunun ortasına yerleşir, boşluk
  1e-6'nın altına inerse bölüm yeniden numaralanır. Sürükleme `@dnd-kit` (fare 6 px, dokunma
  350 ms basılı tutma); klavyede odaklı kartta Alt+ok.
- **Sürümler:** aynı kişinin sürümün açılışından itibaren 5 dk içindeki düzenlemeleri aynı
  sürümü günceller; en çok 50 sürüm; geri yükleme her zaman yeni sürüm. Renk/sabitleme sürüm
  üretmez. Yapılacaklar notunda anlık görüntü görev ağacıdır (`TodoSnapshot`: düz liste +
  önizleme HTML'i); geri yükleme ağacı ve notun türünü geri getirir.
- **Yapılacaklar (Aşama 2, sunucu):** saf görev ağacı `app/domain/tasks/` (`tree.ts` ekle/böl,
  girinti, taşıma, sürükle-bırak, görünür satırlar; `completion.ts` zincirleme tamamlanma;
  `ops.ts` işlem biçimi, doğrulama, uygulama, fark; `dates.ts` doğal yazım ve aralık metni;
  `undo.ts` toast ve Ctrl+Z yığını; `convert.ts` metin ↔ yapılacaklar). D1 tarafı
  `app/lib/tasks.server.ts` (`personalTasks(env, userId)`): işlemler aynı saf kodla uygulanır,
  tamamlanma zinciri sunucuda yeniden hesaplanır, fark not güncellemesi ve sürümle tek batch'te
  yazılır. Eki olan metin notu yapılacaklara dönüştürülemez (409).
- **Kayıt:** açık notta 800 ms debounce'lu otomatik kayıt (canlı katmanda yalnızca başlık; metin
  gövdesi not odasıyla eşitlenir, bkz. [Gerçek zamanlı](#gerçek-zamanlı)); not al alanı kapatınca kaydeder,
  boşsa kaydetmez. Arşivle, çöpe at ve kopyasını oluştur "Geri al" toast'ı gösterir (6 sn).
- **Cron:** `purgeTrashedNotes` 7 günden eski çöp notlarını (kişisel ve proje) sürüm ve ekleriyle
  siler (`purgeExpiredTrash`).
- **Yapılacaklar (Aşama 2, arayüz):** `app/components/tasks/` — `TodoEditor` (satırlar
  `visibleRows`'tan; klavye akışı yalnızca editör içinde, katmanlı Esc, Ctrl+Z, Ctrl+/ kısayol
  kartı), `TaskRow`, `TaskDetail` akordeonu, `DatePicker`, not içi toast yığını, dokunmatik araç
  çubuğu ve mobil alttan açılan sayfalar, `@dnd-kit` sürükle-bırak (`drag.ts`). Görev işlemleri
  `task-sync.ts` kuyruğuyla sırayla gönderilir (aynı anda tek istek, ardışık güncellemeler
  birleşir, 409'da liste yeniden yüklenir); aç/kapa durumu `localStorage`'da
  (`sukano:gorevler:<notId>`). Karttan işaretleme `use-card-task-toggle.ts`.
- **Devre dışı yer tutucular:** taşı veya kopyala, kişi seçici (sunucusu Aşama 3a'da hazır, bkz.
  [Projeler](#projeler-roller-davetler)). Hatırlatıcılar: bkz.
  [Hatırlatıcılar ve bildirimler](#hatırlatıcılar-ve-bildirimler). Dosya ekleri: bkz. [Dosya ekleri](#dosya-ekleri).

## Projeler, roller, davetler

Aşama 3a: projelerin alan mantığı ve sunucusu (arayüz Aşama 3b). Kurallar PLAN §2 ve §4;
metinler tasarımdan (`Forms`, `Dialogs2`, `ProjectSettings`, `Invites`, `States2`).

**Katmanlar.**

- `app/domain/projects/` (saf, birim testli): `permissions.ts` — rol × eylem matrisi
  (`can(role, action)`; eylemler `PROJECT_ACTIONS`), son yönetici kuralları (`checkRoleChange`,
  `checkLeave`, `checkRemoveMember`), davet edilebilirlik (`checkInvite`: yetki → adres → hesap
  yok → doğrulanmamış → zaten üye → bekleyen davet), davet yanıtı (`checkRespond`,
  `invitationStatus`), hesap silme (`soleManagerProjects`, `checkAccountDeletion`), rol adları
  (`roleLabel`, `ROLE_DESCRIPTIONS`), Türkçe hata metinleri (`MESSAGES`). `lifecycle.ts` — 7 gün
  silinmiş proje (`purgeDaysLeft`, `purgeLabel`: "5 gün kaldı" / "yarın silinecek"), davet
  geçerlilik metni (`inviteExpiryLabel`), taşıma geri alma penceresi (`MOVE_UNDO_MS` 10 sn + 5 sn
  ağ payı, `canUndoMove`). `members.ts` — üye sırası (sen → rol → ad, `sortMembers`), kişiye özel
  proje sırası (`orderProjects`, `reorderIds`). `validation.ts` — form eylemlerinin doğrulanması.
- `app/lib/project-access.server.ts`: `memberRole` (üye değil ya da proje silinmiş → 404),
  hata sınıfları (`ProjectNotFoundError` 404, `ForbiddenError` 403, `ProjectRuleError` 409 +
  `code`, `InvitationNotFoundError` 404). `app/lib/api-errors.server.ts`: ortak eşleme
  (`apiError`, `loaderError`).
- Notlar alan bazında: `scopedNotes(env, userId, scope)` ve `scopedTasks(...)` aynı makineyi
  kişisel alanda (`{ kind: "personal" }`) ve projede (`{ kind: "project", projectId, role }`)
  çalıştırır; projede her işlem `can` ile denetlenir. `personalNotes` / `personalTasks` kişisel
  alanın kısayoludur. `app/lib/note-access.server.ts` → `noteAccess(env, userId)`: `forNote(id)`
  ve `forProject(id)` alanı çözer (üyelik + rol), `moveToProject`, `undoMove`, `copyTo`, `run`.
- `app/lib/projects.server.ts` → `projectsService(env, userId)`; `app/lib/invitations.server.ts`
  → `invitationsService(env, userId)`; `app/lib/account.server.ts` → hesap silme.

**Roller** (her istekte sunucuda denetlenir):

| Eylem                                                                   | Yönetici | Düzenleyici | Görüntüleyici |
| ----------------------------------------------------------------------- | :------: | :---------: | :-----------: |
| Notları okuma, arama, sürüm geçmişi, üye listesi                        |    ✓     |      ✓      |       ✓       |
| Not oluşturma, düzenleme, sabitleme, renk, sıra, arşiv, çöp, kalıcı sil |    ✓     |      ✓      |       —       |
| Görev işaretleme, atama, sürüm geri yükleme, Kopyala…, projeye taşıma   |    ✓     |      ✓      |       —       |
| Ayarlar, davet, rol verme, üye çıkarma, proje silme / geri getirme      |    ✓     |      —      |       —       |

Üye olmayan için proje ve notları yoktur (404). Son yönetici kendini indiremez ve ayrılamaz
(409 `son_yonetici`) ama projeyi silebilir. Görüntüleyiciye görev atanabilir, işaretleyemez.

**Uçlar.** Tümü oturum ister; form eylemleri `intent` alanıyla seçilir (diziler JSON metni).
Hata gövdesi `{ ok: false, error, code? }` (`error` arayüzde aynen gösterilecek Türkçe metin).

| Uç                              | İş                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/projeler`             | Sol menü: `{ projects: SidebarProject[], deletedCount }`                                                                              |
| `GET /api/projeler?silinmis=1`  | `{ deleted: DeletedProject[] }` (yalnızca yönetici olunan silinmiş projeler)                                                          |
| `POST /api/projeler`            | `create` (`name`, `color?`, `description?`, `emoji?`, `id?` UUID) → `{ ok, id }`                                                      |
|                                 | `reorder` (`order`: JSON proje kimlikleri) → `{ ok }`                                                                                 |
| `GET /api/projeler/:id`         | `ProjectPageData` (`?gorunum=notlar\|arsiv\|cop`); `?ayarlar=1` → `ProjectSettingsData`                                               |
| `POST /api/projeler/:id`        | `update` (`name?`, `color?`, `description?`, `emoji?`), `delete`, `restore`, `leave`                                                  |
|                                 | `invite` (`email`, `role` = düzenleyici) → `{ ok, invitationId }`                                                                     |
|                                 | `revoke-invite` (`invitationId`), `set-role` (`userId`, `role`), `remove-member` (`userId`)                                           |
| `GET /api/projeler/:id/uyeler`  | `{ members: ProjectMember[] }` (kişi seçici; sen önce)                                                                                |
| `GET /api/davetler`             | `{ pending: IncomingInvite[], history: IncomingInvite[] }`                                                                            |
| `POST /api/davetler`            | `accept` (`id`) → `{ ok, projectId }`; `decline` (`id`)                                                                               |
| `POST /api/notlar`              | Proje notu için: `create` / `create-todo` / `empty-trash` + `projectId`; diğer eylemlerde alan nottan çözülür                         |
|                                 | `move-to-project` (`id`, `projectId`), `undo-move` (`id`), `copy-to` (`id`, `newId`, `projectId?`; yoksa kişisel alan) → `{ ok, id }` |
| `POST /api/notlar/:id/gorevler` | Proje notunda ayrıca `{ op: "assign", id, userIds }` (tam liste); yanıt `{ ok, tasks, assignees }`                                    |
| `POST /ayarlar`                 | `delete-account` (`email`: onay için yazılan adres) → `/giris?durum=hesap-silindi`                                                    |

Kural kodları (`code`): `son_yonetici`, `kendini_cikaramaz`, `uye_yok`, `hesap_yok`,
`dogrulanmamis`, `zaten_uye`, `bekleyen_davet`, `gecersiz_eposta`, `suresi_doldu`,
`gecersiz_davet`, `tek_yonetici`, `eposta_uyusmuyor`. Yetki eksikliği her zaman 403'tür.

**Loader işlevleri** (3b sayfaları için; tipler `projects.server.ts` / `invitations.server.ts`):
`projectsService(env, user.id).page(projectId, view)` (proje, `myRole`, `permissions`
{ canWrite, canManage }, üyeler, notlar), `.settings(projectId)` (üyeler, `managerCount`,
`isLastManager`, yöneticiye bekleyen davetler), `.members(projectId)`, `.sidebar()`, `.deleted()`;
`invitationsService(env, user.id).list()`; proje notu ayrıntısı
`(await noteAccess(env, user.id).forNote(noteId)).notes.get(noteId)` (`createdBy` / `updatedBy`
null ise "Silinmiş kullanıcı", `assignees`); birleşik arama `searchAccessible(env, user.id, q)`
(her sonuçta `source`); hesap silme engeli `accountDeletionBlockers` (Ayarlar loader'ında
`deletionBlockers`). Kabuk verisinde `projects[].role`, `projects[].emoji` ve
`deletedProjectCount` vardır.

**Davetler.** Yalnızca yönetici, kayıtlı ve e-postası doğrulanmış hesaba, tam adresle. Davet
uygulama içi bildirim (`notifications`, tür `davet`) ve e-posta (`invitationEmail`, bağlantı
`/davetler`) olarak gider; 14 gün geçerli; yönetici geri çekebilir; süresi geçmiş bekleyen
davetin yerine yenisi gönderilebilir. Kabulde davetteki rolle üye olunur.

**Taşıma ve kopyalama.** Kişisel not projeye taşınır (hedefte düzenleyici ve üstü): kişisel
alandan kalkar, projenin en üstüne eklenir, arşivden çıkar; geri alma bilgisi
`notes.move_origin`'de (migration `0001`) tutulur ve yalnızca taşıyan 10 sn içinde geri alabilir
(sonra 409). Proje notu taşınamaz, yalnızca kopyalanır (`copy-to`; kaynakta düzenleyici ve üstü).
Kopya hedefte en üste, sabitlenmemiş oluşur; görev ağacı kopyalanır, sürüm geçmişi kopyalanmaz;
atamalar yalnızca hedef projenin üyelerine kopyalanır (kişisel alanda atama yok).

**Üyelik değişiklikleri.** Rol değişince (`rol_degisti`) ve çıkarılınca (`projeden_cikarildi`)
kişiye bildirim gider. Ayrılan/çıkarılan kişinin projedeki görev atamaları kaldırılır; notlar
ve oluşturan/son düzenleyen bilgisi kalır.

**Proje silme.** Yönetici siler; proje 7 gün "silinmiş" bekler, üyelere `proje_silindi`
bildirimi gider, kimse erişemez; yöneticiler "Projeyi geri getir" ile döndürebilir. Cron
(`purgeDeletedProjects`) süre dolunca notları (R2 ekleri dahil), görevleri, sürümleri,
üyelikleri ve davetleri kalıcı siler; `expireInvitations` süresi dolan davetleri işaretler.

**Hesap silme.** Tek yönetici olunan (silinmemiş) proje varsa engellenir (`tek_yonetici`, proje
adlarıyla). Onay için e-posta adresi yazılır. Kişisel notlar ekleri ve sürümleriyle silinir;
proje notları kalır, oluşturan/son düzenleyen `null` olur ("Silinmiş kullanıcı"); üyelikler,
atamalar, oturumlar zincirleme silinir, adrese bekleyen davetler geri çekilir.

**Testler.** Birim: `tests/unit/projects/` (yetki matrisi, son yönetici, davet edilebilirlik,
süreler, sıralar, doğrulama). Worker: `tests/workers/projeler.test.ts`,
`davetler.test.ts`, `proje-notlari.test.ts` (her not eyleminde ve görev işleminde yönetici /
düzenleyici / görüntüleyici / üye olmayan matrisi, taşıma + geri alma, kopyalama, atama),
`hesap-silme.test.ts`. Yardımcılar `tests/workers/proje-yardimcilar.ts` (tohum hesabıyla giriş:
`loginAs("can")`).

**Tohum verisi.** Web Sitesi Yenileme (5 üye, üç rol), Ev Taşınma ve Kitap Kulübü (Süleyman
tek yönetici; Ayşe'nin Kitap Kulübü'ne bekleyen daveti), Fotoğraf Arşivi (Ayşe ve Zeynep
yönetici; Süleyman'ın bekleyen daveti), silinmiş Bütçe 2026 (Ayşe 2 gün önce sildi).

## Proje arayüzü

Aşama 3b-1: proje düzeyindeki ekranlar (tasarım: `Project`, `ProjectSettings`, `Dialogs`,
`Dialogs2`, `Invites`, `States2`, `Forms`, `Settings` ve `T*` / `M*` karşılıkları).

| Yol                               | Açıklama                                                                    |
| --------------------------------- | --------------------------------------------------------------------------- |
| `/proje/:projeId`                 | Proje sayfası: başlık, üyeler, "Projeye not ekle…", sabitlenmiş + diğer     |
| `/proje/:projeId/arsiv`, `/…/cop` | Projenin arşivi ve çöpü (7 gün; Çöpü boşalt yalnızca bu projeyi boşaltır)   |
| `/proje/:projeId(/arsiv)/not/:id` | Açık proje notu (alt rota, `routes/not.tsx`; bkz. Proje notları arayüzü)    |
| `/proje/:projeId/ayarlar`         | Genel (ad, simge, renk, açıklama), üyeler ve roller, davet, tehlikeli bölge |
| `/davetler`                       | Bekleyen davetler (Kabul et / Reddet; kabulde proje açılır) ve geçmiş       |
| `/silinmis-projeler`              | Yönetici olunan silinmiş projeler, kalan gün, "Projeyi geri getir"          |

- **Bileşenler:** `app/components/projects/` (başlık, yeni proje diyaloğu, renk ve rol seçici,
  davet formu, üye listesi, bekleyen davetler, ayrılma / silme / davet diyalogları, silinmiş proje
  satırı), `app/components/invites/invite-card.tsx`, `app/components/settings/delete-account-dialog.tsx`.
  Eylemler `/api/projeler*` ve `/api/davetler`'e gider; sayfada kalınan eylemler fetcher ile
  (`useProjectAction`), sayfayı terk ettirenler (ayrıl, sil, geri getir, davet yanıtı) doğrudan
  istekle, sonra gezinme ve kabuğun yeniden yüklenmesiyle (`useProjectRequest`).
- **Görüntüleyici:** not ekleme alanı, kart eylemleri, sürükleme ve Çöp sekmesi yok; kartlarda
  görevler madde işaretli (`NoteCard readOnly`); başlıkta kilitli "Görüntüleyici" çipi ve
  "Okur ve arar; not ekleyemez, görev işaretleyemez." satırı.
- **Davet formu:** hata metni sunucudan (`MESSAGES`) aynen; `hesap_yok` ve `gecersiz_eposta`
  alanın altında kırmızı, `dogrulanmamis` sarı uyarı, `zaten_uye` ve `bekleyen_davet` gri bilgi.
- **Son yönetici:** ayrılma diyaloğunda uyarı, "Proje ayarlarına git" ve devre dışı onay; rol
  indirme reddi toast olur, seçici eski role döner.
- **Sol menü:** proje simgesi (emoji) ya da renkli nokta (rayda baş harf), görüntüleyicide kilit;
  sıra fareyle sürükleyerek, dokunmatikte basılı tutarak ya da Alt+↑/↓ ile değişir (`reorder`,
  iyimser); "Yeni proje" diyaloğu; yönetici olunan silinmiş proje varsa "Silinmiş projeler (n)".
- **Hesap silme** (Ayarlar → Hesabı sil): e-posta adresi yazılınca etkinleşen onay; tek yönetici
  olunan projeler bağlantılarıyla listelenir ve silme kapalıdır.
- **Testler:** bileşen `tests/unit/projects/arayuz.test.tsx` (rol seçici, çıkarma onayı, davet
  formu hataları, yeni proje, hesap silme, ayrılma, sol menü sırası); uçtan uca
  `tests/e2e/projeler.spec.ts` (iki hesap: oluştur → davet et → kabul → görüntüleyici yap →
  kısıtlar → ayrıl → sil → geri getir) ve `erisilebilirlik.spec.ts`'de proje sayfası, ayarlar,
  davetler, silinmiş projeler (açık ve koyu).

## Proje notları arayüzü

Aşama 3b-2: notun içindeki proje arayüzü (proje sayfası, ayarlar ve davetler Aşama 3b-1).

- **Açık not** (`app/routes/not.tsx`): kişisel ve proje notunu `noteAccess.forNote` ile yükler;
  rol, üyeler ve "Taşı veya kopyala…" hedefleri (üyesi olunan projeler, rolüyle) birlikte gelir.
  Aynı rota `/not/:id`, `/arsiv/not/:id`, `/proje/:projeId(/arsiv)/not/:id` ve `/ara/not/:id`
  altında açılır; kapanınca yoldaki `/not/:id` atılır (`note-links.ts` → `closeHref`).
- **Yazar satırı:** proje notunda "Ayşe Demir oluşturdu · Son düzenleyen Mehmet Kaya, 2 saat
  önce" (`app/domain/notes/authorship.ts`; silinmiş kişi "Silinmiş kullanıcı").
- **Açık not (tasarım v2.1):** sağ üstte Sabitle · Arşivle (✕ yok; kapanış dışarı tıklama, Esc ya
  da "Kapat"). Alt çubuk: Renk · Hatırlatıcı · Dosya eki · Aa (biçimlendirme, varsayılan gizli) ·
  ⋯ … Düzenlendi … Kapat; yapılacaklar notunda Renk · Hatırlatıcı · ⋯. ⋯ menüsü yukarı açılır:
  [görev komutları] · Taşı veya kopyala… / Kopyala… · Kopyasını oluştur · Sürüm geçmişi ·
  Dönüştür · Klavye kısayolları (yapılacaklar, klavyeli cihaz) · ─ · Sil (kırmızı, onaysız çöpe
  atar, Geri al toast'ı). Kartta da çöp düğmesi yok, Sil ⋯ menüsünün sonunda. Mobil metin notu:
  üstte Geri · Sabitle · Arşivle, altta Renk · Hatırlatıcı · Dosya eki · Aa · ⋯; mobil
  yapılacaklar notu: üstte Geri · Sabitle · Arşivle · Hatırlatıcı · ⋯. İkon düğmesi ölçüleri tek
  yerde: `app/app.css` `--ib*` belirteçleri ve `.ib` / `.ib-card` / `.ib-tb`.
- **Kart önizlemesi:** `htmlToPreviewHtml` (`app/domain/notes/html.ts`) gövdeyi beyaz listeyle
  güvenli, kısaltılmış HTML'e çevirir (kalın, italik, üstü çizili, başlık, madde/numaralı liste,
  boş satır, bağlantı gezinmeyen `span`); kart en çok 10 satır gösterir (`.card-preview`). Arama
  düz metinle (`body_text`) kalır.
- **Görüntüleyici:** kilitli "Görüntüleyici" rozeti, "Salt okunur." notu; başlık ve gövde salt
  okunur, görevlerde kutucuk yerine madde işareti, araç simgeleri yok; menü yerine yalnızca
  Sürüm geçmişi (geri yükleme kapalı) ve Kapat.
- **Taşı / kopyala** (`app/components/notes/move-copy.tsx`): kişisel notta "Taşı veya kopyala…"
  (Taşı / Kopyala sekmeleri; taşıma sonrası 6 sn "Geri al" toast'ı `undo-move` gönderir; sunucu
  penceresi 10 sn),
  proje notunda "Kopyala…" (Kişisel alanım ya da başka proje). Görüntüleyici olunan projeler
  seçilemez. Mobilde alttan açılan sayfa. Kanonik menü sırasında (⋯ ve mobil not sayfası).
- **Kişi seçici** (`app/components/tasks/person-picker.tsx`, yalnızca proje notunda):
  Ctrl+Shift+A, satırdaki kişi simgesi, ayrıntıdaki kişi çipi, dokunmatik araç çubuğu ve mobil
  kişi sayfası. ↑ / ↓ / Home / End gezinir, Enter ya da Boşluk seçer veya kaldırır, Esc katmanlı
  kapatır ve odak satıra döner. Birden fazla kişi; sıra sen → rol → ad; görüntüleyiciler soluk
  ("görüntüleyici · işaretleyemez"). Atama `{ op: "assign" }` olarak görev kuyruğundan gider;
  yanıttaki `assignees` kuyruktaki atamalar yeniden uygulanarak gösterilir. Satırda ve proje
  kartında atanan avatarları (kart verisinde `CardTask.assignees`).
- **Birleşik arama** (`app/routes/ara.tsx`): `searchAccessible`; kaynak süzgeci
  (`?kaynak=notlarim` ya da proje kimliği), kaynağa göre bölümler, proje rengi ve adıyla kaynak
  etiketi; sonuç aramanın üstünde açılır.
- **Testler:** bileşen `tests/unit/tasks/kisi-secici.test.tsx`,
  `tests/unit/notes/tasi-kopyala.test.tsx`, `tests/unit/notes/goruntuleyici.test.tsx`; uçtan uca
  `tests/e2e/proje-notlari.spec.ts` (taşı + Geri al, kopyala, klavyeyle ve mobil sayfayla atama,
  görüntüleyici, arama, yazar satırı, axe). Uçtan uca testler ayrı bir yerel durumla da koşabilir:
  `E2E_PORT`, `E2E_PERSIST_DIR`, `E2E_OTURUM_AYSE`.

## Gerçek zamanlı

Aşama 4a: sunucu katmanı, protokol ve istemci eşitleme kitaplığı; Aşama 4b: canlı arayüz
(varlık, imleç, çevrimdışı, uzaktan yıkıcı olaylar, ızgara hareketi) ve iki tarayıcı matrisi.
PLAN §5 ve §6: not başına bir Durable Object, proje başına bir yayın kanalı.

### Durable Object'ler

| Sınıf         | Ad (binding)                                           | İş                                                         |
| ------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| `NoteRoom`    | not kimliği (`NOTE_ROOM`)                              | Yjs ortak düzenleme, varlık, görev işlemlerinin tek sırası |
| `ProjectRoom` | `proje:<projectId>` / `kisi:<userId>` (`PROJECT_ROOM`) | Canlı ızgara olayları (yalnızca sunucu → istemci)          |

İkisi de WebSocket Hibernation API'siyle çalışır (`ctx.acceptWebSocket`; bağlantı bilgisi ekte,
etiket kullanıcı kimliği; boşta bağlantı odayı uyanık tutmaz; `{"t":"ping"}` uyandırmadan
`pong` ile yanıtlanır). Durum DO SQLite deposundadır: tahliye ve uykudan sonra oradan kurulur.

### Bağlantı ve yetki (`workers/live-routes.ts`)

| Yol                         | Yetki                                    | Hata                                          |
| --------------------------- | ---------------------------------------- | --------------------------------------------- |
| `GET /api/notlar/:id/canli` | notun sahibi ya da proje üyesi (her rol) | 401 oturum yok, 404 not yok / üye değil / çöp |
| `GET /api/kanal/proje/:id`  | proje üyesi (her rol)                    | 401, 404                                      |
| `GET /api/kanal/kisisel`    | oturumdaki kişi                          | 401                                           |

Ortak: WebSocket değilse 426, başka kökenden (Origin) 403. Yetki React Router'dan önce
Worker'da denetlenir; odaya kişi, not ve salt okunurluk güvenilir başlıklarla gider.
Görüntüleyici bağlanır, güncellemeleri alır; gönderdiği Yjs düzenlemeleri uygulanmaz ve
yayınlanmaz (bir kez `hata: salt_okunur`). Rol, bağlantı açıkken en çok 30 sn'de bir
düzenleme gelince D1'den yeniden denetlenir (düşürüldüyse `rol`, erişim kalktıysa 4404).

### Protokol (`app/domain/realtime/protocol.ts`)

**Not odası.** İkili çerçeveler y-protocols'tür (y-websocket ile aynı): `varUint tür` + yük;
`0` eşitleme (adım 1 / adım 2 / güncelleme), `1` farkındalık, `3` farkındalık sorgusu.
Metin çerçeveleri JSON:

| Yön   | İleti                                                         | Anlamı                                                  |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------- |
| S → İ | `{t:"hosgeldin", docId, kind, readOnly, user, seq}`           | İlk ileti; ardından (metin notunda) sunucu adım 1       |
| S → İ | `{t:"gorevler", seq, tasks, assignees, by}`                   | Görev yazımının yetkili sonucu (tek sıra numarası)      |
| S → İ | `{t:"not", by, title?, color?, pinned?, archived?, trashed?}` | HTTP ile değişen alanlar                                |
| S → İ | `{t:"kaydedildi", at}`                                        | D1 kopyası yazıldı                                      |
| S → İ | `{t:"sifirla"}` + kapanış 4009                                | Belge D1'den yeniden kurulacak (istemci belgesini atar) |
| S → İ | `{t:"rol", readOnly}`, `{t:"hata", code, message}`            | Rol değişti; düzenleme reddedildi                       |
| İ → S | `{t:"kaydet"}`                                                | Bekleyeni hemen D1'e yaz (not kapanırken)               |

Farkındalık durumu `{ user: {id, name, color, avatarUrl}, focus: {taskId} | null, cursor? }`;
sunucu `user` alanını her zaman oturumdaki kişiyle değiştirir (başkası adına görünülemez).
Kapanış kodları: 4000 yeniden bağlan, 4009 sıfırlandı (hemen yeniden bağlan, yeni belge),
4404 erişim yok (yeniden denenmez).

**Kanal.** `{t:"hosgeldin", seq}` ve `{t:"olay", seq, event}`; olay türleri
(`app/domain/realtime/grid-events.ts`, hepsinde `by` ve `at`): `olusturuldu`, `icerik`,
`renk`, `sabit`, `sira`, `arsivlendi`, `arsivden-cikti`, `cope-atildi`, `geri-yuklendi`,
`tasindi` (alandan ayrıldı), `silindi` (`noteIds`), `proje`, `uyelik` (`userId`),
`proje-silindi`. Görüntüleyici de alır. Yeniden bağlanınca sıra numarası atladıysa istemci
yeniden doğrular.

### Metin notu: Yjs ve D1 kopyası

- **İlk açılış:** odada Yjs durumu yoksa notun D1 HTML'i editör şemasına
  (`app/domain/notes/editor-schema.ts`, tarayıcı ile aynı) DOM'suz ayrıştırıcıyla çevrilip
  belgeye yazılır (`app/domain/realtime/note-doc.ts`; `@tiptap/y-tiptap`).
- **Depolama:** her kabul edilen güncelleme DO SQLite'a eklenir; her D1 yazımından sonra tek
  duruma birleştirilir.
- **D1'e yazım (kadans):** ilk değişiklikten **2 sn** sonra alarm (PLAN sınırı ≤ 5 sn; yazarken
  en çok 2 sn'de bir), son bağlantı kapanınca **hemen**, istemci `kaydet` deyince hemen.
  `body_html` (editörün `getHTML()` biçimi; Tiptap statik oluşturucusu), `body_text`,
  `updated_by` (en son düzenleyen), `updated_at`; ardından kanala `icerik`.
- **Sürümler:** kural "kişi başına + 5 dk" (`decideCollabVersionWrite`): son sürümün sahibi bu
  aralıkta düzenleyenlerden biriyse ve pencere açıksa o sürüm güncellenir, değilse en son
  düzenleyen adına yeni sürüm. İki kişi birlikte yazarken sürümler her yazımda el değiştirmez.
- **Oda dışı değişiklik:** HTTP ile gövde yazımı (`update` + `bodyHtml`), sürüm geri yükleme ve
  dönüşüm odayı sıfırlar (`noteChanged({reset})`): bağlantılar `sifirla` alır, istemci belgesini
  atar, oda D1'den yeniden dolar. D1 yazımı koşulludur (`body_html` odanın bildiğiyle aynıysa);
  araya giren değişiklik ezilmez, oda kendini sıfırlar. Kalıcı silmede bağlantılar 4404.
- **Başlık** HTTP ile kalır (`update` + `title`); oda açık bağlantılara `not` ile iletir.

### Yapılacaklar: yazım yolu

Görev işlemleri **HTTP ile** gider (`POST /api/notlar/:id/gorevler`, `task-sync` kuyruğu aynen),
ama Worker işlemi notun odasının `applyTaskOps` RPC'sine verir. Oda, mevcut
`noteAccess(...).tasks.apply` kodunu (doğrulama, tamamlanma zincirinin sunucuda yeniden
hesaplanması, tek D1 batch'i, sürüm, atama bildirimi) kendi kuyruğunda çalıştırır, sonra
sonucu tüm bağlantılara `gorevler` + artan `seq` ile yayınlar; HTTP yanıtı da aynı `seq`'i
taşır. Gerekçe: yetki, doğrulama ve D1 atomikliği tek yerde kalır, WebSocket'e yazım izni
gerekmez; DO tek iş parçacıklı olduğu için tüm yazımlar **tek toplam sırada** olur (aynı
başlığa eşzamanlı iki yazımda sunucu sırasında son yazan kazanır) ve yayın sırası D1 sırasıyla
aynıdır (yazımdan sonra ayrıca yayınlamak sıranın karışmasına açıktı). İstemcide
`createTaskSync().remote(state)`: eski `seq` yok sayılır, istek uçarken gelen yayın bekletilir
ve yanıttan büyükse (yani bizim işlemimizi de içeriyorsa) onun yerine kullanılır; kuyruktaki
gönderilmemiş işlemler her zaman gelen durumun üstüne yeniden uygulanır (yazılan metin ezilmez).

### Canlı ızgara

`/api/notlar` eylemleri (`noteIntentEffects`), proje eylemleri (`applyProjectIntentEffects`)
ve davet kabulü D1'e yazdıktan sonra `ctx.waitUntil` ile kanala olay yayınlar; NoteRoom görev
yazımında ve D1 kopyasında `icerik` yayınlar. Projeden çıkarılan / ayrılanın kanal bağlantısı
4404 ile kapanır. İstemci olayı `applyChannelEvent` ile hemen uygular (iyimser arayüzle aynı
kurallar: renk, sabit, sıra, görünümden çıkma, silme); kurulamayanlarda (yeni not, içerik,
görünüme giren not, proje / üyelik) loader'lar 250 ms birikmeyle yeniden doğrulanır.
Notlarım, Arşiv, Çöp kişisel kanala; proje sayfası (üç görünüm) proje kanalına bağlıdır.

### İstemci kancaları

Canlı katman `app/root.tsx`'te `LiveConfigProvider` ile oturum varsa açılır; sağlayıcı yoksa
(bileşen testleri) kancalar `null` döner ve not eski HTTP davranışıyla çalışır.

```ts
const live = useLiveNote({ noteId, kind, readOnly, enabled, seed, onMeta, onError }); // LiveNote | null
live.status; // "baglaniyor" | "bagli" | "cevrimdisi"
live.lastSyncedAt; // ms | null — son eşitleme / yayın / gönderim
live.lastSavedAt; // ms | null — D1 kopyasının son yazımı
live.peers; // Peer[]: { userId, name, color, avatarUrl, clientIds, focusTaskIds }
live.canEdit; // metin gövdesi: salt okunur değil + (eşitlendiyse bağlı | eşitlenmediyse loader tohumu + çevrimdışı değil)
live.canWrite; // HTTP ile yazılanlar (başlık, görevler …): çevrimdışı değil + salt okunur değil
live.readOnly;
live.fatal;
live.synced;
live.seeded; // belge loader'ın oda tohumuyla başladı (bkz. aşağı)
live.generation;
live.provider; // NoteSyncProvider: doc (Y.Doc), awareness
live.editorExtensions(user, placeholder); // Collaboration + CollaborationCaret (Yjs tembel yüklenir)
live.tasks; // LiveTaskSource → useTodoTasks(noteId, tasks, assignees, live.tasks)
live.setFocus(taskId | null);
live.flush();
live.reconnect();

const state = useLiveChannel(channel, (event) => {}, { onGap }); // { status, lastEventAt } | null
const { notes, live } = useLiveGrid(loaderNotes, view, channel); // PERSONAL_CHANNEL | { kind: "project", projectId }
```

**Düzenleyici bağlantıyı beklemez.** Açık notun loader'ı not odasından belge tohumunu alır
(`NoteRoom.collabSeed`: Yjs durumu + belge kimliği, base64; `app/domain/realtime/collab-seed.ts`).
Sağlayıcı belgeyi bununla başlatır, metin editörü WebSocket bağlantısı ve ilk eşitleme
gelmeden düzenlenebilir açılır; bu arada yazılanlar belgede bekler ve hoş geldinde sunucunun
adım 1'ine verilen adım 2 yanıtıyla gider (tohum odadaki belgenin kendisi olduğundan içerik
çoğalmaz). Hoş geldindeki belge kimliği tohumunkinden farklıysa (oda arada sıfırlandı)
sağlayıcı yeniden kurulur, eski belge gönderilmez. Ortak düzenleme parçası (Yjs) kartın
üzerine gelince / odaklanınca / dokununca ve önizleme açılınca iner
(`realtime/collab-loader.ts`); hazırsa sağlayıcı ilk çizimde kurulur ve editör bir kez,
doğrudan ortak düzenleme eklentileriyle oluşur.

Saf yardımcılar: `mergePresence`, `peersOnTask` (`presence.ts`), `reconnectDelay` /
`backoffSchedule` (500 ms → 15 sn, ±%20 titreşim; `backoff.ts`), `applyChannelEvent(s)`.
Asgari bağlama yapıldı: `NoteDialog` metin notunda Collaboration + imleç (`app.css`'te asgari
imleç stili), çevrimdışıyken düzenleme kapalı ve "Çevrimdışısın" satırı, başka yerden gelen
başlık / renk / sabit; `TodoEditor` canlı görevler ve odaklı görev (`onActiveTaskChange`);
diyalogda `data-canli` (durum) ve `data-canli-kisi` (diğer kişi sayısı) öznitelikleri.

### Testler

- **Birim** `tests/unit/realtime/`: Yjs ↔ HTML/JSON (editörün `getHTML`/`getJSON`'u ile
  gidiş-dönüş), varlık birleştirme ve farkındalık tel biçimi, bekleme çizelgesi, protokol
  doğrulama, ortak sürüm kararı, kanal olayı → ızgara yaması, `LiveSocket` (sahte soket ve
  zamanlayıcı), `NoteSyncProvider`, görev eşitleyicisinin `remote`'u, `useLiveGrid` /
  `useLiveNote`.
- **Worker** `tests/workers/canli.test.ts`, `canli-kanal.test.ts`
  (`tests/workers/canli-yardimcilar.ts`: Yjs eşitlemeli WebSocket istemcisi): oturumsuz 401,
  Origin 403, üye olmayan / başkasının notu / çöp 404, görüntüleyici salt okunur, yayın,
  varlık temizliği, alarmla D1 yazımı (`runDurableObjectAlarm`), sürüm kuralı, son
  bağlantıda yazım, tahliyeden sonra durum (`evictDurableObject`), sıfırlama, silme 4404,
  görev sırası + son yazan kazanır, kanal olayları (her eylem, reddedilen eylem yayınlanmaz,
  taşıma iki kanal, rol / çıkarma).
- **Uçtan uca** `tests/e2e/canli.spec.ts` (`@duman`, masaüstü): iki tarayıcı bağlamı; canlı
  ızgara, varlık sayısı, bir tarafta yazılan metin diğerinde 1 sn içinde, kapanınca kart güncel.
- Elle: `npm run dev` açıkken `npx tsx scripts/ws-smoke.ts`.

### Bilinen sınırlar

- Çevrimdışı düzenleme yok (PLAN): kopukken metin editörü ve HTTP yazımları kapalı; kopmadan
  hemen önce yazılan ama gitmeyen Yjs güncellemesi yeniden bağlanınca (sunucu adım 1) gider.
- Varlık bilgisi odanın belleğindedir; uykudan sonra istemcilerden yeniden istenir (kısa
  süre boş görünebilir).
- Rol düşürme / çıkarma açık not odasına en geç 30 sn'de (düzenleme gelince) yansır; proje
  kanalı hemen kapanır ve proje sayfası `uyelik` olayıyla rolü yeniden yükler (açık not
  arayüzde hemen salt okunur olur).
- Kanal olayları en iyi çabadır (yayın hatası günlüğe yazılır); kaçan olay yeniden
  bağlanınca sıra numarası farkıyla yakalanır, bağlıyken kaçan olay bir sonraki yeniden
  doğrulamaya kadar görünmez.
- Başlık ortak düzenlenmez (HTTP, son yazan kazanır); gövde Yjs'tir.

### Canlı arayüz (Aşama 4b)

Tasarımda ayrı bir varlık çizimi yok; proje üye yığınının dili (2 px zemin halkası, -8 px
bindirme) kullanıldı. Çevrimdışı durumları `States`, `TStates`, `MOffline` çizimlerinden.

| Parça                                                                                    | Yer                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PresenceAvatars` (`components/realtime/presence-avatars.tsx`)                           | Not başlığının yanında (masaüstü/tablet), mobilde üst çubukta; en çok 3, fazlası `+n`; ipucunda "Şu an bu notta" ve adlar; kendin (tüm sekmelerin) yok                                                                                                                     |
| Görev odağı (`TaskRow` `focusPeers`, `peersOnTask`)                                      | Satırda kişinin renginde halkalı 18 px avatar + sol çizgi; "X bu görevde"                                                                                                                                                                                                  |
| İmleç ve seçim (`collab.ts` `renderCaret`, `selectionRender`; `app.css` `.collab-caret`) | Kişi renginde 2 px çizgi + ad etiketi (beyaz metin), seçimde yalnızca zemin (%24 / koyu %45); koyu temada çizgi açılır                                                                                                                                                     |
| `OfflineBanner`, `SyncStatus`, `useOfflineShown` (`live-status.tsx`)                     | Not içinde bant + "Yeniden dene" (`live.reconnect`), içerik soluk, altbilgide "Son eşitleme: …"; alan sayfalarında üstte bant, başlık altında son eşitleme, "Not al" etkileşimsiz. Tarayıcı çevrimdışıysa hemen, başka kopmada 1,2 sn sonra; yeniden bağlanana kadar kalır |
| Uzaktan yıkıcı olaylar (`remoteNoteOutcome`, `live-ui.ts`)                               | Başkası çöpe atınca / arşivleyince / taşıyınca (`not.moved`) ya da erişim kalkınca (4404) bekleyen başlık ve görevler gönderilir, not kapanır, toast kimin yaptığını söyler ("Geri yükle" / "Arşivden çıkar")                                                              |
| Salt okunur reddi, rol düşürme                                                           | `onError` → tek toast; `rol` → "Rolün değişti", düzenleme kapanır, rota yeniden yüklenir                                                                                                                                                                                   |
| `useProjectChannelGuard` (`use-project-guard.ts`)                                        | `proje-silindi` (başkası) → Notlarım + toast; `uyelik` (ben) → `GET /api/projeler/:id`: 404 ise "Projeden çıkarıldın" + Notlarım, değilse "Rolün değişti"                                                                                                                  |
| Izgara hareketi (`note-grid.tsx`)                                                        | Motion (`motion/react`, `LazyMotion` + `domMax`): kart `layout="position"` ile kayar, giren belirir, çıkan `AnimatePresence` ile solar; sürüklenen kartta kapalı; hareketi azaltta (sistem ya da `data-motion="reduced"`, `useReducedMotion`) hiçbiri                      |
| Başlık yarışı                                                                            | Yazarken gelen uzak başlık bekletilir, alandan çıkınca (yeniden yazılmadıysa) uygulanır: iki taraf sunucudaki son yazımda buluşur                                                                                                                                          |

Sunucu boşlukları kapandı: `NoteRoom.purge()` (bağlantılar 4404, DO deposu `deleteAll`);
cron çöp ve silinmiş proje temizliği `purgeNoteRooms` çağırır; hesap silme
(`applyAccountDeletionEffects`) üyesi olunan proje kanallarına `uyelik`, kişisel kanala
`silindi` yayınlar ve kişisel not odalarını boşaltır.

Testler: birim `tests/unit/realtime/canli-arayuz.test.ts` (saf metin ve kararlar),
`canli-bilesenler.test.tsx` (avatar yığını, bant, son eşitleme, açık notta sahte soketle
olaylar, proje yönlendirmesi); Worker `tests/workers/canli-temizlik.test.ts`; uçtan uca
`tests/e2e/canli-ortak.spec.ts` (iki / üç tarayıcı bağlamı, üç görünüm; Mehmet, Can ve
Zeynep oturumları `global-setup.ts`'te kaydedilir: `tests/e2e/.auth/*.json`).

## Dosya ekleri

Aşama 5a (PLAN §3): yalnızca **metin notunda** görsel ve genel dosya, R2 (`FILES`, kova
`sukano-files`) üzerinde. Tasarım: `TextNote`, `TText`, `MText`, `CardStates` ("görsel ekli"),
`States2` ("Dosya eki · yükleniyor ve sınır"). Şema değişmedi (`attachments` tablosu `0000`'da).

| Uç                           | İş                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /api/notlar/:id/ekler`  | `{ attachments: AttachmentInfo[] }` (eklenme sırası)                                          |
| `POST /api/notlar/:id/ekler` | multipart, alan `dosya` → 201 `{ ok, attachment }`; 400 / 403 / 404 / 409 / 413 / 415         |
| `GET /api/ekler/:id`         | Dosya Worker üzerinden akar; görsel ve PDF `inline`, diğerleri ve `?indir=1` ile `attachment` |
| `DELETE /api/ekler/:id`      | Eki kaldırır (R2 nesnesi de silinir) → `{ ok: true }`                                         |

- **Kurallar** (`app/domain/attachments/rules.ts`, saf, birim testli): dosya başına **10 MB**,
  not başına **20** ek. Tür **uzantıdan** belirlenir (tarayıcının MIME'ına güvenilmez; R2'ye ve
  yanıta listedeki tür yazılır). İzin listesi: jpg/jpeg, png, gif, webp, avif, heic/heif; pdf;
  doc(x), xls(x), ppt(x), odt/ods/odp, rtf; txt, csv, md; zip; mp3, m4a, mp4, mov. SVG (betik
  taşıyabilir), HTML, çalıştırılabilir dosyalar ve betikler reddedilir. Ad temizlenir (yol
  parçaları, denetim / yön karakterleri, ayrılmış karakterler; en çok 120 karakter, uzantı
  korunur). Metinler: "48 MB · dosya başına en fazla 10 MB", "Bu dosya türü eklenemez",
  "Bir nota en fazla 20 dosya eklenebilir", "Yüklenemedi · bağlantını denetleyip tekrar dene".
- **Yetki** (`app/lib/attachments.server.ts`): notun erişimiyle aynı (`noteScope`). Görüntüleme ve
  indirme her üyeye (görüntüleyici dahil); ekleme ve kaldırma `note.edit` (kişisel notta sahibi,
  projede yönetici / düzenleyici; görüntüleyici 403). Üye olmayan için not da ek de yoktur (404;
  ek kimliği tahmin edilse de). Yapılacaklar notu ve çöpteki not 409 (çöpteki notun eki
  indirilebilir). Yükleme ve silme başka kökenden (Origin) 403; büyük gövde okunmadan 413.
- **İndirme başlıkları:** `Content-Disposition` ASCII `filename` + UTF-8 `filename*`
  (Türkçe ad), `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=3600`, ETag ile 304. Tarayıcıda açılan görsele `Content-Security-Policy: default-src 'none'; sandbox` (PDF ve
  indirmelerde yok: Chrome sandbox'lı yanıtta dosya adını yok sayıyor). Kova herkese açık değil;
  küçük resim için ayrı boyutlandırma yok (görsel `object-fit: cover` ile, `loading="lazy"`).
- **Temizlik:** eki kaldırınca R2 nesnesi silinir; kalıcı silme, çöpü boşaltma, "Kopyasını
  oluştur"un geri alınması, cron çöp temizliği, silinmiş proje temizliği ve hesap silme
  (kişisel notlar) mevcut `deleteNotes` yolundan R2 nesnelerini siler.
- **Kopyalama ve taşıma:** "Kopyasını oluştur" ve "Kopyala…" ekleri yeni R2 anahtarlarına
  (`ekler/<notId>/<ekId>`) kopyalar (`copyAttachments`); taşıma notun kimliğini korur, ekler
  kalır. Eki olan metin notu yapılacaklara dönüştürülemez (Aşama 2 kuralı).
- **Sürümler:** ek ekleme / kaldırma sürüm **üretmez** ve sürüm geri yükleme eklere dokunmaz
  (sürüm metin ya da görev ağacının anlık görüntüsüdür); notun "son düzenleyen" bilgisi güncellenir.
- **Canlı:** başarılı ekleme / kaldırmadan sonra alan kanalına `icerik` (kart kapağı) ve not
  odasına `{t:"not", attachments:true}` (açık nottaki diğer istemciler ek listesini yeniden
  yükler).
- **Arayüz** (`app/components/attachments/`): görseller 200×132 küçük resim (mobilde tam genişlik
  140 px), dosyalar rozet + ad + boyut çipi (PDF kırmızı); yüklenen dosya ilerleme çubuğu ve
  "2,4 / 3,1 MB", hata kutucuğu (kırmızı çerçeve, metin, Kaldır; ağ hatasında Tekrar dene).
  Ekleme: ataç düğmesi (masaüstü/tablet alt çubuk, mobilde biçimlendirme çubuğu), nota
  sürükle-bırak (kesik çizgili alan) ve panodan yapıştırma; kaldırma iyimser. Görsele tıklayınca
  koyu zeminli görüntüleyici (← / →, İndir, Esc). Kartta ilk görsel kapak; yalnızca dosya varsa
  ataç + "n ek". Görüntüleyici rolü ekleri görür ve indirir, düğme / kaldırma / bırakma yok.
- **Testler:** birim `tests/unit/attachments/kurallar.test.ts`, `bekleyen.test.ts`; bileşen
  `ekler-arayuz.test.tsx`; Worker `tests/workers/ekler.test.ts` (rol matrisi, 404 tahmini,
  413 / 415 / 409, başlıklar, 304, R2 temizliği her silme yolunda, kopyada nesne çoğalması, oda
  bildirimi); uçtan uca `tests/e2e/ekler.spec.ts` (üç görünüm: görsel ekle ve aç, dosya ekle ve
  indir, 10 MB hatası, kaldır, görüntüleyici, axe açık/koyu).

## Hatırlatıcılar ve bildirimler

Aşama 5b (PLAN §3, §5; tasarım: `Notifications`, `TNotifications`, `MNotifications`, `Forms`,
`MReminder`, `States2`, `Settings` / `TSettings` / `MSettings`, `TodoNote` / `MTodoDate`).

| Uç                                   | İş                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `GET /api/bildirimler`               | `{ items, unread, hasMore, cursor }` (20'şer, en yeni önce); `?once=<ms>`, `?sayi=1`     |
| `POST /api/bildirimler`              | `read` (`id` / `ids`), `read-all`, `pref` (`key`, `value` 1/0), `time-zone`              |
| `GET /api/push/abonelik`             | `{ publicKey }` (push kapalıysa null); `?endpoint=` → `subscribed`                       |
| `POST` / `DELETE /api/push/abonelik` | JSON `PushSubscription.toJSON()` kaydeder / `{ endpoint }` siler (yalnızca kendininkini) |
| `POST /api/hatirlaticilar`           | `note` (`noteId`, `date`, `time`, `timeZone?`), `note-clear`, `task` (`taskId`, `on`)    |
| `/bildirimler`                       | Bildirim sayfası (mobil zil); masaüstü ve tablette zil paneli                            |
| `POST /__test/cron?now=<ISO\|ms>`    | Yalnızca yerel/test (`/__test/outbox` ile aynı koruma): hatırlatıcı işini sahte saatle   |

**Hatırlatıcı.** Not hatırlatıcısı tarih + saat; kişisel notta sahibine, proje notunda o anki tüm
üyelere gider. Görev "Hatırlat" anahtarı (tarih seçicide, bitiş tarihi varken) bitiş tarihi +
saati kullanır (saat yoksa 09:00); atananlara, atanan yoksa kurana gider (yalnızca o anki
üyeler). Kurmak / kaldırmak notu düzenleme yetkisi ister (görüntüleyici 403). Saat kişinin
saat diliminde yorumlanır: tarayıcıdan gelir (istekte `timeZone`, ayrıca kabuk açılışında
oturum başına bir kez `time-zone`), `user_preferences.time_zone`'da saklanır, varsayılan
`Europe/Istanbul`. `reminders.at` UTC ms. Görevin bitiş tarihi / saati değişince hatırlatıcı
kuranın saat diliminde yeniden hesaplanıp yeniden kurulur, tarih kalkarsa ya da görev silinirse
silinir (`taskReminderSyncOps`, görev yazımıyla aynı batch). Bir kez çalar; çöpteki not, silinmiş
proje, tamamlanmış ya da silinmiş görevin hatırlatıcısı gönderilmeden kapanır.

**Cron (dakikada bir, `sendDueReminders`).** `UPDATE reminders SET sent_at = now WHERE sent_at
IS NULL AND id IN (zamanı gelenler) RETURNING *` ile hatırlatıcılar **tam bir kez** alınır (iki
cron aynı anda koşsa da), alıcılara `hatirlatici` bildirimi yazılır. Ardından
`deliverPendingNotifications` aynı yöntemle `notifications.delivered_at IS NULL` satırlarını alır
(migration `0003`): sahibinin kişisel kanalına (`kisi:<userId>`) `bildirim` olayı yayınlar ve
tercihe göre Web Push gönderir. Davet, rol, çıkarma, proje silme ve göreve atanma bildirimleri
istek sonunda (`ctx.waitUntil`) dağıtılır; cron kaçanları yakalar. Çöp, silinmiş proje ve davet
işleri değişmedi.

**Web Push.** `app/domain/notifications/web-push.ts` yalnızca WebCrypto: VAPID ES256 JWT (`aud`
uç noktanın kökeni, 12 sa) ve RFC 8291 `aes128gcm` şifreleme (RFC test vektörüyle birim testli);
bağımlılık yok. Abonelik cihaz başına (`push_subscriptions`, uç nokta tekil); push hizmeti
404 / 410 dönerse silinir. Yük `{ title, body, url, tag, action? }` (States2 metinleri);
hatırlatıcıda aciliyet `high`. VAPID anahtarı yoksa push sessizce atlanır. Push yalnızca
hatırlatıcı, göreve atanma ve davette gider; her biri Ayarlar'dan kapatılır, uygulama içi
bildirim her zaman yazılır. `public/sw.js` `push` ve `notificationclick` dinler (açık
sekmeye odaklanıp adrese gider); önbellek ve çevrimdışı okuma için bkz.
[PWA, çevrimdışı ve güvenlik](#pwa-çevrimdışı-ve-güvenlik).
İzin sayfa açılışında sorulmaz: Ayarlar → Bildirimler'de "Bu cihazda aç" ya da ilk hatırlatıcı
kurulduktan sonra bir kez gösterilen toast ("Bildirimleri aç").

**Uygulama içi.** Zil (`components/notifications/notification-bell.tsx`): okunmamışta kırmızı
nokta ve "Bildirimler, n yeni"; masaüstü / tablette panel (Tümünü okundu say, ayarlar,
"Daha eski bildirimler"), mobilde `/bildirimler`. Sayı kişisel kanaldan canlı yenilenir, başka
sekmede okundu sayılınca da düşer. Metinler `app/domain/notifications/copy.ts` (Phase 3 türleri
`davet`, `rol_degisti`, `projeden_cikarildi`, `proje_silindi`, `goreve_atandi` ve `hatirlatici`);
sunucu biçimlendirir (göreli zaman kişinin saat diliminde), istemci aynen çizer.

**E-posta.** Davet e-postası `email.davet` tercihine uyar (uygulama içi davet ve push yine
gider). Doğrulama, şifre sıfırlama ve e-posta değişikliği (Ayarlar → E-posta → Değiştir:
şifreyle onay, yeni adrese doğrulama bağlantısı, Better Auth `changeEmail`) her zaman gider.

**Arayüz.** Not hatırlatıcısı: açık notun alt çubuğunda (mobilde üst çubukta ve ⋯ sayfasında)
zil; masaüstü / tablette açılır pencere, mobilde alttan sayfa (Vazgeç + Kaydet, Kaldır). Kurulu
hatırlatıcı notta ve kartta "Yarın, 09:00" çipi; karttaki zil notu `?hatirlatici` ile açar.

**Testler.** Birim `tests/unit/reminders/` (saat dilimi: İstanbul ve yaz saatli Berlin /
New York, hızlı seçenekler, alıcı kuralı, istek doğrulama), `tests/unit/notifications/` (metinler,
push yükü, tercihler, RFC 8291 vektörü, VAPID JWT, bileşenler: seçici, zil paneli, Hatırlat
anahtarı, ayarlar); Worker `tests/workers/bildirimler.test.ts` (cron iki kez → tek bildirim,
eşzamanlı cron, alıcılar, tarih değişince yeniden hesap, push kaydı / silme, 410 / 404 temizliği,
tercihler, davet e-postası, liste / okundu yetkisi); uçtan uca `tests/e2e/bildirimler.spec.ts`
(üç görünüm, görünüm başına ayrı kişi: hatırlatıcı → `/__test/cron` → canlı zil → tümü okundu,
atama bildirimi, görev Hatırlat, axe açık / koyu).

**Bilinen sınırlar.** Push yalnızca HTTPS kökende ve izin verilmiş tarayıcıda; iOS'ta ana
ekrana eklenmiş PWA gerekir (Aşama 6). E-posta değişikliğinde "Doğrulama bekleniyor · Tekrar
gönder · İptal et" satırı yok (Better Auth bekleyen değişikliği saklamıyor). Not oluşturma
alanındaki (composer) zil devre dışı: hatırlatıcı not kaydedildikten sonra açık notta kurulur.

## Hareket ve erişilebilirlik

Aşama 6b (PLAN §10 Hareket; tasarım `MotionSpec`, `MicroMotion`, `AuthMotion` A).

**Belirteçler.** `app/app.css` `:root`: `--dur-micro` 120 ms, `--dur-small` 180, `--dur-medium`
240, `--dur-large` 320, `--dur-ambient` 11 s; `--ease-out` (giriş), `--ease-in` (çıkış, süre
girişin ~%75'i), `--ease-spring`, `--ease-inout` (yer değiştirme), `--ease-ambient`. JS karşılığı
`app/lib/motion.ts` (`DURATION`, `EASE`, `motionTransition`, `exitTransition`; azaltılmış harekette
ikisi de 120 ms saydamlık döner, `REDUCED_FADE`; `TOAST_MS` tüm toast'lar 6 sn). Basit geçişler CSS; Motion yalnızca çıkış (`AnimatePresence`), yerleşim
ve `MotionConfig` için (`app/components/motion-config.tsx`).

| Etkileşim                   | Uygulama                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Görev tamamlama             | `.task-cb` dolgu micro + tik small (40 ms gecikme), başlık çizgisi small; 1,2 sn sonra satır large ease-in-out iner (`.task-leave` → `.task-landed`)    |
| Toast                       | sonner: giriş medium ease-out, çıkış small ease-in; not içi yığın (`TodoToasts`) Motion ile alttan 24 px, çıkış `AnimatePresence`                       |
| Karttan modala              | `card-to-modal.ts`: tıklanan kartın kutusundan FLIP + Web Animations (large, yaylı); kapanış kartın yerine medium ease-in, örtü solar; odak karta döner |
| Sol panel                   | ray ↔ açık genişlik: açılış medium ease-out, kapanış small ease-in; çekmece (`Sheet`) aynı ölçek                                                        |
| Izgara                      | `note-grid.tsx`: yeni kart .92 → 1 medium, silinen 1 → .92 small ease-in, komşular `layout="position"`                                                  |
| İskelet                     | `ui/skeleton.tsx`: 1,6 sn ışıltı + 0,8 sn ara, 300 ms'den kısa yüklemede görünmez (sürüm geçmişi, bildirim paneli)                                      |
| Alt görev / ayrıntı         | alt satırlar ve ayrıntı akordeonu medium, 60 ms gecikmeli belirir; ok small döner                                                                       |
| Menü, popover, tarih seçici | açılış small ease-out (.96 → 1, Radix köken noktasından), kapanış micro ease-in; diyalog örtüsü medium                                                  |
| Sürükleme                   | `.drag-lift`: micro, 1,03 ölçek + gölge, eğim yok; komşular small ease-out kayar, bırakma small yaylı (`drag-motion.ts`); yer tutucu kesik çizgili      |
| Alt görev kapanışı          | `use-row-flip.ts`: kaybolan satırların kopyası eski yerinde small ease-in ile kırpılarak kapanır, alttakiler kayar                                      |
| Boş durum                   | not alanı boşken logo kareleri sırayla (80 ms arayla, medium ease-out; `.empty-logo`), başlık ve metin 160 ms sonra (`.empty-in-late`)                  |
| Biçimlendirme (Aa)          | `formatting-toolbar.tsx` `.fmt-row`: satır 0fr → 1fr small ease-in-out, çubuk saydamlık + 4 px 40 ms gecikmeli; kapanış micro; klavyeyle micro          |
| Logo ↔ hamburger            | `.logo-tg`: üzerine gelince / odakta logo micro'da solup küçülür, hamburger small'da dönerek belirir; tıklama paneli açar/kapatır                       |
| Görünüm seçici              | `.vs-label`: yalnızca etkin öğe etiketli; genişlik small ease-in-out, yeni etiket 60 ms gecikmeli micro saydamlık; diğerlerinde 500 ms ipucu            |
| Giriş arka planı            | `rising-grid.tsx` (Auth/TAuth ile birebir): 9–14 sn döngü, 18–30 px genlik, yalnızca transform + opacity                                                |

**Hareketi azalt.** Ayarlar › Görünüm: **Sistem** (işletim sistemine uyar) / **Açık** (her zaman
azalt) / **Kapalı** (sistem azaltsa da tam hareket). `user_preferences.motion`
(`migrations/0004_hareket.sql`; eski `reduce_motion` değeri taşındı) ve oturumsuz sayfalar için
`sukano_hareket` çerezi. Kök loader tercihi okur ve `<html data-motion="reduced|full">` sunucuda
yazılır (ilk boyamada titreme yok); seçim istemcide hemen uygulanır (`applyMotionPreference`).
Azaltılmış harekette (`prefers-reduced-motion` ve `data-motion="full"` değilse, ya da
`data-motion="reduced"`): kayma, ölçek, eğim, ortam döngüsü ve ışıltı kapanır; geçişler anında
biter (genel kural 0,01 ms; Radix `animationend`'i yine alır). Anlam taşıyan durum değişimi 120 ms
saydamlıkla kalır: açılan yüzeyler (diyalog, menü, açılır pencere, ipucu) kaymadan solar, ızgaraya
giren / çıkan kart, tamamlanıp inen görev satırı, panel etiketleri, Aa çubuğu ve görünüm
seçicinin etiketi (genişlik anında). Tailwind'de
`reduced-motion:` varyantı, JS'te `useReducedMotion()` aynı kuralı izler.

**Erişilebilirlik.** Her sayfada ilk odak "İçeriğe geç" (`components/skip-link.tsx` →
`<main id="icerik" tabIndex={-1}>`); yer imleri: `header` (üst çubuk), `nav` "Ana gezinme",
`main`, arama `role="search"`. Açık not kapanınca odak açan kartın bağlantısına döner. Sürükleme
seçenekleri: notlarda Alt+ok, görevlerde Alt+ok ve Tab. `tests/e2e/erisilebilirlik.spec.ts`
tüm ana ekranları (Notlarım, Arşiv, Çöp, Arama, açık metin ve yapılacaklar notu, proje sayfası,
proje arşivi, proje ayarları, Davetler, Silinmiş projeler, Bildirimler, Ayarlar, kimlik sayfaları)
iki temada, üç görünümde axe ile tarar; kritik ya da ciddi ihlal yok. Ayrıca atlama bağlantısı ve
kart odak halkası denetlenir. Hareket: `tests/e2e/hareket.spec.ts`, `tests/unit/hareket/`.

## PWA, çevrimdışı ve güvenlik

Aşama 6a (PLAN §5, §6; tasarım: `States` "PWA kurulum ipucu", "Çevrimdışı", "Hata · sayfa
bulunamadı"; `MInstall`, `MOffline`). Yayın kontrol listesi, CSP kararının gerekçesi, hız
sınırları, yetki denetimi ve performans notları: [`docs/OPERASYON.md`](OPERASYON.md).

- **PWA:** `public/manifest.webmanifest` (+ 192 / 512 / maskable simgeler, `apple-touch-icon`),
  kök düzende `application-name` / `apple-mobile-web-app-*` meta etiketleri. Service worker
  (`public/sw.js`) üretim derlemesinde `app/components/pwa/service-worker.tsx` ile kaydedilir
  (geliştirme sunucusunda kaydedilmez).
- **Kurulum ipucu** (`app/components/pwa/install-hint.tsx`, kurallar
  `app/domain/pwa/install.ts`): oturum varken; Android / masaüstünde tarayıcı
  `beforeinstallprompt` gönderince "Ekle" (tarayıcının kurulum penceresi), iPhone / iPad
  Safari'de "Paylaş → Ana Ekrana Ekle" adımları. "Şimdi değil" / kapat 30 gün, kurulu açılışta
  hiç gösterilmez (`localStorage` `sukano:kurulum-ipucu`).
- **Çevrimdışı okuma:** sayfalar önce ağdan; sunucunun `X-Sukano-Oturum` başlığıyla işaretlediği
  belge ve `.data` yanıtları oturum başına ayrı önbelleğe (en çok 40). Açık sayfa kısa süre
  görününce service worker belgeyi ayrıca saklar (istemci tarafı gezinmede belge isteği yok).
  Çevrimdışıyken önbellekteki sayfa açılır, canlı katman bandı gösterir ve düzenlemeyi kapatır;
  ızgara ve not rotaları çevrimdışıyken yeniden doğrulama yapmaz
  (`app/lib/offline-revalidate.ts`). Hiç açılmamış sayfa `public/cevrimdisi.html`. Çıkış, hesap
  silme ve oturum değişimi sayfa önbelleklerini siler. "Not al" düzenleyicisi tembel yüklenir
  (`components/notes/lazy-composer.tsx`); çevrimdışıyken yer tutucu kalır.
- **Hata görünümleri:** 404 (`components/not-found.tsx`), beklenmeyen hata ve "Bu sayfa çevrimdışı
  açılamıyor" (`components/error-view.tsx`; sayfa önbellekteyse bir kez yeniden yükler).
- **Güvenlik başlıkları** (`app/domain/security/headers.ts`, `workers/app.ts`, statikler için
  `public/_headers`): nonce'lu CSP (`'strict-dynamic'`, satır içi betik yok; stillerde
  `'unsafe-inline'`), HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy,
  Permissions-Policy, COOP. Başka kökenden durum değiştiren istek Worker girişinde 403.
- **Hız sınırları:** kimlik uçlarına ek olarak dosya yükleme (30 / dk), davet (20 / dk) ve push
  aboneliği (10 / dk), kullanıcı başına; aşılınca 429 + Türkçe ileti
  (`app/lib/api-limits.server.ts`).
- **Testler:** birim `tests/unit/guvenlik/`, `tests/unit/pwa/` (service worker sahte
  CacheStorage'da: oturum yalıtımı, çıkışta silme, 40 sayfa sınırı); Worker
  `tests/workers/guvenlik.test.ts` (başlıklar, nonce, CSRF, oturum işareti, 429'lar, **tüm rota
  tablosunun** oturumsuz denetimi, üye olmayanın API erişimi, 100'den çok yapılacaklar notu);
  uçtan uca `tests/e2e/pwa.spec.ts` (üç görünüm: manifest + kurulabilirlik, CSP ihlali yok,
  çevrimdışı yeniden yükleme salt okunur, çevrimdışı gezinme, çıkışta önbellek silme, 404,
  kurulum ipucu Android / iOS, axe açık / koyu).
- **Lighthouse:** `npm run lighthouse` (sunucu yoksa derler, ayrı yerel durumla `vite preview`
  açar; `LH_BASE_URL` ile çalışan sunucuya). Raporlar `lighthouse-report/`; erişilebilirlik < 95
  başarısız. CI'da `lighthouse` işi (PR ve `main`).

## Cloudflare tarafında yapılacaklar

Ayrıntılı kontrol listesi ve gerekli tüm gizli değişkenler: [`docs/OPERASYON.md`](OPERASYON.md).

İlk dağıtımdan önce bir kez (`wrangler login` ya da `CLOUDFLARE_API_TOKEN` ile):

1. **D1:** `npx wrangler d1 create sukano` → çıktıdaki `database_id`'yi `wrangler.jsonc`'deki
   `00000000-0000-0000-0000-000000000000` yerine yaz; ardından `npm run db:migrate:remote`.
2. **R2:** panelden R2'yi etkinleştir, sonra `npx wrangler r2 bucket create sukano-files`.
3. **Gizli değişkenler:** yukarıdaki tablodaki her biri için `npx wrangler secret put <AD>`.
4. **Durable Objects:** ek işlem yok; `wrangler deploy`, `migrations` (v1
   `new_sqlite_classes: ["NoteRoom"]`, v2 `["ProjectRoom"]`) ile sınıfları oluşturur.
5. **Cron:** ek işlem yok; `triggers.crons` dağıtımla kaydolur.
6. **Google OAuth:** Google Cloud Console'da Web istemcisi; yetkili yönlendirme URI'si
   `<BETTER_AUTH_URL>/api/auth/callback/google`.
7. **Turnstile:** panelden site oluştur; site anahtarını `vars.TURNSTILE_SITE_KEY`'e, gizli
   anahtarı `TURNSTILE_SECRET_KEY` gizli değişkenine yaz.
8. **E-posta:** Resend hesabı ve gönderici alan adı doğrulaması; `RESEND_API_KEY`,
   `vars.EMAIL_FROM`.
9. **Web Push:** `npx web-push generate-vapid-keys` (ya da herhangi bir P-256 çifti) →
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` gizli değişkenleri; `vars.VAPID_SUBJECT`'i gerçek
   iletişim adresiyle değiştir. Anahtar değişirse mevcut abonelikler geçersizleşir (cihazlar
   Ayarlar'dan yeniden açar).
10. **Plan:** yayına alırken Workers Paid (şifre hash'leme CPU süresi, D1/R2 kotaları).

## Testler

Dört katman (ayrıntı: [`docs/PLAN.md` §11](PLAN.md)). Test adları Türkçe davranış
cümlesidir: `it("sistem tercihi koyuysa ve tercih 'system' ise koyu çözümlenir")`.

| Katman       | Araç                                                       | Yer                                           | Yapılandırma               |
| ------------ | ---------------------------------------------------------- | --------------------------------------------- | -------------------------- |
| Birim        | Vitest (jsdom)                                             | `tests/unit/**/*.test.ts`, `app/**/*.test.ts` | `vitest.config.ts`         |
| Bileşen      | Vitest + Testing Library                                   | `tests/unit/**/*.test.tsx`                    | `vitest.config.ts`         |
| Worker / API | Vitest + `@cloudflare/vitest-plugin` (Miniflare, yerel D1) | `tests/workers/**/*.test.ts`                  | `vitest.workers.config.ts` |
| Uçtan uca    | Playwright + axe-core, Chromium                            | `tests/e2e/**/*.spec.ts`                      | `playwright.config.ts`     |

| Komut                  | İş                                                                         |
| ---------------------- | -------------------------------------------------------------------------- |
| `npm test`             | Birim + bileşen testleri                                                   |
| `npm run test:watch`   | Aynısı, izleme kipinde                                                     |
| `npm run coverage`     | Birim + bileşen + kapsam raporu (`coverage/`, eşik altında başarısız olur) |
| `npm run test:workers` | Worker testleri: `wrangler.jsonc` binding'leriyle workerd içinde           |
| `npm run e2e`          | Tüm uçtan uca testler, üç görünümde                                        |
| `npm run e2e:duman`    | Yalnızca duman seti (`@duman` etiketli testler)                            |
| `npm run e2e:ui`       | Playwright arayüzü (hata ayıklama)                                         |
| `npm run test:all`     | Kapsam + Worker + tam uçtan uca                                            |

**Birim ve bileşen.** `tests/setup.ts` jest-dom eşleştiricilerini yükler, her testten önce
`localStorage`'ı ve `<html>` özniteliklerini sıfırlar. jsdom'da olmayan `matchMedia` için
`tests/helpers/media.ts` sahte uygulaması vardır: `setMedia({ width: 390, dark: true })` görünüm
genişliğini ve sistem renk şemasını değiştirir, dinleyicilere `change` gönderir.

**Kapsam.** v8; eşik yalnızca saf mantık modüllerinde (`app/lib/**`, `app/domain/**`):
statements ve branches **%85**. G/Ç ağırlıklı `app/lib/auth*`, `session*`, `email*` ve
`*.server.ts` modülleri kapsam dışıdır; bunlar Worker katmanında test edilir. Rapor:
`coverage/index.html`.

**Worker / API.** Testler gerçek workerd içinde, `wrangler.jsonc`'deki binding'lerle (D1, R2,
Durable Object) koşar; her test dosyası yalıtılmış depolamayla başlar. `migrations/` klasörü
varsa `tests/workers/apply-migrations.ts` her dosyadan önce `applyD1Migrations` ile şemayı kurar.
Uygulamanın tamamına istek atmak için:

```ts
import { exports } from "cloudflare:workers";
const res = await exports.default.fetch("http://sukano.test/health");
```

**Uçtan uca.** Playwright, üretim derlemesini `vite preview` ile ayağa kaldırır (port 4173;
yerelde çalışan bir sunucu varsa onu kullanır) ve üç projede koşar:

| Proje      | Görünüm              |
| ---------- | -------------------- |
| `masaustu` | 1440×900             |
| `tablet`   | 834×1194, dokunmatik |
| `mobil`    | 390×844, dokunmatik  |

Tek proje: `npm run e2e -- --project=mobil`. Uzak bir önizlemeye karşı:
`E2E_BASE_URL=https://… npm run e2e:duman` (yerel sunucu başlatılmaz). İz kaydı kapalıdır
(`trace: "off"`); hata durumunda ekran görüntüsü `test-results/`, HTML rapor `playwright-report/`
altına yazılır. `erisilebilirlik.spec.ts` her sayfada axe çalıştırır; kritik ya da ciddi ihlal
testi düşürür.

**Duman seti.** Her PR'da koşan hızlı alt küme: test seçeneklerine `{ tag: "@duman" }` eklenir.
Ölçüt: kritik akışın "açılıyor ve temel etkileşim çalışıyor" kontrolü; ayrıntılı senaryolar
etiketsiz kalır ve `main`'de tam sette koşar.

**Test hesapları ve örnek veri.** `tests/fixtures/hesaplar.ts`: `suleyman`, `ayse`, `mehmet`,
`zeynep`, `can` (`<ad>@test.sukano`, şifre `Test1234!`, örnek projedeki rolleriyle).
`tests/fixtures/ornek-veri.ts`: tasarımdaki projeler, notlar ve görevler (Web Sitesi Yenileme,
Lansman hazırlığı …). İkisi de bağımlılıksız TypeScript'tir; tohum betiği de bunları kullanır.
Playwright'ın `tests/e2e/global-setup.ts` dosyası uçtan uca veritabanını hazırlar ve oturumu
üretir (bkz. [Kimlik testleri](#kimlik-testleri)).

## CI

GitHub Actions, `.github/workflows/`:

| İş akışı     | Tetikleyici                          | İşler                                                                                       |
| ------------ | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `ci.yml`     | her push ve PR                       | `npm ci` → `typecheck` → `lint` → `coverage` (eşikli) → `build`                             |
|              | yalnızca PR                          | `test:workers`; `e2e:duman` (Chromium `npx playwright install --with-deps chromium`)        |
|              | yalnızca `main`'e push               | tam `e2e`                                                                                   |
|              | PR ve `main`'e push                  | `lighthouse` (üretim derlemesi; erişilebilirlik ≥ 95, rapor iş akışı eki)                   |
| `deploy.yml` | CI başarıyla bitince (push kaynaklı) | `main`: `wrangler d1 migrations apply sukano --remote` + `wrangler deploy`                  |
|              |                                      | diğer dallar: `wrangler versions upload --preview-alias <dal>`; önizleme adresi iş özetinde |

> **Not:** Geliştirme bittiği için `deploy.yml`'nin otomatik tetikleyicisi (`workflow_run`)
> kaldırıldı; iş akışı artık yalnızca elle (`workflow_dispatch`) çalışır. Tablo, otomatik dağıtım
> açıkken geçerli olan düzeni anlatır; bkz. [`OPERASYON.md` §2](OPERASYON.md#2-dağıtım).

Dağıtım CI geçmeden koşmaz (`workflow_run`, yalnızca `conclusion == success`). Gerekli depo gizli
değişkenleri: `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit, D1: Edit), `CLOUDFLARE_ACCOUNT_ID`.
Hata durumunda kapsam ve Playwright raporları iş akışı eki olarak indirilebilir.

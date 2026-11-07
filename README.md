# Sukano

Kişisel notlar ve paylaşılan projeler için Keep benzeri bir web uygulaması.
Ürün ve teknik plan: [`docs/PLAN.md`](docs/PLAN.md) · Tasarım kaynakları: [`docs/design/`](docs/design/).

**Yığın:** React Router v7 (framework modu) · Vite · TypeScript · Tailwind CSS v4 · shadcn/ui ·
Cloudflare Workers.

## Kurulum

Gereksinimler: Node.js 22 (`.nvmrc`), npm.

```sh
nvm use          # Node 22
npm install      # postinstall: wrangler types → worker-configuration.d.ts
npm run dev      # http://localhost:5173
```

Geliştirme sunucusu Cloudflare Vite eklentisiyle Worker'ı yerel `workerd` içinde çalıştırır.

| Yol                 | Açıklama                                                                  |
| ------------------- | ------------------------------------------------------------------------- |
| `/`                 | Uygulama kabuğu + Notlarım (oturum yoksa boş kabuk)                       |
| `/giris`            | Giriş ekranı (form yer tutucu; gerçek akış Aşama 1'de)                    |
| `/health`           | Sağlık denetimi, `{ "ok": true }`                                         |
| `/api/auth/*`       | Better Auth uçları (`/api/auth/ok`, `/api/auth/get-session` …)            |
| `/api/notes/:id/ws` | Not odası WebSocket'i (NoteRoom; oturum gerekli; Aşama 4'e kadar iskelet) |

## Betikler

| Komut                           | İş                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `npm run dev`                   | Geliştirme sunucusu                                                            |
| `npm run build`                 | Üretim derlemesi (`build/client`, `build/server`)                              |
| `npm run preview`               | Derleyip üretim çıktısını yerelde önizler                                      |
| `npm run typecheck`             | `wrangler types` + `react-router typegen` + `tsc -b`                           |
| `npm run lint`                  | ESLint (typescript-eslint, react-hooks, jsx-a11y) + Prettier denetimi          |
| `npm run format`                | Prettier ile biçimlendirir                                                     |
| `npm run db:*`                  | Veritabanı betikleri; bkz. [Veritabanı ve migration](#veritabanı-ve-migration) |
| `npm run test*`, `npm run e2e*` | Testler; bkz. [Testler](#testler)                                              |

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
  app.ts                  Worker giriş noktası: React Router, NoteRoom, scheduled
  note-room.ts            NoteRoom Durable Object (WebSocket Hibernation iskeleti)
  scheduled.ts            Dakikalık cron işleri (gövdeler TODO)
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
| `RESEND_API_KEY`       | E-posta gönderimi (Aşama 1; şimdilik e-postalar konsola yazılır)    |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile gizli anahtarı (yerelde test anahtarı)         |
| `VAPID_PUBLIC_KEY`     | Web Push genel anahtarı (`npx web-push generate-vapid-keys`)        |
| `VAPID_PRIVATE_KEY`    | Web Push özel anahtarı                                              |

Gizli olmayan değerler `wrangler.jsonc` → `vars`: `APP_NAME`, `EMAIL_FROM`, `TURNSTILE_SITE_KEY`.

Binding'ler: `DB` (D1 `sukano`), `FILES` (R2 `sukano-files`), `NOTE_ROOM` (Durable Object
`NoteRoom`), cron `* * * * *` (`workers/scheduled.ts`). Loader/action içinde
`getCloudflare(context).env` ile erişilir. Yerelde cron'u elle tetiklemek için:
`curl "http://localhost:5173/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"`. NoteRoom duman testi:
`npm run dev` açıkken `npx tsx scripts/ws-smoke.ts`.

Elle dağıtım (CI iş akışı dışında):

```sh
npm run db:migrate:remote
npm run build
npx wrangler deploy
```

## Cloudflare tarafında yapılacaklar

İlk dağıtımdan önce bir kez (`wrangler login` ya da `CLOUDFLARE_API_TOKEN` ile):

1. **D1:** `npx wrangler d1 create sukano` → çıktıdaki `database_id`'yi `wrangler.jsonc`'deki
   `00000000-0000-0000-0000-000000000000` yerine yaz; ardından `npm run db:migrate:remote`.
2. **R2:** panelden R2'yi etkinleştir, sonra `npx wrangler r2 bucket create sukano-files`.
3. **Gizli değişkenler:** yukarıdaki tablodaki her biri için `npx wrangler secret put <AD>`.
4. **Durable Objects:** ek işlem yok; ilk `wrangler deploy`, `migrations` (v1,
   `new_sqlite_classes: ["NoteRoom"]`) ile sınıfı oluşturur.
5. **Cron:** ek işlem yok; `triggers.crons` dağıtımla kaydolur.
6. **Google OAuth:** Google Cloud Console'da Web istemcisi; yetkili yönlendirme URI'si
   `<BETTER_AUTH_URL>/api/auth/callback/google`.
7. **Turnstile:** panelden site oluştur; site anahtarını `vars.TURNSTILE_SITE_KEY`'e, gizli
   anahtarı `TURNSTILE_SECRET_KEY` gizli değişkenine yaz.
8. **E-posta:** Resend hesabı ve gönderici alan adı doğrulaması; `RESEND_API_KEY`,
   `vars.EMAIL_FROM`.
9. **Plan:** yayına alırken Workers Paid (şifre hash'leme CPU süresi, D1/R2 kotaları).

## Testler

Dört katman (ayrıntı: [`docs/PLAN.md` §11](docs/PLAN.md)). Test adları Türkçe davranış
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
Playwright'ın `tests/e2e/global-setup.ts` dosyası tohumlamanın bağlanacağı yerdir.

## CI

GitHub Actions, `.github/workflows/`:

| İş akışı     | Tetikleyici                          | İşler                                                                                       |
| ------------ | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `ci.yml`     | her push ve PR                       | `npm ci` → `typecheck` → `lint` → `coverage` (eşikli) → `build`                             |
|              | yalnızca PR                          | `test:workers`; `e2e:duman` (Chromium `npx playwright install --with-deps chromium`)        |
|              | yalnızca `main`'e push               | tam `e2e`                                                                                   |
| `deploy.yml` | CI başarıyla bitince (push kaynaklı) | `main`: `wrangler d1 migrations apply sukano --remote` + `wrangler deploy`                  |
|              |                                      | diğer dallar: `wrangler versions upload --preview-alias <dal>`; önizleme adresi iş özetinde |

Dağıtım CI geçmeden koşmaz (`workflow_run`, yalnızca `conclusion == success`). Gerekli depo gizli
değişkenleri: `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit, D1: Edit), `CLOUDFLARE_ACCOUNT_ID`.
Hata durumunda kapsam ve Playwright raporları iş akışı eki olarak indirilebilir.

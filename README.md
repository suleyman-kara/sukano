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

| Yol       | Açıklama                                               |
| --------- | ------------------------------------------------------ |
| `/`       | Uygulama kabuğu + Notlarım (boş durum)                 |
| `/giris`  | Giriş ekranı (form yer tutucu; gerçek akış Aşama 1'de) |
| `/health` | Sağlık denetimi, `{ "ok": true }`                      |

## Betikler

| Komut               | İş                                                                    |
| ------------------- | --------------------------------------------------------------------- |
| `npm run dev`       | Geliştirme sunucusu                                                   |
| `npm run build`     | Üretim derlemesi (`build/client`, `build/server`)                     |
| `npm run preview`   | Derleyip üretim çıktısını yerelde önizler                             |
| `npm run typecheck` | `wrangler types` + `react-router typegen` + `tsc -b`                  |
| `npm run lint`      | ESLint (typescript-eslint, react-hooks, jsx-a11y) + Prettier denetimi |
| `npm run format`    | Prettier ile biçimlendirir                                            |
| `npm run test*`     | _Test altyapısıyla eklenecek (Vitest, Workers havuzu, Playwright)._   |

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
  lib/                    theme.ts, nav-state.ts, placeholder.ts (geçici), utils.ts
workers/
  app.ts                  Worker giriş noktası (React Router istek işleyicisi)
public/
  fonts/                  Onest (self-host, latin + latin-ext)
  icons/                  PWA simgeleri (SVG kaynakları + PNG)
  favicon.svg, apple-touch-icon.png, manifest.webmanifest
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

## Dağıtım

_Veri ve CI ajanı tamamlayacak._

## Veritabanı ve migration'lar

_Veri ve CI ajanı tamamlayacak._

## Gizli değişkenler

_Veri ve CI ajanı tamamlayacak._ Gizli değerler depoya yazılmaz; yerelde `.dev.vars`
(git'e girmez), üretimde `wrangler secret put`.

## Testler ve CI

_Veri ve CI ajanı tamamlayacak._

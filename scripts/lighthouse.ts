/**
 * Lighthouse denetimi (Aşama 6a): üretim derlemesine (`vite preview`) karşı performans,
 * erişilebilirlik, en iyi uygulamalar ve SEO puanları. Erişilebilirlik her sayfada en az
 * `ESIK_ERISILEBILIRLIK` olmalı; altındaysa betik 1 ile çıkar (CI işi düşer).
 *
 *   npm run lighthouse                    # sunucu yoksa derler, tohumlar ve önizlemeyi açar
 *   LH_BASE_URL=http://localhost:4173 npm run lighthouse   # çalışan sunucuya karşı
 *
 * Tarayıcı: Playwright'ın Chromium'u, uzaktan hata ayıklama portuyla (`CHROME_PATH` ile
 * değiştirilebilir). Oturumlu sayfalar
 * için `suleyman@test.sukano` ile giriş yapılır, çerez Lighthouse'a başlık olarak verilir.
 * Raporlar `lighthouse-report/` altına (HTML + özet JSON) yazılır.
 *
 * 404 sayfası burada yok (Lighthouse 200 dışı belgeyi denetlemez); axe ile uçtan uca testte.
 * Not: Lighthouse 12'den beri "PWA" kategorisi yok. Kurulabilirlik uçtan uca testte
 * Chromium'un kendi denetimiyle (`Page.getInstallabilityErrors`) doğrulanır
 * (`tests/e2e/pwa.spec.ts`).
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import lighthouse, { desktopConfig } from "lighthouse";
import { hesaplar } from "../tests/fixtures/hesaplar";

const PORT = Number(process.env.LH_PORT ?? 4183);
const BASE = process.env.LH_BASE_URL ?? `http://localhost:${PORT}`;
const PERSIST_DIR = process.env.LH_PERSIST_DIR ?? ".wrangler/lighthouse";
const OUT_DIR = process.env.LH_OUT_DIR ?? "lighthouse-report";
const ESIK_ERISILEBILIRLIK = 0.95;

type Sayfa = { ad: string; yol: string; oturum: boolean; masaustu?: boolean };
const SAYFALAR: Sayfa[] = [
  { ad: "giris", yol: "/giris", oturum: false },
  { ad: "notlarim", yol: "/", oturum: true },
  { ad: "notlarim-masaustu", yol: "/", oturum: true, masaustu: true },
  { ad: "not", yol: "/not/market", oturum: true },
  { ad: "proje", yol: "/proje/web-sitesi-yenileme", oturum: true },
];

const KATEGORILER = ["performance", "accessibility", "best-practices", "seo"] as const;

async function isUp(): Promise<boolean> {
  try {
    return (await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

function startPreview(): ChildProcess {
  const env = { ...process.env, SUKANO_PERSIST_DIR: PERSIST_DIR, WRANGLER_LOG: "error" };
  rmSync(PERSIST_DIR, { recursive: true, force: true });
  const opts = { stdio: ["ignore", "ignore", "inherit"] as const, env };
  execFileSync(
    "npx",
    ["wrangler", "d1", "migrations", "apply", "sukano", "--local", "--persist-to", PERSIST_DIR],
    { ...opts, stdio: ["ignore", "ignore", "inherit"] },
  );
  execFileSync("npx", ["tsx", "scripts/seed.ts", "--sifirla"], {
    ...opts,
    stdio: ["ignore", "ignore", "inherit"],
  });
  return spawn("npm", ["run", "preview", "--", "--port", String(PORT), "--strictPort"], {
    env,
    stdio: "ignore",
    detached: true,
  });
}

async function waitUp(child: ChildProcess) {
  const started = Date.now();
  while (Date.now() - started < 180_000) {
    if (child.exitCode !== null) throw new Error("Önizleme sunucusu kapandı.");
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Önizleme sunucusu açılmadı.");
}

/** Giriş formuyla oturum çerezi alır. */
async function sessionCookie(): Promise<string> {
  const { eposta, sifre } = hesaplar.suleyman;
  const res = await fetch(`${BASE}/giris`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE },
    body: new URLSearchParams({ email: eposta, password: sifre }).toString(),
  });
  const cookies = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .filter((c) => !c.endsWith("="));
  if (res.status !== 302 || cookies.length === 0) {
    throw new Error(`Giriş başarısız (${res.status}); Lighthouse oturumlu sayfaları açamaz.`);
  }
  return cookies.join("; ");
}

async function main() {
  let server: ChildProcess | undefined;
  if (!(await isUp())) {
    console.log(`Sunucu yok: derlenip ${BASE} adresinde açılıyor…`);
    server = startPreview();
    await waitUp(server);
  }
  const debugPort = Number(process.env.LH_CHROME_PORT ?? 9333);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: [`--remote-debugging-port=${debugPort}`],
  });
  mkdirSync(OUT_DIR, { recursive: true });
  const ozet: Record<string, Record<string, number>> = {};
  let basarisiz = false;
  try {
    const cookie = await sessionCookie();
    for (const s of SAYFALAR) {
      // İz kaydı zaman zaman bozulur (NO_NAVSTART): sayfa en çok iki kez yeniden denenir.
      let result: Awaited<ReturnType<typeof lighthouse>>;
      for (let deneme = 0; ; deneme++) {
        result = await lighthouse(
          `${BASE}${s.yol}`,
          {
            port: debugPort,
            output: "html",
            logLevel: "error",
            onlyCategories: [...KATEGORILER],
            extraHeaders: s.oturum ? { Cookie: cookie } : undefined,
          },
          s.masaustu ? desktopConfig : undefined,
        );
        if (!result?.lhr.runtimeError || deneme >= 2) break;
        console.warn(`${s.ad}: ${result.lhr.runtimeError.code}, yeniden deneniyor…`);
      }
      if (!result) throw new Error(`${s.yol}: Lighthouse sonuç vermedi`);
      writeFileSync(`${OUT_DIR}/${s.ad}.html`, result.report as string);
      const puan: Record<string, number> = {};
      for (const k of KATEGORILER)
        puan[k] = Math.round((result.lhr.categories[k]?.score ?? 0) * 100);
      ozet[s.ad] = puan;
      const a11y = result.lhr.categories.accessibility?.score ?? 0;
      if (a11y < ESIK_ERISILEBILIRLIK) {
        basarisiz = true;
        const eksik = Object.values(result.lhr.audits)
          .filter((a) => a.score === 0 && a.scoreDisplayMode === "binary")
          .map((a) => a.id);
        console.error(
          `✗ ${s.ad}: erişilebilirlik ${puan.accessibility} < 95 (${eksik.join(", ")})`,
        );
      }
      console.log(
        `${s.ad.padEnd(18)} perf ${puan.performance}  a11y ${puan.accessibility}  bp ${puan["best-practices"]}  seo ${puan.seo}`,
      );
    }
    writeFileSync(`${OUT_DIR}/ozet.json`, JSON.stringify(ozet, null, 2));
  } finally {
    await browser.close();
    if (server?.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        // kapanmış
      }
    }
  }
  if (basarisiz) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

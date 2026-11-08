import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { chromium, type FullConfig } from "@playwright/test";
import { hesaplar } from "../fixtures/hesaplar";
import { AUTH_STATES, BASE_URL, PERSIST_DIR, PORT } from "./ortam";

/**
 * Uçtan uca testlerden önce bir kez çalışır.
 *
 * 1. Sunucu yoksa: `npm run db:reset:local` mantığıyla ayrı bir yerel durum
 *    klasörünü (`.wrangler/e2e`; geliştirme verisi `.wrangler/state` korunur)
 *    siler, migration'ları uygular ve tohumlar; SONRA `vite preview`'u bu klasörle
 *    başlatır. Sunucu zaten çalışıyorsa (yerelde yeniden kullanım) klasör silinmez,
 *    migration + tohum yeniden uygulanır.
 * 2. `ayse@test.sukano` ile arayüzden giriş yapıp oturumu `storageState` olarak
 *    kaydeder (`tests/e2e/.auth/ayse.json`); testler varsayılan olarak bu
 *    oturumla koşar. İki tarayıcılı testler için Mehmet ve Can'ın oturumları da
 *    kaydedilir (`AUTH_STATES`).
 *
 * `E2E_BASE_URL` ile uzak bir önizlemeye karşı koşulurken tohumlama ve sunucu
 * başlatma atlanır (önizleme veritabanının tohumlanmış olduğu varsayılır).
 */
export default async function globalSetup(_config: FullConfig) {
  let server: ChildProcess | undefined;

  if (!process.env.E2E_BASE_URL) {
    const running = await isUp(BASE_URL);
    if (!running) rmSync(PERSIST_DIR, { recursive: true, force: true });
    prepareDatabase();
    if (!running) {
      server = startPreview();
      await waitUntilUp(BASE_URL, 180_000, server);
    }
  }

  await saveSession();

  return async () => {
    if (server?.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        // süreç zaten kapanmış
      }
    }
  };
}

const childEnv = () => ({ ...process.env, SUKANO_PERSIST_DIR: PERSIST_DIR, WRANGLER_LOG: "error" });

function prepareDatabase() {
  execFileSync(
    "npx",
    ["wrangler", "d1", "migrations", "apply", "sukano", "--local", "--persist-to", PERSIST_DIR],
    { stdio: ["ignore", "ignore", "inherit"], env: childEnv() },
  );
  execFileSync("npx", ["tsx", "scripts/seed.ts", "--sifirla"], {
    stdio: ["ignore", "ignore", "inherit"],
    env: childEnv(),
  });
}

function startPreview(): ChildProcess {
  const child = spawn("npm", ["run", "preview", "--", "--port", String(PORT), "--strictPort"], {
    env: childEnv(),
    stdio: ["ignore", "ignore", "pipe"],
    detached: true, // süreç grubu: kapanışta vite + workerd birlikte sonlanır
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    if (/error/i.test(text) && !/Proxy environment/i.test(text)) process.stderr.write(text);
  });
  return child;
}

async function isUp(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitUntilUp(base: string, timeout: number, child: ChildProcess) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (child.exitCode !== null) throw new Error(`Önizleme sunucusu kapandı (${child.exitCode}).`);
    if (await isUp(base)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Önizleme sunucusu ${timeout / 1000} sn içinde açılmadı: ${base}`);
}

async function saveSession() {
  const browser = await chromium.launch();
  try {
    for (const kisi of Object.keys(AUTH_STATES) as (keyof typeof AUTH_STATES)[]) {
      const { eposta, sifre } = hesaplar[kisi];
      const context = await browser.newContext({ baseURL: BASE_URL, locale: "tr-TR" });
      const page = await context.newPage();
      await page.goto("/giris");
      await page.waitForLoadState("networkidle");
      await page.locator("#eposta").fill(eposta);
      await page.locator("#sifre").fill(sifre);
      await page.getByRole("button", { name: "Giriş yap" }).click();
      await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });
      // PWA kurulum ipucu kapalı sayılır (diğer testlerin altını örtmesin); ipucu testleri
      // (`pwa.spec.ts`) bu kaydı kendisi siler.
      await page.evaluate(() => localStorage.setItem("sukano:kurulum-ipucu", String(Date.now())));
      mkdirSync(dirname(AUTH_STATES[kisi]), { recursive: true });
      await context.storageState({ path: AUTH_STATES[kisi] });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

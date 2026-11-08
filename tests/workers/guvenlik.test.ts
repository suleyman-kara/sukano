import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createDb } from "~/db/client";
import { notes, tasks } from "~/db/schema";
import { NO_SESSION, OFFLINE_SESSION_HEADER } from "~/domain/pwa/offline";
import { API_RATE_LIMIT_MESSAGE } from "~/domain/security/api-limits";
import { personalNotes } from "~/lib/notes.server";
import { get, ORIGIN, postForm, postJson, verifiedUser } from "./kimlik-yardimcilar";
import { cookies, ID, seed, uuid, WEB } from "./proje-yardimcilar";

let jar: Record<"ayse" | "suleyman" | "yabanci", string>;

beforeAll(async () => {
  await seed();
  const c = await cookies("ayse", "suleyman");
  const stranger = await verifiedUser();
  jar = { ...c, yabanci: stranger.cookie };
});

function scriptTags(html: string): string[] {
  return html.match(/<script\b[^>]*>/g) ?? [];
}

describe("güvenlik başlıkları", () => {
  it("HTML yanıtı nonce'lu CSP taşır; her satır içi betik o nonce'u kullanır", async () => {
    const res = await get("/giris");
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy")!;
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src"))!;
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    const html = await res.text();
    const tags = scriptTags(html);
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toContain(`nonce="${nonce}"`);
  });

  it("her istekte farklı nonce üretilir", async () => {
    const a = (await get("/giris")).headers.get("content-security-policy");
    const b = (await get("/giris")).headers.get("content-security-policy");
    expect(a).not.toBe(b);
  });

  it("CSP uygulamanın kendi WebSocket uç noktasına izin verir (http'de ws, https'de wss)", async () => {
    const http = (await get("/giris")).headers.get("content-security-policy")!;
    expect(http).toMatch(/connect-src 'self' ws:\/\/sukano\.test/);
    const https = await exports.default.fetch("https://sukano.test/giris", { redirect: "manual" });
    expect(https.headers.get("content-security-policy")).toMatch(
      /connect-src 'self' wss:\/\/sukano\.test/,
    );
  });

  it("HSTS yalnızca HTTPS yanıtlarda gönderilir", async () => {
    expect((await get("/giris")).headers.get("strict-transport-security")).toBeNull();
    const https = await exports.default.fetch("https://sukano.test/health");
    expect(https.headers.get("strict-transport-security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
  });

  it("HTML, JSON API ve yönlendirme yanıtlarında temel başlıklar var", async () => {
    const responses = [
      await get("/giris"),
      await get("/health"),
      await get("/api/bildirimler", { cookie: jar.ayse }),
      await get("/"), // oturumsuz → /giris yönlendirmesi
    ];
    for (const res of responses) {
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(res.headers.get("permissions-policy")).toContain("camera=()");
      expect(res.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    }
    expect(responses[1]!.headers.get("content-security-policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });

  it("rotanın kendi CSP'si korunur (tek veri yanıtına JSON CSP'si yazılır)", async () => {
    const res = await get("/_root.data", { cookie: jar.ayse });
    expect(res.headers.get("content-security-policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });
});

describe("başka kökenden yazma (CSRF)", () => {
  it("başka kökenden gelen POST hangi rotaya olursa olsun 403 alır", async () => {
    for (const path of ["/api/notlar", "/api/projeler", "/cikis", "/ayarlar", "/api/davetler"]) {
      const res = await postForm(
        path,
        { intent: "x" },
        { cookie: jar.ayse, headers: { origin: "https://kotu.example" } },
      );
      expect(res.status, path).toBe(403);
    }
  });

  it("Origin yoksa Sec-Fetch-Site: cross-site da reddedilir; same-origin geçer", async () => {
    const cross = await exports.default.fetch(`${ORIGIN}/cikis`, {
      method: "POST",
      headers: { "sec-fetch-site": "cross-site", cookie: jar.ayse },
      redirect: "manual",
    });
    expect(cross.status).toBe(403);
    const same = await exports.default.fetch(`${ORIGIN}/health`, {
      method: "GET",
      headers: { origin: "https://kotu.example" },
    });
    expect(same.status).toBe(200);
  });
});

describe("çevrimdışı önbellek oturum işareti", () => {
  it("oturumsuz sayfa 'yok', oturumlu sayfa oturuma özgü anahtar taşır; API işaretlenmez", async () => {
    expect((await get("/giris")).headers.get(OFFLINE_SESSION_HEADER)).toBe(NO_SESSION);
    const page = await get("/", { cookie: jar.ayse });
    expect(page.status).toBe(200);
    const key = page.headers.get(OFFLINE_SESSION_HEADER)!;
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(
      (await get("/_root.data", { cookie: jar.ayse })).headers.get(OFFLINE_SESSION_HEADER),
    ).toBe(key);
    const other = await get("/", { cookie: jar.suleyman });
    expect(other.headers.get(OFFLINE_SESSION_HEADER)).not.toBe(key);
    expect(
      (await get("/api/bildirimler", { cookie: jar.ayse })).headers.get(OFFLINE_SESSION_HEADER),
    ).toBeNull();
    expect((await get("/health")).headers.get(OFFLINE_SESSION_HEADER)).toBeNull();
  });

  it("anahtar oturum çerezini içermez", async () => {
    const key = (await get("/", { cookie: jar.ayse })).headers.get(OFFLINE_SESSION_HEADER)!;
    expect(jar.ayse).not.toContain(key);
  });
});

describe("hız sınırları", () => {
  it("push aboneliği kullanıcı başına dakikada 10: 11. istek 429 ve Türkçe ileti", async () => {
    const { cookie } = await verifiedUser();
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      // Geçersiz gövde de sayılır: sınır gövde doğrulamasından önce.
      last = await postJson("/api/push/abonelik", { endpoint: "x" }, { cookie });
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(last!.headers.get("retry-after")).toBe("60");
    expect(((await last!.json()) as { error: string }).error).toBe(API_RATE_LIMIT_MESSAGE);
  });

  it("dosya yükleme sınırı aşılınca 429 döner ve dosya okunmaz", async () => {
    // Testlerde yükleme sınırı geniş (vitest.workers.config.ts); aşılmış sınır taklit edilir.
    const { cookie } = await verifiedUser();
    const spy = vi
      .spyOn(env.UPLOAD_LIMITER, "limit")
      .mockResolvedValue({ success: false } as RateLimitOutcome);
    try {
      const body = new FormData();
      body.set("dosya", new File([new Uint8Array(4)], "a.txt"));
      const res = await exports.default.fetch(`${ORIGIN}/api/notlar/${uuid()}/ekler`, {
        method: "POST",
        headers: { origin: ORIGIN, cookie },
        body,
      });
      expect(res.status).toBe(429);
      expect(((await res.json()) as { error: string }).error).toBe(API_RATE_LIMIT_MESSAGE);
      expect(spy).toHaveBeenCalledWith({ key: expect.stringMatching(/^yukleme:kullanici:/) });
    } finally {
      spy.mockRestore();
    }
  });

  it("davet kullanıcı başına dakikada 20: 21. davet 429; diğer proje eylemleri sayılmaz", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const res = await postForm(
        `/api/projeler/${WEB}`,
        { intent: "invite", email: `davetli-${i}-${uuid()}@ornek.test`, role: "duzenleyici" },
        { cookie: jar.suleyman },
      );
      statuses.push(res.status);
    }
    expect(statuses[20]).toBe(429);
    expect(statuses.slice(0, 20)).not.toContain(429);
    const other = await postForm(
      `/api/projeler/${WEB}`,
      { intent: "update", name: "Web Sitesi Yenileme" },
      { cookie: jar.suleyman },
    );
    expect(other.status).not.toBe(429);
  });
});

/* ------------------------------------------------------------------ rota denetimi */

type BuildRoute = {
  id: string;
  parentId?: string;
  path?: string;
  index?: boolean;
  module: { loader?: unknown; action?: unknown };
};

/** Oturumsuz açılabilen rotalar; listeye yeni yol eklemek bilinçli bir karar olmalı. */
const PUBLIC_ROUTES = new Set([
  "/giris",
  "/kayit",
  "/dogrula",
  "/sifremi-unuttum",
  "/sifre-sifirla",
  "/dogrula/:token",
  "/cikis",
  "/health",
  "/__test/outbox",
  "/__test/cron",
  "/api/auth/*",
]);

async function appRoutes(): Promise<{ path: string; loader: boolean; action: boolean }[]> {
  const build = (await import("virtual:react-router/server-build")) as unknown as {
    routes: Record<string, BuildRoute>;
  };
  const routes = build.routes;
  const fullPath = (r: BuildRoute): string => {
    const own = r.path ?? "";
    const parent = r.parentId ? routes[r.parentId] : undefined;
    const base = parent ? fullPath(parent) : "";
    return [base, own].filter(Boolean).join("/").replace(/\/+/g, "/");
  };
  return Object.values(routes)
    .filter((r) => r.path !== undefined || r.index)
    .map((r) => ({
      path: `/${fullPath(r)}`.replace(/\/+/g, "/"),
      loader: typeof r.module.loader === "function",
      action: typeof r.module.action === "function",
    }));
}

function concrete(path: string): string {
  return path
    .replace(":projeId", WEB)
    .replace(":token", "jeton")
    .replace(/:id/g, "lansman-hazirligi")
    .replace("*", "bilinmeyen-yol");
}

function expectLoginRedirect(res: Response, label: string) {
  const location = res.headers.get("location") ?? "";
  expect(res.status, label).toBe(302);
  expect(location, label).toMatch(/^\/giris(\?next=|$)/);
}

describe("rota yetki denetimi (tüm rotalar)", () => {
  it("herkese açık rota listesi bilinçli: beklenmeyen açık rota yok", async () => {
    const routes = await appRoutes();
    expect(routes.length).toBeGreaterThan(30);
    const paths = new Set(routes.map((r) => r.path));
    for (const p of PUBLIC_ROUTES) expect(paths.has(p), p).toBe(true);
  });

  it("oturumsuz her korumalı rota GET ve POST'ta (belge ve .data) girişe yönlendirir", async () => {
    const routes = (await appRoutes()).filter((r) => !PUBLIC_ROUTES.has(r.path));
    for (const r of routes) {
      const url = concrete(r.path);
      expectLoginRedirect(await get(url), `GET ${url}`);
      if (r.action) {
        expectLoginRedirect(await postForm(url, { intent: "x" }), `POST ${url}`);
      }
      if (!r.path.startsWith("/api/")) {
        const data = await get(`${url === "/" ? "/_root" : url}.data`);
        // Tek veri isteğinde yönlendirme gövdeye yazılır (durum 202/204/302).
        const body = await data.text();
        expect([202, 204, 302], `GET ${url}.data`).toContain(data.status);
        expect(body + (data.headers.get("location") ?? ""), `GET ${url}.data`).toContain("/giris");
      }
    }
  });

  it("oturumsuz canlı WebSocket yolları 401", async () => {
    for (const path of [
      "/api/notlar/lansman-hazirligi/canli",
      `/api/kanal/proje/${WEB}`,
      "/api/kanal/kisisel",
    ]) {
      const res = await exports.default.fetch(`${ORIGIN}${path}`, {
        headers: { Upgrade: "websocket", origin: ORIGIN },
      });
      expect(res.status, path).toBe(401);
    }
  });

  it("üye olmayan kullanıcı başka alanın kaynaklarını hiçbir API ucunda göremez", async () => {
    const noteId = "lansman-hazirligi";
    const reads = [
      `/api/notlar/${noteId}/surumler`,
      `/api/notlar/${noteId}/gorevler`,
      `/api/notlar/${noteId}/ekler`,
      `/api/projeler/${WEB}`,
      `/api/projeler/${WEB}/uyeler`,
      `/proje/${WEB}`,
      `/proje/${WEB}/not/${noteId}`,
      `/not/market`,
    ];
    for (const path of reads) {
      const res = await get(path, { cookie: jar.yabanci });
      expect([403, 404], path).toContain(res.status);
    }
    const writes: [string, Record<string, string>][] = [
      [`/api/projeler/${WEB}`, { intent: "update", name: "Ele geçirildi" }],
      [`/api/projeler/${WEB}`, { intent: "invite", email: "x@ornek.test", role: "yonetici" }],
      ["/api/notlar", { intent: "trash", id: noteId }],
      ["/api/notlar", { intent: "trash", id: "market" }],
    ];
    for (const [path, fields] of writes) {
      const res = await postForm(path, fields, { cookie: jar.yabanci });
      expect([400, 403, 404], `${path} ${fields.intent}`).toContain(res.status);
    }
    const db = createDb(env.DB);
    const market = await db.select().from(notes).all();
    expect(market.find((n) => n.id === "market")?.trashedAt).toBeNull();
    expect(market.find((n) => n.id === noteId)?.trashedAt).toBeNull();
  });
});

describe("ızgara sorguları", () => {
  it("100'den çok yapılacaklar notu olan ızgara D1 parametre sınırına takılmadan listelenir", async () => {
    const owner = ID.ayse;
    const db = createDb(env.DB);
    const now = new Date();
    const ids: string[] = Array.from({ length: 130 }, () => uuid());
    for (let i = 0; i < ids.length; i += 5) {
      const part = ids.slice(i, i + 5);
      await db.insert(notes).values(
        part.map((id, j) => ({
          id,
          kind: "todo" as const,
          ownerUserId: owner,
          title: `Liste ${i + j}`,
          position: 10_000 + i + j,
          createdBy: owner,
          updatedBy: owner,
          createdAt: now,
          updatedAt: now,
        })),
      );
      await db.insert(tasks).values(
        part.map((noteId) => ({
          id: uuid(),
          noteId,
          title: "Görev",
          position: 1,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
    const list = await personalNotes(env, owner).list("notlar");
    const created = list.filter((n) => ids.includes(n.id));
    expect(created).toHaveLength(130);
    expect(created.every((n) => n.tasks.length === 1)).toBe(true);
  });
});

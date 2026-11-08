/**
 * `public/sw.js` davranışı: sahte `self`, CacheStorage ve ağ içinde çalıştırılır.
 * Çevrimdışı okuma ve oturum yalıtımı (bir oturumun sayfası başka oturuma verilmez).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { NO_SESSION, OFFLINE_SESSION_HEADER, PAGE_CACHE_PREFIX } from "~/domain/pwa/offline";

const ORIGIN = "https://sukano.test";
const SOURCE = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");

/** `type: "basic"` (aynı köken) yanıtı; klonları da öyle kalır. */
class BasicResponse extends Response {
  override get type(): ResponseType {
    return "basic";
  }
  override clone(): Response {
    const c = super.clone();
    Object.setPrototypeOf(c, BasicResponse.prototype);
    return c;
  }
}

type Req = { url: string; method?: string; mode?: string; headers?: Headers };

const keyOf = (r: string | Req | Request) =>
  typeof r === "string" ? new URL(r, ORIGIN).href : new URL(r.url, ORIGIN).href;

class FakeCache {
  entries = new Map<string, Response>();
  async match(r: string | Req) {
    return this.entries.get(keyOf(r))?.clone();
  }
  async put(r: string | Req, res: Response) {
    this.entries.set(keyOf(r), res);
  }
  async add(url: string) {
    this.entries.set(keyOf(url), await net.fetch(url));
  }
  async delete(r: string | Req | Request) {
    return this.entries.delete(keyOf(r));
  }
  async keys() {
    return [...this.entries.keys()].map((url) => ({ url }) as Request);
  }
}

class FakeCaches {
  stores = new Map<string, FakeCache>();
  async open(name: string) {
    let c = this.stores.get(name);
    if (!c) this.stores.set(name, (c = new FakeCache()));
    return c;
  }
  async keys() {
    return [...this.stores.keys()];
  }
  async delete(name: string) {
    return this.stores.delete(name);
  }
  async match(r: string | Req) {
    for (const c of this.stores.values()) {
      const hit = await c.match(r);
      if (hit) return hit;
    }
    return undefined;
  }
  pageCaches() {
    return [...this.stores.keys()].filter((n) => n.startsWith(PAGE_CACHE_PREFIX));
  }
}

/** Sahte ağ: adres → yanıt üreticisi; `online = false` iken her istek düşer. */
const net = {
  online: true,
  calls: [] as string[],
  routes: new Map<string, () => Response>(),
  async fetch(input: string | Req, _init?: RequestInit): Promise<Response> {
    const url = keyOf(input);
    net.calls.push(url);
    if (!net.online) throw new TypeError("Failed to fetch");
    const make = net.routes.get(url);
    return make ? make() : new BasicResponse("yok", { status: 404 });
  },
};

function page(body: string, session: string | null, status = 200) {
  return () =>
    new BasicResponse(body, {
      status,
      headers: {
        "content-type": "text/html",
        ...(session ? { [OFFLINE_SESSION_HEADER]: session } : {}),
      },
    });
}

type Listener = (event: unknown) => void;
let listeners: Map<string, Listener[]>;
let caches: FakeCaches;

function boot() {
  listeners = new Map();
  caches = new FakeCaches();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) =>
      listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    skipWaiting: async () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration: { showNotification: async () => {} },
  };
  new Function("self", "caches", "fetch", SOURCE)(self, caches, net.fetch);
}

async function dispatch(type: string, init: Record<string, unknown>) {
  const waits: Promise<unknown>[] = [];
  let response: Promise<Response> | undefined;
  const event = {
    ...init,
    waitUntil: (p: Promise<unknown>) => waits.push(p),
    respondWith: (p: Promise<Response>) => (response = p),
  };
  for (const fn of listeners.get(type) ?? []) fn(event);
  const res = response ? await response : undefined;
  // waitUntil içindeki işler (yazma, silme) zincirlenebilir: hepsi bitene kadar bekle.
  for (let i = 0; i < waits.length; i++) await waits[i];
  return res;
}

function request(path: string, opts: { method?: string; mode?: string } = {}) {
  return {
    url: new URL(path, ORIGIN).href,
    method: opts.method ?? "GET",
    mode: opts.mode ?? (path.endsWith(".data") ? "cors" : "navigate"),
    headers: new Headers(),
  };
}

const navigate = (path: string, opts?: { method?: string; mode?: string }) =>
  dispatch("fetch", { request: request(path, opts) });

beforeEach(async () => {
  net.online = true;
  net.calls = [];
  net.routes = new Map();
  net.routes.set(
    `${ORIGIN}/cevrimdisi`,
    () => new BasicResponse("çevrimdışı sayfası", { headers: { "content-type": "text/html" } }),
  );
  boot();
  await dispatch("install", {});
  await dispatch("activate", {});
});

describe("service worker çevrimdışı okuma", () => {
  it("sözleşme adları sunucuyla aynı", () => {
    expect(SOURCE).toContain(`"${OFFLINE_SESSION_HEADER}"`);
    expect(SOURCE).toContain(`"${NO_SESSION}"`);
    expect(SOURCE).toContain(`"${PAGE_CACHE_PREFIX}"`);
  });

  it("çevrimiçi açılan sayfa çevrimdışıyken önbellekten gelir", async () => {
    net.routes.set(`${ORIGIN}/not/market`, page("market notu", "aaaa"));
    expect(await (await navigate("/not/market"))!.text()).toBe("market notu");
    net.online = false;
    expect(await (await navigate("/not/market"))!.text()).toBe("market notu");
  });

  it("çevrimdışıyken hiç açılmamış sayfa için çevrimdışı sayfası verilir; veri isteği düşer", async () => {
    net.online = false;
    expect(await (await navigate("/proje/web"))!.text()).toBe("çevrimdışı sayfası");
    const data = await navigate("/proje/web.data");
    expect(data!.type).toBe("error");
  });

  it("tek veri (.data) yanıtları da sorgusuyla önbelleğe girer", async () => {
    net.routes.set(`${ORIGIN}/arsiv.data?_routes=routes%2Farsiv`, page("veri", "aaaa"));
    await navigate("/arsiv.data?_routes=routes%2Farsiv");
    net.online = false;
    expect(await (await navigate("/arsiv.data?_routes=routes%2Farsiv"))!.text()).toBe("veri");
  });

  it("işaretsiz, hatalı ya da yönlendirilmiş yanıt önbelleğe girmez", async () => {
    net.routes.set(`${ORIGIN}/a`, page("a", null));
    net.routes.set(`${ORIGIN}/b`, page("b", "aaaa", 500));
    await navigate("/a");
    await navigate("/b");
    net.online = false;
    expect(await (await navigate("/a"))!.text()).toBe("çevrimdışı sayfası");
    expect(await (await navigate("/b"))!.text()).toBe("çevrimdışı sayfası");
  });

  it("oturumsuz yanıt ('yok') tüm sayfa önbelleklerini siler", async () => {
    net.routes.set(`${ORIGIN}/`, page("notlarım", "aaaa"));
    net.routes.set(`${ORIGIN}/giris`, page("giriş", NO_SESSION));
    await navigate("/");
    expect(caches.pageCaches()).toEqual([`${PAGE_CACHE_PREFIX}aaaa`]);
    await navigate("/giris");
    expect(caches.pageCaches()).toEqual([]);
    net.online = false;
    expect(await (await navigate("/"))!.text()).toBe("çevrimdışı sayfası");
  });

  it("başka oturum görülünce eski oturumun sayfaları silinir ve yeni oturuma verilmez", async () => {
    net.routes.set(`${ORIGIN}/not/gizli`, page("ayşe'nin notu", "aaaa"));
    await navigate("/not/gizli");
    net.routes.set(`${ORIGIN}/`, page("mehmet'in notları", "bbbb"));
    await navigate("/");
    expect(caches.pageCaches()).toEqual([`${PAGE_CACHE_PREFIX}bbbb`]);
    net.online = false;
    expect(await (await navigate("/not/gizli"))!.text()).toBe("çevrimdışı sayfası");
    expect(await (await navigate("/"))!.text()).toBe("mehmet'in notları");
  });

  it("POST /cikis anında sayfa önbelleklerini siler (yanıt beklenmez)", async () => {
    net.routes.set(`${ORIGIN}/`, page("notlarım", "aaaa"));
    await navigate("/");
    const res = await navigate("/cikis", { method: "POST" });
    expect(res).toBeUndefined(); // ağa olduğu gibi gider
    expect(caches.pageCaches()).toEqual([]);
  });

  it("temizle iletisi önbelleği siler", async () => {
    net.routes.set(`${ORIGIN}/`, page("notlarım", "aaaa"));
    await navigate("/");
    await dispatch("message", { data: { type: "temizle" } });
    expect(caches.pageCaches()).toEqual([]);
  });

  it("service worker yeniden başlasa da son oturum anahtarı hatırlanır", async () => {
    net.routes.set(`${ORIGIN}/`, page("notlarım", "aaaa"));
    await navigate("/");
    const kept = caches;
    listeners = new Map();
    const self = {
      location: { origin: ORIGIN },
      addEventListener: (type: string, fn: Listener) =>
        listeners.set(type, [...(listeners.get(type) ?? []), fn]),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    };
    new Function("self", "caches", "fetch", SOURCE)(self, kept, net.fetch);
    net.online = false;
    expect(await (await navigate("/"))!.text()).toBe("notlarım");
  });

  it("en çok 40 sayfa tutulur; en eski açılan düşer", async () => {
    for (let i = 0; i < 42; i++) {
      net.routes.set(`${ORIGIN}/not/n${i}`, page(`not ${i}`, "aaaa"));
      await navigate(`/not/n${i}`);
    }
    const cache = caches.stores.get(`${PAGE_CACHE_PREFIX}aaaa`)!;
    expect(cache.entries.size).toBe(40);
    expect(cache.entries.has(`${ORIGIN}/not/n0`)).toBe(false);
    expect(cache.entries.has(`${ORIGIN}/not/n41`)).toBe(true);
  });

  it("API, WebSocket, test ve sağlık yolları ile başka kökenler hiç ele alınmaz", async () => {
    for (const path of ["/api/notlar", "/api/notlar/x/canli", "/__test/outbox", "/health"]) {
      expect(await navigate(path, { mode: "cors" }), path).toBeUndefined();
    }
    expect(
      await dispatch("fetch", {
        request: { ...request("/"), url: "https://challenges.cloudflare.com/x.js" },
      }),
    ).toBeUndefined();
    expect(await navigate("/api/notlar", { method: "POST" })).toBeUndefined();
  });

  it("derleme dosyaları önce önbellekten verilir (ikinci istek ağa gitmez)", async () => {
    net.routes.set(
      `${ORIGIN}/assets/app-abc.js`,
      () => new BasicResponse("kod", { headers: { "content-type": "text/javascript" } }),
    );
    await navigate("/assets/app-abc.js", { mode: "cors" });
    net.calls = [];
    net.online = false;
    expect(await (await navigate("/assets/app-abc.js", { mode: "cors" }))!.text()).toBe("kod");
    expect(net.calls).toEqual([]);
  });

  it("varliklar iletisi ilk yüklemenin dosyalarını önbelleğe alır; başka kökeni almaz", async () => {
    net.routes.set(`${ORIGIN}/assets/root-1.js`, () => new BasicResponse("kök"));
    await dispatch("message", {
      data: { type: "varliklar", urls: ["/assets/root-1.js", "https://kotu.example/x.js"] },
    });
    const store = caches.stores.get("sukano-statik-v1")!;
    expect(store.entries.has(`${ORIGIN}/assets/root-1.js`)).toBe(true);
    expect(net.calls).not.toContain("https://kotu.example/x.js");
  });

  it("sayfa iletisi belgeyi oturumla alıp saklar; kısa sürede ikinci kez almaz", async () => {
    net.routes.set(`${ORIGIN}/not/market`, page("market", "aaaa"));
    await dispatch("message", { data: { type: "sayfa", url: "/not/market" } });
    await dispatch("message", { data: { type: "sayfa", url: "/not/market" } });
    expect(net.calls.filter((u) => u.endsWith("/not/market"))).toHaveLength(1);
    await dispatch("message", { data: { type: "sayfa", url: "/api/notlar" } });
    expect(net.calls).not.toContain(`${ORIGIN}/api/notlar`);
    net.online = false;
    expect(await (await navigate("/not/market"))!.text()).toBe("market");
  });
});

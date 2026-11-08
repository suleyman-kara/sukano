import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb } from "~/db/client";
import { currentServerTiming, instrumentD1, runWithTiming } from "~/lib/db-timing.server";
import { DB_DELAY_HEADER } from "~/lib/server-timing";
import { get } from "./kimlik-yardimcilar";
import { loginAs, seed, WEB } from "./proje-yardimcilar";

/** `Server-Timing` değerinden sorgu ve tur sayısı. */
function dbOf(res: Response) {
  const value = res.headers.get("server-timing") ?? "";
  const m = /desc="(\d+) sorgu \/ (\d+) tur"/.exec(value);
  return { value, queries: m ? Number(m[1]) : 0, trips: m ? Number(m[2]) : 0 };
}

let cookie = "";
beforeAll(async () => {
  await seed();
  cookie = await loginAs("suleyman");
});

describe("Server-Timing başlığı", () => {
  it("her yanıta toplam süre yazılır", async () => {
    const res = await get("/health");
    expect(res.headers.get("server-timing")).toMatch(/^total;dur=\d/);
  });

  it("oturumlu istekte D1 süresi, sorgu ve tur sayısı yazılır", async () => {
    const res = await get("/arsiv.data?_routes=routes/arsiv", { cookie });
    expect(res.status).toBe(200);
    const db = dbOf(res);
    expect(db.value).toMatch(/^total;dur=[\d.]+, db;dur=[\d.]+;desc="/);
    expect(db.queries).toBeGreaterThan(0);
  });

  it("yapay D1 gecikmesi yerel olmayan adreste yok sayılır", async () => {
    const res = await get("/arsiv.data?_routes=routes/arsiv", {
      cookie,
      headers: { [DB_DELAY_HEADER]: "1500" },
    });
    const total = Number(/total;dur=([\d.]+)/.exec(res.headers.get("server-timing") ?? "")?.[1]);
    expect(total).toBeLessThan(1500);
  });
});

describe("D1 turları (her tur birincil veritabanına bir yolculuk)", () => {
  it("oturum ve kullanıcı tek sorguda okunur", async () => {
    const res = await get("/api/bildirimler?sayi=1", { cookie });
    expect(res.status).toBe(200);
    // Oturum (kullanıcıyla birleşik) + okunmamış sayısı.
    expect(dbOf(res)).toMatchObject({ queries: 2, trips: 2 });
  });

  it("Notlarım ızgarası iki turda yüklenir (oturum + notlar ve kart ayrıntıları)", async () => {
    const res = await get("/_.data?_routes=routes/home", { cookie });
    expect(res.status).toBe(200);
    expect(dbOf(res).trips).toBe(2);
  });

  it("açık not üç turda yüklenir", async () => {
    const res = await get("/not/market.data?_routes=routes/not", { cookie });
    expect(res.status).toBe(200);
    expect(dbOf(res).trips).toBe(3);
  });

  it("proje ızgarası üç turda yüklenir", async () => {
    const res = await get(`/proje/${WEB}.data?_routes=routes/proje`, { cookie });
    expect(res.status).toBe(200);
    expect(dbOf(res).trips).toBe(3);
  });

  it("kabuk verisi (kök loader) not sayılarını okumaz", async () => {
    const res = await get("/_.data?_routes=root", { cookie });
    expect(res.status).toBe(200);
    // Oturum + [projeler, sıra, davetler, bildirimler, tercihler] paralel.
    expect(dbOf(res).trips).toBe(2);
  });
});

describe("D1 ölçüm sarmalayıcısı", () => {
  it("istek kapsamında sorguları, toplu sorguları ve turları sayar", async () => {
    const d1 = instrumentD1(env.DB);
    const value = await runWithTiming(0, async () => {
      await Promise.all([d1.prepare("select 1").first(), d1.prepare("select 2").all()]);
      // Toplu sorguya sarılmış ifadeler verilir; sarmalayıcı asıllarını geçirir.
      await d1.batch([d1.prepare("select 3"), d1.prepare("select 4")]);
      return currentServerTiming();
    });
    expect(value).toMatch(/desc="3 sorgu \/ 2 tur"/);
  });

  it("kapsam dışında ölçüm yapmaz ve sorguyu doğrudan çalıştırır", async () => {
    expect(currentServerTiming()).toBeNull();
    const row = await createDb(env.DB).get<{ n: number }>(sql`select 7 as n`);
    expect(row.n).toBe(7);
  });

  it("aynı bağlama bir kez sarılır ve hazırlanan sorgu bağlanabilir", async () => {
    const wrapped = instrumentD1(env.DB);
    expect(instrumentD1(env.DB)).toBe(wrapped);
    const value = await runWithTiming(5, async () => {
      const r = await wrapped.prepare("select ? as n").bind(3).first<{ n: number }>();
      expect(r?.n).toBe(3);
      await wrapped.exec("select 1");
      return currentServerTiming();
    });
    expect(value).toMatch(/desc="2 sorgu \/ 2 tur"/);
  });
});

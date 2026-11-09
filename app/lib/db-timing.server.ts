import { AsyncLocalStorage } from "node:async_hooks";
import {
  createTiming,
  queryFinished,
  queryStarted,
  serverTimingValue,
  type RequestTiming,
} from "./server-timing";

/**
 * D1 ölçümü: `createDb` her bağlamayı bu sarmalayıcıdan geçirir. İstek kapsamındaki ölçüm
 * (`runWithTiming`) AsyncLocalStorage'da durur; kapsam dışında (zamanlanmış işler, Durable
 * Object'ler, testler) sarmalayıcı doğrudan bağlamayı çağırır, ek iş yapmaz.
 */
const storage = new AsyncLocalStorage<RequestTiming>();

const EXEC = new Set<PropertyKey>(["first", "all", "run", "raw"]);
const rawStatements = new WeakMap<object, D1PreparedStatement>();
const wrapped = new WeakMap<D1Database, D1Database>();

/** İsteği ölçerek çalıştırır; `delayMs` yalnızca yerel ölçüm içindir. */
export function runWithTiming<T>(delayMs: number, fn: (timing: RequestTiming) => T): T {
  const timing = createTiming(Date.now(), delayMs);
  return storage.run(timing, () => fn(timing));
}

/** Kapsamdaki ölçümün `Server-Timing` değeri (kapsam dışında `null`). */
export function currentServerTiming(): string | null {
  const t = storage.getStore();
  return t ? serverTimingValue(t, Date.now()) : null;
}

/**
 * Yerel ölçüm: kapsamdaki yapay gecikmeyle bekler (D1 dışındaki gidişler, ör. Durable
 * Object çağrısı, üretimdeki gibi sürsün). Üretimde ve kapsam dışında hemen döner.
 */
export async function simulatedTrip(factor = 1): Promise<void> {
  const t = storage.getStore();
  if (t && t.delayMs > 0) await new Promise((r) => setTimeout(r, t.delayMs * factor));
}

async function timed<T>(run: () => Promise<T>): Promise<T> {
  const t = storage.getStore();
  if (!t) return run();
  queryStarted(t, Date.now());
  try {
    // Yerel ölçüm: yapay gecikme sorgunun turuna sayılır (üretimdeki gidiş-dönüş gibi).
    if (t.delayMs > 0) await new Promise((r) => setTimeout(r, t.delayMs));
    return await run();
  } finally {
    queryFinished(t, Date.now());
  }
}

function wrapStatement(raw: D1PreparedStatement): D1PreparedStatement {
  const proxy = new Proxy(raw, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop, target);
      if (prop === "bind") {
        return (...values: unknown[]) => wrapStatement(target.bind(...values));
      }
      if (EXEC.has(prop) && typeof value === "function") {
        return (...args: unknown[]) =>
          timed(() => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args));
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  rawStatements.set(proxy, raw);
  return proxy;
}

const unwrap = (s: D1PreparedStatement) => rawStatements.get(s) ?? s;

/** Sorguları sayan ve süresini ölçen D1 sarmalayıcısı (bağlama başına bir kez kurulur). */
export function instrumentD1(d1: D1Database): D1Database {
  const existing = wrapped.get(d1);
  if (existing) return existing;
  const proxy = new Proxy(d1, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop, target);
      if (prop === "prepare") return (sql: string) => wrapStatement(target.prepare(sql));
      if (prop === "batch") {
        return (statements: D1PreparedStatement[]) =>
          timed(() => target.batch(statements.map(unwrap)));
      }
      if (prop === "exec") return (sql: string) => timed(() => target.exec(sql));
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  wrapped.set(d1, proxy);
  return proxy;
}

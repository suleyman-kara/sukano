import { describe, expect, it } from "vitest";
import {
  createTiming,
  parseDelayHeader,
  queryFinished,
  queryStarted,
  serverTimingValue,
} from "~/lib/server-timing";

describe("Server-Timing ölçümü", () => {
  it("sorgu yoksa yalnızca toplam süre yazılır", () => {
    const t = createTiming(1000);
    expect(serverTimingValue(t, 1012.34)).toBe("total;dur=12.3");
  });

  it("paralel sorgular tek tur ve üst üste binmeyen süre sayılır", () => {
    const t = createTiming(0);
    queryStarted(t, 10);
    queryStarted(t, 12);
    queryFinished(t, 40);
    queryFinished(t, 50);
    expect(t).toMatchObject({ queries: 2, trips: 1, dbMs: 40, inflight: 0 });
  });

  it("art arda sorgular ayrı turlar olarak sayılır ve süreleri toplanır", () => {
    const t = createTiming(0);
    queryStarted(t, 0);
    queryFinished(t, 30);
    queryStarted(t, 35);
    queryFinished(t, 70);
    expect(serverTimingValue(t, 80)).toBe('total;dur=80, db;dur=65;desc="2 sorgu / 2 tur"');
  });

  it("fazladan biten sorgu sayacı eksiye düşürmez", () => {
    const t = createTiming(0);
    queryFinished(t, 5);
    expect(t.inflight).toBe(0);
  });

  it("yapay gecikme başlığı yalnızca 0–2000 ms tam sayı kabul eder", () => {
    expect(parseDelayHeader(null)).toBe(0);
    expect(parseDelayHeader("")).toBe(0);
    expect(parseDelayHeader("40")).toBe(40);
    expect(parseDelayHeader("9999")).toBe(2000);
    expect(parseDelayHeader("-5")).toBe(0);
    expect(parseDelayHeader("12.5")).toBe(0);
    expect(parseDelayHeader("abc")).toBe(0);
  });

  it("ölçüm yapay gecikmeyi taşır", () => {
    expect(createTiming(0, 40).delayMs).toBe(40);
    expect(createTiming(0).delayMs).toBe(0);
  });
});

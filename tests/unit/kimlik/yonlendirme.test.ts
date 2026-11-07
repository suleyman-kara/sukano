import { describe, expect, it } from "vitest";
import {
  isAuthPagePath,
  isPublicPath,
  loginPathFor,
  safeNext,
  stripDataSuffix,
} from "~/domain/auth/redirects";

describe("next güvenli yönlendirme", () => {
  it("site içi yolu sorgu ve parçasıyla korur", () => {
    expect(safeNext("/p/abc?gorunum=arsiv#not-1")).toBe("/p/abc?gorunum=arsiv#not-1");
    expect(safeNext("/ayarlar")).toBe("/ayarlar");
  });

  it("boş ya da eksik değerde varsayılana döner", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext(null, "/ayarlar")).toBe("/ayarlar");
  });

  it("başka siteye giden adresleri reddeder", () => {
    for (const bad of [
      "https://kotu.example/",
      "http://kotu.example",
      "//kotu.example/yol",
      "/\\kotu.example",
      "\\\\kotu.example",
      "javascript:alert(1)",
      "data:text/html,<script>",
      "ayarlar",
      " /ayarlar",
      "/%2F%2Fkotu.example",
      "/yol\nSet-Cookie: x=1",
    ]) {
      expect(safeNext(bad), bad).toBe("/");
    }
  });

  it("kimlik sayfalarına geri yönlendirmez (döngü olmasın)", () => {
    expect(safeNext("/giris")).toBe("/");
    expect(safeNext("/kayit?next=/x")).toBe("/");
    expect(safeNext("/dogrula/abc")).toBe("/");
  });

  it("Better Auth ve test uçlarına yönlendirmez", () => {
    expect(safeNext("/api/auth/sign-out")).toBe("/");
    expect(safeNext("/__test/outbox")).toBe("/");
  });

  it("giriş adresini next ile üretir; kök için next eklemez", () => {
    expect(loginPathFor("/")).toBe("/giris");
    expect(loginPathFor("/ayarlar")).toBe("/giris?next=%2Fayarlar");
    expect(loginPathFor("/p/1?x=2")).toBe("/giris?next=%2Fp%2F1%3Fx%3D2");
    expect(loginPathFor("https://kotu.example")).toBe("/giris");
  });
});

describe("herkese açık yollar", () => {
  it("kimlik sayfaları, sağlık ve Better Auth uçları açıktır", () => {
    for (const path of [
      "/giris",
      "/kayit",
      "/dogrula",
      "/dogrula/jeton",
      "/sifremi-unuttum",
      "/sifre-sifirla",
      "/cikis",
      "/health",
      "/api/auth/get-session",
      "/__test/outbox",
    ]) {
      expect(isPublicPath(path), path).toBe(true);
    }
  });

  it("uygulama yolları oturum ister", () => {
    for (const path of [
      "/",
      "/ayarlar",
      "/arsiv",
      "/p/abc",
      "/giris-yap",
      "/apix",
      "/api/notlar",
      "/bilinmeyen",
    ]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });

  it("kimlik sayfalarını ayırt eder", () => {
    expect(isAuthPagePath("/giris")).toBe(true);
    expect(isAuthPagePath("/giris/")).toBe(true);
    expect(isAuthPagePath("/dogrula/abc")).toBe(true);
    expect(isAuthPagePath("/health")).toBe(false);
    expect(isAuthPagePath("/cikis")).toBe(false);
  });

  it("veri isteklerinin .data ekini atar", () => {
    expect(stripDataSuffix("/ayarlar.data")).toBe("/ayarlar");
    expect(stripDataSuffix("/_root.data")).toBe("/");
    expect(stripDataSuffix("/giris")).toBe("/giris");
  });
});

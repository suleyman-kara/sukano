import { describe, expect, it } from "vitest";
import {
  RATE_LIMITED_PATHS,
  RATE_LIMIT_MESSAGE,
  clientIp,
  rateLimitKeys,
} from "~/domain/auth/rate-limit";

describe("hız sınırı anahtarları", () => {
  it("giriş, kayıt, sıfırlama isteği ve doğrulama e-postası sınırlıdır", () => {
    expect(RATE_LIMITED_PATHS).toEqual([
      "/sign-in/email",
      "/sign-up/email",
      "/request-password-reset",
      "/send-verification-email",
    ]);
  });

  it("IP ve e-posta için ayrı anahtar üretir; eylem adını içerir", () => {
    expect(
      rateLimitKeys("/sign-in/email", { ip: "203.0.113.7", email: "Ayse@Test.Sukano " }),
    ).toEqual([
      { limiter: "ip", key: "giris:ip:203.0.113.7" },
      { limiter: "email", key: "giris:eposta:ayse@test.sukano" },
    ]);
    expect(rateLimitKeys("/request-password-reset", { ip: "::1", email: "a@b.co" })).toEqual([
      { limiter: "ip", key: "sifirlama:ip:::1" },
      { limiter: "email", key: "sifirlama:eposta:a@b.co" },
    ]);
  });

  it("e-posta yoksa yalnızca IP anahtarı üretir", () => {
    expect(rateLimitKeys("/sign-up/email", { ip: "198.51.100.1", email: undefined })).toEqual([
      { limiter: "ip", key: "kayit:ip:198.51.100.1" },
    ]);
  });

  it("sınırsız yollar için anahtar üretmez", () => {
    expect(rateLimitKeys("/get-session", { ip: "1.1.1.1", email: "a@b.co" })).toEqual([]);
  });

  it("Türkçe hata metni verir", () => {
    expect(RATE_LIMIT_MESSAGE).toBe(
      "Çok fazla deneme yaptın. Lütfen bir dakika sonra tekrar dene.",
    );
  });
});

describe("istemci IP'si", () => {
  it("önce CF-Connecting-IP başlığını kullanır", () => {
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "10.0.0.1",
    });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("yoksa X-Forwarded-For'un ilk adresini kullanır", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" }))).toBe("10.0.0.1");
  });

  it("hiçbiri yoksa 'bilinmiyor' döner", () => {
    expect(clientIp(new Headers())).toBe("bilinmiyor");
    expect(clientIp(undefined)).toBe("bilinmiyor");
  });
});

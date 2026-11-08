import { describe, expect, it } from "vitest";
import { authErrorMessage } from "~/domain/auth/errors";
import {
  TURNSTILE_TEST_SECRET_PASS,
  TURNSTILE_TEST_SITE_KEY,
  turnstileTestKeyOutcome,
} from "~/domain/auth/turnstile";

describe("kimlik hata metinleri", () => {
  it.each([
    ["INVALID_EMAIL_OR_PASSWORD", "E-posta ya da şifre hatalı."],
    ["EMAIL_NOT_VERIFIED", "E-posta adresin henüz doğrulanmadı."],
    [
      "USER_ALREADY_EXISTS",
      "Bu e-posta adresiyle zaten bir hesap var. Giriş yap ya da şifreni sıfırla.",
    ],
    [
      "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
      "Bu e-posta adresiyle zaten bir hesap var. Giriş yap ya da şifreni sıfırla.",
    ],
    ["PASSWORD_TOO_SHORT", "Şifre en az 8 karakter olmalı."],
    ["PASSWORD_TOO_LONG", "Şifre en fazla 128 karakter olabilir."],
    ["INVALID_EMAIL", "Geçerli bir e-posta adresi yaz."],
    ["INVALID_TOKEN", "Bağlantı geçersiz ya da süresi dolmuş. Yeni bir bağlantı iste."],
    ["TOKEN_EXPIRED", "Bağlantının süresi dolmuş. Yeni bir bağlantı iste."],
    ["INVALID_PASSWORD", "Mevcut şifre hatalı."],
    ["TOO_MANY_REQUESTS", "Çok fazla deneme yaptın. Lütfen bir dakika sonra tekrar dene."],
    ["CAPTCHA_FAILED", "Güvenlik doğrulaması tamamlanamadı. Sayfayı yenileyip tekrar dene."],
  ])("%s → Türkçe", (code, message) => {
    expect(authErrorMessage(code)).toBe(message);
  });

  it("bilinmeyen kod için genel bir mesaj verir", () => {
    expect(authErrorMessage("SOMETHING_ELSE")).toBe("Bir şeyler ters gitti. Lütfen tekrar dene.");
    expect(authErrorMessage(undefined)).toBe("Bir şeyler ters gitti. Lütfen tekrar dene.");
  });
});

describe("Turnstile test anahtarları", () => {
  it("varsayılan site anahtarı Cloudflare'in her zaman geçen test anahtarıdır", () => {
    expect(TURNSTILE_TEST_SITE_KEY).toBe("1x00000000000000000000AA");
  });

  it("her zaman geçen test gizli anahtarı dolu jetonla geçer", () => {
    expect(turnstileTestKeyOutcome(TURNSTILE_TEST_SECRET_PASS, "XXXX.DUMMY.TOKEN.XXXX")).toBe(true);
    expect(turnstileTestKeyOutcome("1x0000000000000000000000000000000AA", "herhangi")).toBe(true);
  });

  it("her zaman başarısız ve 'jeton kullanılmış' test anahtarları reddeder", () => {
    expect(turnstileTestKeyOutcome("2x0000000000000000000000000000000AA", "jeton")).toBe(false);
    expect(turnstileTestKeyOutcome("3x0000000000000000000000000000000AA", "jeton")).toBe(false);
  });

  it("gerçek anahtarlar için karar vermez (Cloudflare'e sorulur)", () => {
    expect(turnstileTestKeyOutcome("0x4AAAAAAAgercek-gizli", "jeton")).toBeNull();
  });
});

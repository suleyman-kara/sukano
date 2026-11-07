import { describe, expect, it } from "vitest";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  isValidEmail,
  normalizeEmail,
  validatePassword,
  validatePasswordPair,
} from "~/domain/auth/rules";

describe("şifre kuralı", () => {
  it("en az 8 karakter ister", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(validatePassword("kitap-2")).toBe("Şifre en az 8 karakter olmalı.");
    expect(validatePassword("kitap-26")).toBeNull();
  });

  it("boş şifre için ayrı mesaj verir", () => {
    expect(validatePassword("")).toBe("Şifre gerekli.");
  });

  it("128 karakterden uzun şifreyi reddeder", () => {
    expect(validatePassword("a".repeat(MAX_PASSWORD_LENGTH))).toBeNull();
    expect(validatePassword("a".repeat(MAX_PASSWORD_LENGTH + 1))).toBe(
      "Şifre en fazla 128 karakter olabilir.",
    );
  });

  it("yalnızca boşluktan oluşan şifreyi kabul etmez", () => {
    expect(validatePassword("        ")).toBe("Şifre yalnızca boşluktan oluşamaz.");
  });

  it("çok yaygın şifreleri zayıf sayar", () => {
    expect(validatePassword("12345678")).toBe("Bu şifre çok yaygın; daha güçlü bir şifre seç.");
    expect(validatePassword("password")).toBe("Bu şifre çok yaygın; daha güçlü bir şifre seç.");
    expect(validatePassword("Sifre123")).toBe("Bu şifre çok yaygın; daha güçlü bir şifre seç.");
    expect(validatePassword("Kitap-Kulubu-26")).toBeNull();
  });

  it("şifre tekrarı aynı değilse hata verir", () => {
    expect(validatePasswordPair("Yeni-sifre-1", "Yeni-sifre-2")).toEqual({
      confirm: "Şifreler aynı değil.",
    });
    expect(validatePasswordPair("kisa", "kisa")).toEqual({
      password: "Şifre en az 8 karakter olmalı.",
    });
    expect(validatePasswordPair("Yeni-sifre-1", "Yeni-sifre-1")).toEqual({});
  });
});

describe("e-posta normalizasyonu", () => {
  it("baştaki ve sondaki boşluğu siler, küçük harfe çevirir", () => {
    expect(normalizeEmail("  Ayse@Test.Sukano ")).toBe("ayse@test.sukano");
  });

  it("Türkçe büyük İ ve I harflerini İngilizce kurallarıyla küçültür", () => {
    // E-posta adresleri ASCII kurallarıyla karşılaştırılır; "İ" noktasız kalmaz.
    expect(normalizeEmail("ILKER@ORNEK.COM")).toBe("ilker@ornek.com");
  });

  it("geçerli adresleri tanır", () => {
    expect(isValidEmail("ayse@test.sukano")).toBe(true);
    expect(isValidEmail("ad.soyad+etiket@ornek.com.tr")).toBe(true);
  });

  it("geçersiz adresleri reddeder", () => {
    for (const bad of [
      "",
      "ayse",
      "ayse@",
      "@ornek.com",
      "ayse@ornek",
      "a b@ornek.com",
      "a@b@c.com",
    ]) {
      expect(isValidEmail(bad), bad).toBe(false);
    }
  });

  it("254 karakterden uzun adresi reddeder", () => {
    expect(isValidEmail(`${"a".repeat(250)}@x.co`)).toBe(false);
  });
});

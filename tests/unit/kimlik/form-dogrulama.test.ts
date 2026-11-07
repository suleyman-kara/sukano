import { describe, expect, it } from "vitest";
import {
  validateChangeEmailForm,
  validateChangePasswordForm,
  validateForgotForm,
  validateLoginForm,
  validateNameForm,
  validateRegisterForm,
  validateResetForm,
} from "~/domain/auth/forms";

describe("giriş formu", () => {
  it("boş alanlar için alan bazında hata verir", () => {
    expect(validateLoginForm({ email: "", password: "" })).toEqual({
      ok: false,
      errors: { email: "E-posta gerekli.", password: "Şifre gerekli." },
    });
  });

  it("geçersiz e-postayı yakalar; şifre uzunluğunu girişte denetlemez", () => {
    expect(validateLoginForm({ email: "ayse", password: "kisa" })).toEqual({
      ok: false,
      errors: { email: "Geçerli bir e-posta adresi yaz." },
    });
  });

  it("geçerli girdiyi normalleştirir", () => {
    expect(validateLoginForm({ email: " Ayse@Test.Sukano", password: "Test1234!" })).toEqual({
      ok: true,
      value: { email: "ayse@test.sukano", password: "Test1234!" },
    });
  });
});

describe("kayıt formu", () => {
  it("ad, e-posta ve şifre kurallarını uygular", () => {
    expect(validateRegisterForm({ name: " ", email: "x@", password: "1234" })).toEqual({
      ok: false,
      errors: {
        name: "Adını yaz.",
        email: "Geçerli bir e-posta adresi yaz.",
        password: "Şifre en az 8 karakter olmalı.",
      },
    });
  });

  it("çok uzun adı reddeder", () => {
    const r = validateRegisterForm({
      name: "a".repeat(81),
      email: "a@b.co",
      password: "Test1234!",
    });
    expect(r).toEqual({ ok: false, errors: { name: "Ad en fazla 80 karakter olabilir." } });
  });

  it("geçerli girdiyi kırpar ve normalleştirir", () => {
    expect(
      validateRegisterForm({
        name: "  Deniz  Yılmaz ",
        email: "Deniz@Ornek.com",
        password: "Guclu-sifre1",
      }),
    ).toEqual({
      ok: true,
      value: { name: "Deniz Yılmaz", email: "deniz@ornek.com", password: "Guclu-sifre1" },
    });
  });
});

describe("şifremi unuttum ve sıfırlama formları", () => {
  it("şifremi unuttum yalnızca e-posta ister", () => {
    expect(validateForgotForm({ email: "" })).toEqual({
      ok: false,
      errors: { email: "E-posta gerekli." },
    });
    expect(validateForgotForm({ email: "A@B.co" })).toEqual({
      ok: true,
      value: { email: "a@b.co" },
    });
  });

  it("sıfırlama iki şifrenin aynı olmasını ister", () => {
    expect(validateResetForm({ password: "Yeni-sifre-1", confirm: "Yeni-sifre-2" })).toEqual({
      ok: false,
      errors: { confirm: "Şifreler aynı değil." },
    });
    expect(validateResetForm({ password: "Yeni-sifre-1", confirm: "Yeni-sifre-1" })).toEqual({
      ok: true,
      value: { password: "Yeni-sifre-1" },
    });
  });
});

describe("ayarlar formları", () => {
  it("ad değişikliği boş olamaz", () => {
    expect(validateNameForm({ name: "" })).toEqual({ ok: false, errors: { name: "Adını yaz." } });
    expect(validateNameForm({ name: " Ayşe  Demir " })).toEqual({
      ok: true,
      value: { name: "Ayşe Demir" },
    });
  });

  it("e-posta değişikliği yeni adres ve şifre ister; aynı adresi reddeder", () => {
    expect(validateChangeEmailForm({ email: "", password: "" }, "ayse@test.sukano")).toEqual({
      ok: false,
      errors: { email: "E-posta gerekli.", password: "Şifre gerekli." },
    });
    expect(
      validateChangeEmailForm({ email: "AYSE@test.sukano", password: "x" }, "ayse@test.sukano"),
    ).toEqual({ ok: false, errors: { email: "Yeni adres şu anki adresinle aynı." } });
    expect(
      validateChangeEmailForm({ email: "Yeni@Ornek.com", password: "x" }, "ayse@test.sukano"),
    ).toEqual({ ok: true, value: { email: "yeni@ornek.com", password: "x" } });
  });

  it("şifre değişikliği mevcut şifreyi ve eşleşen yeni şifreyi ister", () => {
    expect(
      validateChangePasswordForm({
        current: "",
        password: "Yeni-sifre-1",
        confirm: "Yeni-sifre-2",
      }),
    ).toEqual({
      ok: false,
      errors: { current: "Mevcut şifreni yaz.", confirm: "Şifreler aynı değil." },
    });
    expect(
      validateChangePasswordForm({
        current: "Eski-1234",
        password: "Eski-1234",
        confirm: "Eski-1234",
      }),
    ).toEqual({ ok: false, errors: { password: "Yeni şifre eskisiyle aynı olamaz." } });
    expect(
      validateChangePasswordForm({
        current: "Eski-1234",
        password: "Yeni-sifre-1",
        confirm: "Yeni-sifre-1",
      }),
    ).toEqual({ ok: true, value: { current: "Eski-1234", password: "Yeni-sifre-1" } });
  });
});

import { describe, expect, it } from "vitest";
import {
  isLocalUrl,
  readVerificationToken,
  resetLink,
  verificationLink,
} from "~/domain/auth/links";

function jwt(payload: object) {
  const b64 = (o: object) =>
    btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.imza`;
}

describe("doğrulama bağlantıları", () => {
  it("Better Auth bağlantısını /dogrula/:jeton sayfasına çevirir; callbackURL next olur", () => {
    expect(
      verificationLink(
        "https://sukano.app/api/auth/verify-email?token=abc.def.ghi&callbackURL=%2Fayarlar",
        "abc.def.ghi",
      ),
    ).toBe("https://sukano.app/dogrula/abc.def.ghi?next=%2Fayarlar");
  });

  it("callbackURL kök ya da güvensizse next eklemez", () => {
    expect(
      verificationLink("http://localhost:5173/api/auth/verify-email?token=t&callbackURL=%2F", "t"),
    ).toBe("http://localhost:5173/dogrula/t");
    expect(
      verificationLink(
        "http://localhost:5173/api/auth/verify-email?token=t&callbackURL=https%3A%2F%2Fkotu.example",
        "t",
      ),
    ).toBe("http://localhost:5173/dogrula/t");
  });

  it("sıfırlama bağlantısı /sifre-sifirla?token= biçimindedir", () => {
    expect(resetLink("https://sukano.app/api/auth/reset-password/x?callbackURL=", "x y")).toBe(
      "https://sukano.app/sifre-sifirla?token=x+y",
    );
  });

  it("jetonun içeriğini (imzayı denetlemeden) okur", () => {
    expect(
      readVerificationToken(
        jwt({
          email: "ayse@test.sukano",
          updateTo: "yeni@ornek.com",
          requestType: "change-email-verification",
        }),
      ),
    ).toEqual({
      email: "ayse@test.sukano",
      updateTo: "yeni@ornek.com",
      requestType: "change-email-verification",
    });
    expect(readVerificationToken(jwt({ email: "a@b.co" }))).toEqual({ email: "a@b.co" });
  });

  it("bozuk jetonda null döner", () => {
    expect(readVerificationToken("bozuk")).toBeNull();
    expect(readVerificationToken("a.%%%.c")).toBeNull();
    expect(readVerificationToken(jwt({ email: 5 }))).toBeNull();
  });
});

describe("yerel adres", () => {
  it("localhost ve geri döngü adreslerini yerel sayar", () => {
    expect(isLocalUrl("http://localhost:5173")).toBe(true);
    expect(isLocalUrl("http://127.0.0.1:4173")).toBe(true);
    expect(isLocalUrl("http://[::1]:4173")).toBe(true);
  });

  it("gerçek alan adlarını, boş ve bozuk değerleri yerel saymaz", () => {
    expect(isLocalUrl("https://sukano.app")).toBe(false);
    expect(isLocalUrl("https://localhost.kotu.example")).toBe(false);
    expect(isLocalUrl(undefined)).toBe(false);
    expect(isLocalUrl("bozuk")).toBe(false);
  });
});

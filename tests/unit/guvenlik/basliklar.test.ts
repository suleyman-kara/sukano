import { describe, expect, it } from "vitest";
import { API_LIMIT_BINDINGS, apiLimitKey } from "~/domain/security/api-limits";
import {
  createNonce,
  documentCsp,
  isCrossOriginWrite,
  isUnsafeMethod,
  JSON_CSP,
  securityHeaders,
} from "~/domain/security/headers";

const directive = (csp: string, name: string) =>
  csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `) || d === name);

describe("belge CSP'si", () => {
  it("betikler yalnızca nonce ve strict-dynamic ile çalışır; satır içi betik açık değil", () => {
    const csp = documentCsp({ nonce: "abc", origin: "https://sukano.app" });
    const script = directive(csp, "script-src")!;
    expect(script).toContain("'nonce-abc'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("https kökeninde wss WebSocket'ine ve Turnstile'a bağlanılabilir; güvensiz istekler yükseltilir", () => {
    const csp = documentCsp({ nonce: "n", origin: "https://sukano.app" });
    expect(directive(csp, "connect-src")).toBe(
      "connect-src 'self' wss://sukano.app https://challenges.cloudflare.com",
    );
    expect(directive(csp, "upgrade-insecure-requests")).toBeDefined();
  });

  it("http kökeninde (yerel) ws kullanılır, yükseltme yok; port korunur", () => {
    const csp = documentCsp({ nonce: "n", origin: "http://localhost:4173" });
    expect(directive(csp, "connect-src")).toContain("ws://localhost:4173");
    expect(directive(csp, "upgrade-insecure-requests")).toBeUndefined();
  });

  it("çerçeveye alınamaz, eklenti ve base etiketi kapalı, formlar yalnızca kendine ve Google'a gider", () => {
    const csp = documentCsp({ nonce: "n", origin: "https://sukano.app" });
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "form-action")).toBe("form-action 'self' https://accounts.google.com");
    expect(directive(csp, "frame-src")).toBe("frame-src https://challenges.cloudflare.com");
  });
});

describe("güvenlik başlıkları", () => {
  it("HTML yanıtına nonce'lu CSP, https'de HSTS eklenir", () => {
    const h = new Map(
      securityHeaders("text/html; charset=utf-8", { url: "https://sukano.app/", nonce: "xyz" }),
    );
    expect(h.get("Content-Security-Policy")).toContain("'nonce-xyz'");
    expect(h.get("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
    expect(h.get("X-Frame-Options")).toBe("DENY");
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("Permissions-Policy")).toContain("microphone=()");
  });

  it("nonce yoksa (geliştirme) HTML'e CSP yazılmaz; http'de HSTS yok", () => {
    const h = new Map(securityHeaders("text/html", { url: "http://localhost:5173/" }));
    expect(h.has("Content-Security-Policy")).toBe(false);
    expect(h.has("Strict-Transport-Security")).toBe(false);
  });

  it("JSON ve tek veri yanıtları hiçbir şey yükleyemeyen CSP alır; dosyalar almaz", () => {
    expect(
      new Map(securityHeaders("application/json", { url: "https://a.b/" })).get(
        "Content-Security-Policy",
      ),
    ).toBe(JSON_CSP);
    expect(
      new Map(securityHeaders("text/x-script", { url: "https://a.b/" })).get(
        "Content-Security-Policy",
      ),
    ).toBe(JSON_CSP);
    expect(
      new Map(securityHeaders("application/pdf", { url: "https://a.b/" })).has(
        "Content-Security-Policy",
      ),
    ).toBe(false);
    expect(
      new Map(securityHeaders(null, { url: "https://a.b/" })).has("Content-Security-Policy"),
    ).toBe(false);
  });

  it("nonce her çağrıda farklı, 128 bit base64", () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(atob(a)).toHaveLength(16);
    expect(createNonce(new Uint8Array([0, 255]))).toBe("AP8=");
  });
});

describe("başka kökenden yazma", () => {
  const req = (method: string, headers: Record<string, string> = {}) => ({
    method,
    url: "https://sukano.app/api/notlar",
    headers: new Headers(headers),
  });

  it("GET, HEAD ve OPTIONS güvenli sayılır", () => {
    expect(isUnsafeMethod("get")).toBe(false);
    expect(isUnsafeMethod("HEAD")).toBe(false);
    expect(isUnsafeMethod("OPTIONS")).toBe(false);
    expect(isUnsafeMethod("DELETE")).toBe(true);
    expect(isCrossOriginWrite(req("GET", { origin: "https://kotu.example" }))).toBe(false);
  });

  it("farklı Origin ya da 'null' köken reddedilir; aynı köken geçer", () => {
    expect(isCrossOriginWrite(req("POST", { origin: "https://kotu.example" }))).toBe(true);
    expect(isCrossOriginWrite(req("POST", { origin: "null" }))).toBe(true);
    expect(isCrossOriginWrite(req("POST", { origin: "https://sukano.app" }))).toBe(false);
  });

  it("Origin yoksa Sec-Fetch-Site'a bakılır; ikisi de yoksa geçer", () => {
    expect(isCrossOriginWrite(req("POST", { "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(isCrossOriginWrite(req("POST", { "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(isCrossOriginWrite(req("POST"))).toBe(false);
  });
});

describe("API hız sınırı anahtarları", () => {
  it("anahtar eylem ve kullanıcıya göre ayrılır; her eylemin binding'i var", () => {
    expect(apiLimitKey("yukleme", "u1")).toBe("yukleme:kullanici:u1");
    expect(apiLimitKey("davet", "u1")).not.toBe(apiLimitKey("push", "u1"));
    expect(API_LIMIT_BINDINGS).toEqual({
      yukleme: "UPLOAD_LIMITER",
      davet: "INVITE_LIMITER",
      push: "PUSH_LIMITER",
    });
  });
});

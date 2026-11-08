import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GET /health", () => {
  it("200 ve { ok: true } döner", async () => {
    const response = await exports.default.fetch("http://sukano.test/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("yanıt önbelleğe alınmaz", async () => {
    const response = await exports.default.fetch("http://sukano.test/health");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

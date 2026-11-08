import { describe, expect, it } from "vitest";
import {
  base64UrlDecode,
  base64UrlEncode,
  buildPushRequest,
  encryptPushPayload,
  vapidAuthorization,
  vapidJwt,
  VAPID_TTL_SECONDS,
} from "~/domain/notifications/web-push";

/** RFC 8291 Ek A: örnek şifreleme. */
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPublic:
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

/** Yalnızca testler için üretilmiş VAPID anahtarı. */
const VAPID = {
  publicKey:
    "BHzRFatmnMCE8yZma0Hqe2pnc5YSVYYkt117QNbqC2AL0xeaz7vHyTDr7XX_X05VCSQB8lE9ao3YhoiMc6WkIlg",
  privateKey: "sus2EkCSy8NOF2bejjs49IAU4O5UVQiWmsKT3Zcs-Kc",
  subject: "mailto:bildirim@sukano.app",
};

const decodeJson = (part: string) =>
  JSON.parse(new TextDecoder().decode(base64UrlDecode(part))) as Record<string, unknown>;

describe("base64url", () => {
  it("dolgusuz ve URL güvenli kodlar, geri çözer", () => {
    const data = new Uint8Array([251, 255, 191, 0, 1]);
    expect(base64UrlEncode(data)).toBe("-_-_AAE");
    expect([...base64UrlDecode("-_-_AAE")]).toEqual([...data]);
  });
});

describe("aes128gcm yük şifreleme", () => {
  it("RFC 8291 örneğindeki gövdeyi bayt bayt üretir", async () => {
    const body = await encryptPushPayload(
      new TextEncoder().encode(RFC.plaintext),
      { p256dh: RFC.uaPublic, auth: RFC.authSecret },
      {
        salt: base64UrlDecode(RFC.salt),
        serverKeys: { publicKey: RFC.asPublic, privateKey: RFC.asPrivate },
      },
    );
    expect(base64UrlEncode(body)).toBe(RFC.body);
  });

  it("rastgele anahtar ve tuzla her ileti farklıdır, başlık RFC 8188 biçimindedir", async () => {
    const keys = { p256dh: RFC.uaPublic, auth: RFC.authSecret };
    const a = await encryptPushPayload(new TextEncoder().encode("merhaba"), keys);
    const b = await encryptPushPayload(new TextEncoder().encode("merhaba"), keys);
    expect(base64UrlEncode(a)).not.toBe(base64UrlEncode(b));
    expect(new DataView(a.buffer).getUint32(16)).toBe(4096);
    expect(a[20]).toBe(65);
    expect(a[21]).toBe(4);
    // 16 tuz + 4 rs + 1 idlen + 65 anahtar + (7 metin + 1 ayırıcı + 16 etiket)
    expect(a.length).toBe(86 + 24);
  });

  it("tarayıcı anahtarıyla çözülebilir (gidiş-dönüş)", async () => {
    const plaintext = JSON.stringify({ title: "Hatırlatıcı: Market", url: "/not/1" });
    const body = await encryptPushPayload(new TextEncoder().encode(plaintext), {
      p256dh: RFC.uaPublic,
      auth: RFC.authSecret,
    });
    expect(await decryptForTest(body)).toBe(plaintext);
  });

  it("kayıt boyutunu aşan yük reddedilir", async () => {
    await expect(
      encryptPushPayload(
        new Uint8Array(5000),
        { p256dh: RFC.uaPublic, auth: RFC.authSecret },
        { recordSize: 4096 },
      ),
    ).rejects.toThrow("çok büyük");
  });

  it("geçersiz genel anahtar reddedilir", async () => {
    await expect(
      encryptPushPayload(
        new Uint8Array(4),
        { p256dh: RFC.uaPublic, auth: RFC.authSecret },
        { serverKeys: { publicKey: "AAAA", privateKey: RFC.asPrivate } },
      ),
    ).rejects.toThrow("Geçersiz");
  });
});

describe("VAPID JWT", () => {
  it("ES256 başlığı, uç noktanın kökeni, 24 saatten kısa süre ve iletişim adresi taşır", async () => {
    const jwt = await vapidJwt(VAPID, "https://fcm.googleapis.com", 1_800_000_000);
    const [header, claims, signature] = jwt.split(".");
    expect(decodeJson(header!)).toEqual({ typ: "JWT", alg: "ES256" });
    expect(decodeJson(claims!)).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: 1_800_000_000 + VAPID_TTL_SECONDS,
      sub: "mailto:bildirim@sukano.app",
    });
    expect(VAPID_TTL_SECONDS).toBeLessThanOrEqual(24 * 60 * 60);
    expect(base64UrlDecode(signature!)).toHaveLength(64);
  });

  it("imza genel anahtarla doğrulanır", async () => {
    const jwt = await vapidJwt(VAPID, "https://push.example");
    const [header, claims, signature] = jwt.split(".");
    const raw = base64UrlDecode(VAPID.publicKey);
    const key = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      base64UrlDecode(signature!),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(ok).toBe(true);
  });

  it("Authorization başlığı vapid t=…, k=… biçimindedir ve aud yalnızca kökendir", async () => {
    const value = await vapidAuthorization(VAPID, "https://push.example/abc/def?x=1");
    expect(value).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    expect(value.endsWith(`k=${VAPID.publicKey}`)).toBe(true);
    const claims = decodeJson(value.slice(8).split(",")[0]!.split(".")[1]!);
    expect(claims.aud).toBe("https://push.example");
  });
});

describe("push isteği", () => {
  it("şifreli gövde ve gerekli başlıklarla POST isteği kurar", async () => {
    const { url, init } = await buildPushRequest(
      { endpoint: "https://push.example/s/1", p256dh: RFC.uaPublic, auth: RFC.authSecret },
      { title: "Merhaba" },
      VAPID,
      { ttl: 60, urgency: "high", topic: "hatirlatici" },
    );
    expect(url).toBe("https://push.example/s/1");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers.TTL).toBe("60");
    expect(headers.Urgency).toBe("high");
    expect(headers.Topic).toBe("hatirlatici");
    expect(headers.Authorization).toMatch(/^vapid /);
    expect(await decryptForTest(init.body as Uint8Array)).toBe('{"title":"Merhaba"}');
  });

  it("varsayılan TTL bir gün, aciliyet normaldir", async () => {
    const { init } = await buildPushRequest(
      { endpoint: "https://push.example/s/1", p256dh: RFC.uaPublic, auth: RFC.authSecret },
      {},
      VAPID,
    );
    const headers = init.headers as Record<string, string>;
    expect(headers.TTL).toBe("86400");
    expect(headers.Urgency).toBe("normal");
    expect(headers.Topic).toBeUndefined();
  });
});

/** Tarayıcı tarafı: RFC 8291 örneğindeki kullanıcı aracısı anahtarıyla çözer. */
async function decryptForTest(body: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16);
  const idlen = body[20]!;
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  const ua = base64UrlDecode(RFC.uaPublic);
  const priv = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: base64UrlEncode(ua.slice(1, 33)),
      y: base64UrlEncode(ua.slice(33)),
      d: RFC.uaPrivate,
    },
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const asKey = await crypto.subtle.importKey(
    "raw",
    asPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const secret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, priv, 256),
  );
  const hmac = async (key: Uint8Array, data: Uint8Array) => {
    const k = await crypto.subtle.importKey(
      "raw",
      key as Uint8Array<ArrayBuffer>,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    return new Uint8Array(await crypto.subtle.sign("HMAC", k, data as Uint8Array<ArrayBuffer>));
  };
  const enc = new TextEncoder();
  const cat = (...p: Uint8Array[]) => {
    const out = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of p) {
      out.set(x, o);
      o += x.length;
    }
    return out;
  };
  const z = new Uint8Array([0]);
  const one = new Uint8Array([1]);
  const auth = base64UrlDecode(RFC.authSecret);
  const prkKey = await hmac(auth, secret);
  const ikm = await hmac(prkKey, cat(enc.encode("WebPush: info"), z, ua, asPublic, one));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode("Content-Encoding: aes128gcm"), z, one))).slice(
    0,
    16,
  );
  const nonce = (await hmac(prk, cat(enc.encode("Content-Encoding: nonce"), z, one))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext),
  );
  expect(plain.at(-1)).toBe(2);
  return new TextDecoder().decode(plain.slice(0, -1));
}

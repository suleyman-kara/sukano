/**
 * Web Push (RFC 8030) yalnızca WebCrypto ile: Workers'ta (workerd) ve tarayıcıda çalışır,
 * Node'a özgü kitaplık gerektirmez.
 *
 * - **VAPID** (RFC 8292): ES256 imzalı JWT (`aud` = uç noktanın kökeni, `exp` ≤ 24 sa,
 *   `sub` = iletişim adresi); başlık `Authorization: vapid t=<jwt>, k=<genel anahtar>`.
 * - **Yük şifreleme** (RFC 8291, `Content-Encoding: aes128gcm`, RFC 8188): geçici ECDH
 *   anahtarı + aboneliğin `p256dh` ve `auth` değerleriyle HKDF; tek kayıt, dolgu yok.
 *
 * Anahtar biçimleri `web-push` aracıyla aynıdır: genel anahtar 65 baytlık sıkıştırılmamış
 * P-256 noktası, özel anahtar 32 baytlık `d`; ikisi de base64url.
 */

type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Bytes {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function concatBytes(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const bytes = (data: ArrayBuffer): Bytes => new Uint8Array(data);

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Bytes> {
  const k = await crypto.subtle.importKey(
    "raw",
    concatBytes(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytes(await crypto.subtle.sign("HMAC", k, concatBytes(data)));
}

/** 65 baytlık sıkıştırılmamış noktadan JWK `x` / `y`. */
function pointToJwk(publicRaw: Uint8Array) {
  if (publicRaw.length !== 65 || publicRaw[0] !== 0x04) {
    throw new Error("Geçersiz P-256 genel anahtarı");
  }
  return {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(publicRaw.slice(1, 33)),
    y: base64UrlEncode(publicRaw.slice(33, 65)),
  };
}

function importPrivate(
  publicKey: string,
  privateKey: string,
  algorithm: "ECDSA" | "ECDH",
): Promise<CryptoKey> {
  const jwk: JsonWebKey = {
    ...pointToJwk(base64UrlDecode(publicKey)),
    d: privateKey,
    ext: true,
  };
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: algorithm, namedCurve: "P-256" },
    false,
    algorithm === "ECDSA" ? ["sign"] : ["deriveBits"],
  );
}

/* ------------------------------------------------------------------ */
/* VAPID                                                               */
/* ------------------------------------------------------------------ */

export type VapidKeys = {
  /** base64url, 65 bayt. */
  publicKey: string;
  /** base64url, 32 bayt (`d`). */
  privateKey: string;
  /** `mailto:` ya da `https:` iletişim adresi. */
  subject: string;
};

/** VAPID JWT'sinin en uzun geçerliliği (RFC 8292: 24 saati geçmemeli). */
export const VAPID_TTL_SECONDS = 12 * 60 * 60;

/** ES256 imzalı VAPID JWT'si. `audience` = abonelik uç noktasının kökeni. */
export async function vapidJwt(
  keys: VapidKeys,
  audience: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(
    encoder.encode(
      JSON.stringify({ aud: audience, exp: nowSeconds + VAPID_TTL_SECONDS, sub: keys.subject }),
    ),
  );
  const input = `${header}.${claims}`;
  const key = await importPrivate(keys.publicKey, keys.privateKey, "ECDSA");
  // WebCrypto ECDSA imzası zaten JOSE'nin istediği r || s (64 bayt) biçimindedir.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(input),
  );
  return `${input}.${base64UrlEncode(bytes(signature))}`;
}

/** `Authorization` başlığının değeri. */
export async function vapidAuthorization(
  keys: VapidKeys,
  endpoint: string,
  nowSeconds?: number,
): Promise<string> {
  const jwt = await vapidJwt(keys, new URL(endpoint).origin, nowSeconds);
  return `vapid t=${jwt}, k=${keys.publicKey}`;
}

/* ------------------------------------------------------------------ */
/* aes128gcm yük şifreleme                                             */
/* ------------------------------------------------------------------ */

export type PushSubscriptionKeys = {
  /** Tarayıcının (kullanıcı aracısı) genel anahtarı, base64url. */
  p256dh: string;
  /** 16 baytlık kimlik doğrulama sırrı, base64url. */
  auth: string;
};

export type EncryptOptions = {
  /** Test için sabit tuz (16 bayt); yoksa rastgele. */
  salt?: Uint8Array;
  /** Test için sabit geçici sunucu anahtarı; yoksa her iletide yeni üretilir. */
  serverKeys?: { publicKey: string; privateKey: string };
  /** Kayıt boyutu (RFC 8188 `rs`); varsayılan 4096. */
  recordSize?: number;
};

const label = (text: string) => concatBytes(encoder.encode(text), new Uint8Array([0]));

/**
 * RFC 8291 şifrelemesi; dönen bayt dizisi doğrudan istek gövdesidir
 * (`salt || rs || idlen || keyid || şifreli metin`).
 */
export async function encryptPushPayload(
  plaintext: Uint8Array,
  subscription: PushSubscriptionKeys,
  options: EncryptOptions = {},
): Promise<Bytes> {
  const uaPublic = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);
  const salt = options.salt
    ? concatBytes(options.salt)
    : crypto.getRandomValues(new Uint8Array(16));
  const recordSize = options.recordSize ?? 4096;
  if (plaintext.length + 1 + 16 > recordSize) throw new Error("Bildirim yükü çok büyük");

  let asPrivate: CryptoKey;
  let asPublic: Bytes;
  if (options.serverKeys) {
    asPrivate = await importPrivate(
      options.serverKeys.publicKey,
      options.serverKeys.privateKey,
      "ECDH",
    );
    asPublic = base64UrlDecode(options.serverKeys.publicKey);
  } else {
    const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair;
    asPrivate = pair.privateKey;
    asPublic = bytes((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  }

  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = bytes(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asPrivate, 256),
  );

  // RFC 8291 §3.4: IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0 || ua || as, 32)
  const prkKey = await hmac(authSecret, ecdhSecret);
  const keyInfo = concatBytes(label("WebPush: info"), uaPublic, asPublic, new Uint8Array([1]));
  const ikm = await hmac(prkKey, keyInfo);
  // RFC 8188 §2.2: CEK ve NONCE.
  const prk = await hmac(salt, ikm);
  const one = new Uint8Array([1]);
  const cek = (await hmac(prk, concatBytes(label("Content-Encoding: aes128gcm"), one))).slice(
    0,
    16,
  );
  const nonce = (await hmac(prk, concatBytes(label("Content-Encoding: nonce"), one))).slice(0, 12);

  // Tek (son) kayıt: düz metin || 0x02 ayırıcı, dolgu yok.
  const record = concatBytes(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = bytes(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record),
  );

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concatBytes(header, ciphertext);
}

/* ------------------------------------------------------------------ */
/* İstek                                                               */
/* ------------------------------------------------------------------ */

export type PushTarget = PushSubscriptionKeys & { endpoint: string };

export type PushRequestOptions = {
  /** Push hizmetinin iletiyi saklayacağı en uzun süre (sn). */
  ttl?: number;
  urgency?: "very-low" | "low" | "normal" | "high";
  /** Aynı konudaki bekleyen ileti yenisiyle değişir (≤ 32 base64url karakter). */
  topic?: string;
  nowSeconds?: number;
  encrypt?: EncryptOptions;
};

/** Push hizmetine gidecek `fetch` isteği. */
export async function buildPushRequest(
  target: PushTarget,
  payload: unknown,
  keys: VapidKeys,
  options: PushRequestOptions = {},
): Promise<{ url: string; init: RequestInit }> {
  const body = await encryptPushPayload(
    encoder.encode(JSON.stringify(payload)),
    target,
    options.encrypt,
  );
  const headers: Record<string, string> = {
    Authorization: await vapidAuthorization(keys, target.endpoint, options.nowSeconds),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(options.ttl ?? 24 * 60 * 60),
    Urgency: options.urgency ?? "normal",
  };
  if (options.topic) headers.Topic = options.topic;
  return { url: target.endpoint, init: { method: "POST", headers, body } };
}

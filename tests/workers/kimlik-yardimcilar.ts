import { exports } from "cloudflare:workers";
import { getOutbox, type OutboxEntry } from "~/lib/email.server";

export const ORIGIN = "http://sukano.test";
export const TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

let ipCounter = 0;
/** Her çağrıda farklı bir IP: testler birbirinin hız sınırı sayacını doldurmaz. */
export function freshIp(): string {
  ipCounter += 1;
  return `198.51.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

let emailCounter = 0;
export function freshEmail(prefix = "kisi"): string {
  emailCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${emailCounter}@ornek.test`;
}

type RequestOptions = { cookie?: string; ip?: string; headers?: Record<string, string> };

function baseHeaders({ cookie, ip, headers }: RequestOptions): Headers {
  const h = new Headers(headers);
  if (!h.has("origin")) h.set("origin", ORIGIN);
  h.set("cf-connecting-ip", ip ?? "203.0.113.1");
  if (cookie) h.set("cookie", cookie);
  return h;
}

export function get(path: string, options: RequestOptions = {}) {
  return exports.default.fetch(`${ORIGIN}${path}`, {
    headers: baseHeaders(options),
    redirect: "manual",
  });
}

/** Belge formu gönderimi (JavaScript'siz tarayıcı gibi). */
export function postForm(
  path: string,
  fields: Record<string, string>,
  options: RequestOptions = {},
) {
  const headers = baseHeaders(options);
  headers.set("content-type", "application/x-www-form-urlencoded");
  return exports.default.fetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields).toString(),
    redirect: "manual",
  });
}

/** Better Auth uçlarına doğrudan JSON isteği. */
export function postJson(path: string, body: unknown, options: RequestOptions = {}) {
  const headers = baseHeaders(options);
  headers.set("content-type", "application/json");
  return exports.default.fetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    redirect: "manual",
  });
}

/** Yanıttaki `Set-Cookie` başlıklarından `Cookie` başlığı üretir (silinenler hariç). */
export function cookieFrom(response: Response, previous = ""): string {
  const jar = new Map<string, string>();
  for (const part of previous.split(/;\s*/).filter(Boolean)) {
    const [name, ...rest] = part.split("=");
    jar.set(name!, rest.join("="));
  }
  for (const header of response.headers.getSetCookie()) {
    const [pair, ...attrs] = header.split(";");
    const [name, ...rest] = pair!.split("=");
    const value = rest.join("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired || !value) jar.delete(name!.trim());
    else jar.set(name!.trim(), value);
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

export function mailsTo(email: string): OutboxEntry[] {
  return getOutbox().filter((m) => m.to === email.toLowerCase());
}

export function lastMail(email: string, kind?: OutboxEntry["kind"]): OutboxEntry {
  const mail = mailsTo(email)
    .filter((m) => !kind || m.kind === kind)
    .at(-1);
  if (!mail) throw new Error(`${email} için ${kind ?? ""} e-postası yok`);
  return mail;
}

/** E-postadaki mutlak bağlantının yol + sorgu kısmı. */
export function pathOf(url: string | undefined): string {
  const u = new URL(url!);
  return u.pathname + u.search;
}

export const PASSWORD = "Guclu-sifre-2026";

/** Kayıt formunu gönderir (Turnstile test jetonuyla). */
export function register(
  email: string,
  { name = "Deniz Yılmaz", password = PASSWORD, ip = freshIp(), token = TURNSTILE_TOKEN } = {},
) {
  return postForm(
    "/kayit",
    { name, email, password, "cf-turnstile-response": token, next: "/" },
    { ip },
  );
}

export function login(email: string, password = PASSWORD, ip = freshIp()) {
  return postForm("/giris", { email, password, intent: "email", next: "/" }, { ip });
}

/** Kayıt + doğrulama bağlantısı: oturumu açık, doğrulanmış yeni kullanıcı. */
export async function verifiedUser(email = freshEmail(), password = PASSWORD) {
  const res = await register(email, { password });
  if (res.status !== 302) throw new Error(`kayıt başarısız: ${res.status}`);
  const verify = await get(pathOf(lastMail(email, "dogrulama").url));
  return { email, password, cookie: cookieFrom(verify) };
}

export async function sessionOf(cookie: string) {
  const res = await get("/api/auth/get-session", { cookie });
  return (await res.json()) as { user: { email: string; name: string } } | null;
}

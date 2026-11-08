/**
 * Tarayıcı tarafı Web Push: izin, service worker kaydı (`/sw.js`), abonelik ve sunucuya
 * kayıt (`/api/push/abonelik`). İzin yalnızca kullanıcı istediğinde istenir (Ayarlar ya da
 * hatırlatıcı kurduktan sonraki öneri); sayfa açılışında sorulmaz.
 */
import { base64UrlDecode } from "~/domain/notifications/web-push";

export type PushStatus = "desteklenmiyor" | "engellendi" | "kapali" | "acik" | "sunucuda-kapali";

export const PUSH_ENDPOINT = "/api/push/abonelik";
export const SERVICE_WORKER_URL = "/sw.js";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });
  return navigator.serviceWorker.ready;
}

async function publicKey(): Promise<string | null> {
  const res = await fetch(PUSH_ENDPOINT, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  return ((await res.json()) as { publicKey: string | null }).publicKey;
}

/** Bu cihazın durumu: destek, izin ve abonelik. */
export async function pushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return "desteklenmiyor";
  if (Notification.permission === "denied") return "engellendi";
  if (Notification.permission !== "granted") return "kapali";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return "kapali";
  const res = await fetch(`${PUSH_ENDPOINT}?endpoint=${encodeURIComponent(sub.endpoint)}`);
  if (!res.ok) return "kapali";
  const body = (await res.json()) as { publicKey: string | null; subscribed?: boolean };
  if (!body.publicKey) return "sunucuda-kapali";
  return body.subscribed ? "acik" : "kapali";
}

/** İzin ister, abone olur ve sunucuya kaydeder. */
export async function enablePush(): Promise<PushStatus> {
  if (!pushSupported()) return "desteklenmiyor";
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "engellendi";
  if (permission !== "granted") return "kapali";
  const key = await publicKey();
  if (!key) return "sunucuda-kapali";
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlDecode(key),
    });
  }
  const res = await fetch(PUSH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  return res.ok ? "acik" : "kapali";
}

/** Bu cihazın aboneliğini kaldırır. */
export async function disablePush(): Promise<PushStatus> {
  if (!pushSupported()) return "desteklenmiyor";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch(PUSH_ENDPOINT, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  }
  return "kapali";
}

const ASKED_KEY = "sukano:push-onerisi";

/**
 * Hatırlatıcı kurulduktan sonra bir kez önerilir mi? (destek var, izin henüz sorulmamış,
 * bu cihazda daha önce önerilmemiş.)
 */
export function shouldOfferPush(): boolean {
  if (!pushSupported() || Notification.permission !== "default") return false;
  try {
    return localStorage.getItem(ASKED_KEY) === null;
  } catch {
    return false;
  }
}

export function markPushOffered() {
  try {
    localStorage.setItem(ASKED_KEY, String(Date.now()));
  } catch {
    // Depolama kapalı: öneri yeniden gösterilebilir.
  }
}

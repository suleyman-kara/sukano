/**
 * Bildirim tercihleri (`user_preferences.notification_prefs`, Ayarlar → Bildirimler):
 * push her tür için ayrı kapatılır (hatırlatıcı, göreve atanma, davet); davet e-postası
 * ayrıca kapatılır. Uygulama içi bildirimler her zaman yazılır.
 */
import type { NotificationPrefs, NotificationType } from "~/db/schema";

export type Prefs = {
  push: { hatirlatici: boolean; goreveAtandi: boolean; davet: boolean };
  email: { davet: boolean };
};

export const DEFAULT_PREFS: Prefs = {
  push: { hatirlatici: true, goreveAtandi: true, davet: true },
  email: { davet: true },
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Saklanan (eksik ya da eski biçimli olabilir) değeri tam tercihe çevirir. */
export function normalizePrefs(raw: unknown): Prefs {
  const r = isObject(raw) ? raw : {};
  const push = isObject(r.push) ? r.push : {};
  const email = isObject(r.email) ? r.email : {};
  return {
    push: {
      hatirlatici: bool(push.hatirlatici, DEFAULT_PREFS.push.hatirlatici),
      goreveAtandi: bool(push.goreveAtandi, DEFAULT_PREFS.push.goreveAtandi),
      davet: bool(push.davet, DEFAULT_PREFS.push.davet),
    },
    email: { davet: bool(email.davet, DEFAULT_PREFS.email.davet) },
  };
}

const PUSH_KEY: Partial<Record<NotificationType, keyof Prefs["push"]>> = {
  hatirlatici: "hatirlatici",
  goreve_atandi: "goreveAtandi",
  davet: "davet",
};

/** Bu tür için tarayıcı bildirimi gönderilir mi? */
export function pushEnabledFor(prefs: Prefs, type: NotificationType): boolean {
  const key = PUSH_KEY[type];
  return key ? prefs.push[key] : false;
}

export const inviteEmailEnabled = (prefs: Prefs) => prefs.email.davet;

/** Ayarlar anahtarları (form alanı adı). */
export const PREF_KEYS = [
  "push.hatirlatici",
  "push.goreveAtandi",
  "push.davet",
  "email.davet",
] as const;
export type PrefKey = (typeof PREF_KEYS)[number];

/** Tek anahtarı değiştirir; bilinmeyen anahtarda null. */
export function updatePrefs(prefs: Prefs, key: string, value: boolean): Prefs | null {
  if (!PREF_KEYS.includes(key as PrefKey)) return null;
  const [group, name] = key.split(".") as ["push" | "email", string];
  return { ...prefs, [group]: { ...prefs[group], [name]: value } } as Prefs;
}

/** Şemadaki tiple uyumlu saklama biçimi. */
export const toStored = (prefs: Prefs): NotificationPrefs => prefs;

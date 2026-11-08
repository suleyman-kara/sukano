import { env } from "cloudflare:test";
import { seedDatabase, seedUserId } from "~/db/seed";
import { hesaplar, TEST_SIFRESI, type HesapAnahtari } from "../fixtures/hesaplar";
import { ornekKisiselAlanlar, ornekProjeler } from "../fixtures/ornek-veri";
import { cookieFrom, get, login, postForm, postJson } from "./kimlik-yardimcilar";

export const WEB = "web-sitesi-yenileme";
export const EV = "ev-tasinma";
export const KITAP = "kitap-kulubu";

export const ID = {
  suleyman: seedUserId("suleyman"),
  ayse: seedUserId("ayse"),
  mehmet: seedUserId("mehmet"),
  zeynep: seedUserId("zeynep"),
  can: seedUserId("can"),
} as const;

export const DAY = 86_400_000;
export const uuid = () => crypto.randomUUID();

export function seed() {
  return seedDatabase(env.DB, {
    hesaplar,
    projeler: ornekProjeler,
    kisiselAlanlar: ornekKisiselAlanlar,
  });
}

/** Tohum hesabıyla giriş yapar; oturum çerezini döner. */
export async function loginAs(key: HesapAnahtari): Promise<string> {
  const res = await login(hesaplar[key].eposta, TEST_SIFRESI);
  if (res.status !== 302) throw new Error(`${key} giriş yapamadı: ${res.status}`);
  return cookieFrom(res);
}

/** Birden çok tohum hesabının çerezleri. */
export async function cookies<K extends HesapAnahtari>(...keys: K[]) {
  const out = {} as Record<K, string>;
  for (const k of keys) out[k] = await loginAs(k);
  return out;
}

export async function form(path: string, fields: Record<string, string>, cookie: string) {
  const res = await postForm(path, fields, { cookie });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

export async function getJson<T = Record<string, unknown>>(path: string, cookie: string) {
  const res = await get(path, { cookie });
  return { status: res.status, body: (res.status === 200 ? await res.json() : null) as T };
}

export async function ops(noteId: string, list: unknown[], cookie: string) {
  const res = await postJson(`/api/notlar/${noteId}/gorevler`, { ops: list }, { cookie });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

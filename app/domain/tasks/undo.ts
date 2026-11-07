/**
 * Tamamlama geri alma (PLAN §10): her tamamlama not içinde "X tamamlandı · Geri al"
 * toast'ı açar (8 sn, üzerine gelince durur, en çok 2 satır yığılır) ve Ctrl+Z
 * yığınına girer; Ctrl+Z son tamamlamayı geri alır. Başlık yazılınca Ctrl+Z metne
 * aittir: yığın boşalır (toast'taki Geri al çalışmaya devam eder).
 *
 * Saf durum makinesi; zamanlayıcılar arayüzdedir. Geri alınan kimlikler
 * `reopenTasks` (completion.ts) ile açılır ve sunucuya `{ op: "reopen", ids }` gider.
 */
import { reopenTasks, toggleComplete, type ToggleResult } from "./completion";
import type { Task } from "./model";

/** Tamamlanan satırın "Tamamlananlar" grubuna inmeden önce yerinde kaldığı süre. */
export const SETTLE_MS = 1200;
export const TOAST_MS = 8000;
export const TOAST_MAX = 2;
/** Üzerinden çıkınca toast en az bu kadar daha görünür. */
export const TOAST_MIN_LEFT = 2000;
export const UNDO_MAX = 20;

export type CompletionToast = { key: string; text: string; ids: string[] };
export type UndoEntry = { key: string; ids: string[] };
export type UndoState = { toasts: CompletionToast[]; stack: UndoEntry[]; seq: number };

export const emptyUndo = (): UndoState => ({ toasts: [], stack: [], seq: 0 });

/** Türkçe "da/de" ünlü uyumu: son ünlü kalınsa (a ı o u) "da", değilse "de". */
export function daDe(word: string): "da" | "de" {
  const v = word.toLocaleLowerCase("tr").match(/[aıoueiöü](?=[^aıoueiöü]*$)/);
  return v && "aıou".includes(v[0]) ? "da" : "de";
}

/** "Mobil görünüm tamamlandı"; zincirde: "Tasarım onayı da tamamlandı". */
export function completionToastText(title: string, chainTitle?: string): string {
  if (chainTitle !== undefined) {
    const name = chainTitle.trim() || "Adsız görev";
    return `${name} ${daDe(name)} tamamlandı`;
  }
  return `${title.trim() || "Adsız görev"} tamamlandı`;
}

/**
 * Yeni tamamlama: toast en üste, kayıt yığına. `dropped`: yığından taşan (artık
 * görünmeyen) toast anahtarları; arayüz zamanlayıcılarını temizler.
 */
export function pushCompletion(
  state: UndoState,
  text: string,
  ids: readonly string[],
): { state: UndoState; key: string; dropped: string[] } {
  const seq = state.seq + 1;
  const key = `k${seq}`;
  const all = [{ key, text, ids: [...ids] }, ...state.toasts];
  return {
    key,
    dropped: all.slice(TOAST_MAX).map((t) => t.key),
    state: {
      seq,
      toasts: all.slice(0, TOAST_MAX),
      stack: [...state.stack, { key, ids: [...ids] }].slice(-UNDO_MAX),
    },
  };
}

/** Bu kimliklere dokunan toast ve kayıtları kaldırır (geri alındı ya da elle açıldı). */
export function forgetIds(state: UndoState, ids: readonly string[]): UndoState {
  const touches = (x: { ids: string[] }) => x.ids.some((i) => ids.includes(i));
  return {
    ...state,
    toasts: state.toasts.filter((t) => !touches(t)),
    stack: state.stack.filter((u) => !touches(u)),
  };
}

/** Ctrl+Z: son tamamlamayı geri alır. Yığın boşsa null (tuş metnin geri almasına kalır). */
export function undoLast(state: UndoState): { state: UndoState; ids: string[] } | null {
  const last = state.stack.at(-1);
  if (!last) return null;
  return { state: forgetIds(state, last.ids), ids: last.ids };
}

/** Toast'taki "Geri al". */
export function undoToast(
  state: UndoState,
  key: string,
): { state: UndoState; ids: string[] } | null {
  const toast = state.toasts.find((t) => t.key === key);
  if (!toast) return null;
  return { state: forgetIds(state, toast.ids), ids: toast.ids };
}

/** Süresi dolan ya da kapatılan toast kalkar; Ctrl+Z kaydı kalır. */
export function dismissToast(state: UndoState, key: string): UndoState {
  return { ...state, toasts: state.toasts.filter((t) => t.key !== key) };
}

/** Başlık yazıldı: Ctrl+Z artık metne aittir. */
export function clearOnTyping(state: UndoState): UndoState {
  return state.stack.length ? { ...state, stack: [] } : state;
}

/** Duraklatılınca kalan süre. */
export function pausedLeft(left: number, startedAt: number, now: number): number {
  return Math.max(0, left - (now - startedAt));
}

/** Devam edince kurulacak süre (en az {@link TOAST_MIN_LEFT}). */
export function resumeDelay(left: number | undefined): number {
  return Math.max(TOAST_MIN_LEFT, left ?? TOAST_MS);
}

/**
 * Kutucuk / Ctrl+Enter, toast ve geri al yığınıyla birlikte: tamamlanınca toast
 * eklenir; geri açılınca değişen görevlere dokunan toast ve kayıtlar kalkar.
 */
export function toggleWithUndo(
  tasks: readonly Task[],
  undo: UndoState,
  id: string,
  now: number,
  userId: string,
): { result: ToggleResult; undo: UndoState; toastKey: string | null; dropped: string[] } | null {
  const result = toggleComplete(tasks, id, now, userId);
  if (!result) return null;
  if (!result.completed) {
    return { result, undo: forgetIds(undo, result.changed), toastKey: null, dropped: [] };
  }
  const title = tasks.find((t) => t.id === id)!.title;
  const pushed = pushCompletion(
    undo,
    completionToastText(title, result.chain.parentTitle),
    result.changed,
  );
  return { result, undo: pushed.state, toastKey: pushed.key, dropped: pushed.dropped };
}

/** Geri alınan kimlikleri görev listesinde açar; sunucuya `ops` gönderilir. */
export function applyUndo(tasks: readonly Task[], ids: readonly string[]) {
  return reopenTasks(tasks, ids);
}

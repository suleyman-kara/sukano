/**
 * Açık nottaki ek listesinin istemci durumu (saf): sunucudan gelen ekler + yüklenmekte
 * olan / hata veren dosyalar + iyimser eklenen ve kaldırılanlar.
 *
 * - Yüklenen dosya yanıt gelince `added`'a geçer; loader yeniden doğrulanıp sunucu
 *   listesinde görünene kadar oradan gösterilir (titreme olmaz).
 * - Kaldırılan ek istek sürerken gizlenir; istek başarısız olursa geri gelir.
 */
import type { AttachmentKind } from "./rules";

export type AttachmentView = {
  id: string;
  name: string;
  size: number;
  contentType: string;
  kind: AttachmentKind;
};

export type PendingUpload = {
  /** İstemci anahtarı. */
  key: string;
  name: string;
  size: number;
  loaded: number;
  status: "yukleniyor" | "hata";
  error?: string;
  /** Ağ hatası: "Tekrar dene" gösterilir. */
  retryable?: boolean;
};

export type AttachmentsState = {
  pending: PendingUpload[];
  added: AttachmentView[];
  removed: string[];
};

export const EMPTY_ATTACHMENTS: AttachmentsState = { pending: [], added: [], removed: [] };

export type AttachmentsAction =
  | { type: "basla"; key: string; name: string; size: number }
  | { type: "ilerle"; key: string; loaded: number }
  | { type: "bitti"; key: string; attachment: AttachmentView }
  | { type: "hata"; key: string; error: string; retryable?: boolean }
  | { type: "yeniden"; key: string }
  | { type: "vazgec"; key: string }
  | { type: "kaldir"; id: string }
  | { type: "kaldirma-geri"; id: string }
  /** Sunucu listesi yenilendi: listeye ulaşan eklenenler atılır. */
  | { type: "esitle"; server: readonly AttachmentView[] };

const patch = (s: AttachmentsState, key: string, p: Partial<PendingUpload>): AttachmentsState => ({
  ...s,
  pending: s.pending.map((u) => (u.key === key ? { ...u, ...p } : u)),
});

export function attachmentsReducer(
  state: AttachmentsState,
  action: AttachmentsAction,
): AttachmentsState {
  switch (action.type) {
    case "basla":
      return {
        ...state,
        pending: [
          ...state.pending,
          {
            key: action.key,
            name: action.name,
            size: action.size,
            loaded: 0,
            status: "yukleniyor",
          },
        ],
      };
    case "ilerle":
      return patch(state, action.key, { loaded: action.loaded });
    case "bitti":
      return {
        ...state,
        pending: state.pending.filter((u) => u.key !== action.key),
        added: [...state.added, action.attachment],
      };
    case "hata":
      return patch(state, action.key, {
        status: "hata",
        error: action.error,
        retryable: action.retryable ?? false,
      });
    case "yeniden":
      return patch(state, action.key, {
        status: "yukleniyor",
        loaded: 0,
        error: undefined,
        retryable: false,
      });
    case "vazgec":
      return { ...state, pending: state.pending.filter((u) => u.key !== action.key) };
    case "kaldir":
      return state.removed.includes(action.id)
        ? state
        : { ...state, removed: [...state.removed, action.id] };
    case "kaldirma-geri":
      return { ...state, removed: state.removed.filter((id) => id !== action.id) };
    case "esitle":
      return pruneAttachments(action.server, state);
  }
}

/** Gösterilecek ekler: sunucudakiler + henüz sunucu listesine girmemiş eklenenler. */
export function visibleAttachments(
  server: readonly AttachmentView[],
  state: AttachmentsState,
): AttachmentView[] {
  const removed = new Set(state.removed);
  const known = new Set(server.map((a) => a.id));
  return [...server, ...state.added.filter((a) => !known.has(a.id))].filter(
    (a) => !removed.has(a.id),
  );
}

/** Yeni dosya için yer var mı: gösterilen + yüklenmekte olan. */
export const usedSlots = (visible: readonly AttachmentView[], state: AttachmentsState) =>
  visible.length + state.pending.filter((u) => u.status === "yukleniyor").length;

/** Durumu sunucu listesine göre sadeleştirir (sunucuya ulaşmış eklenenler atılır). */
export function pruneAttachments(
  server: readonly AttachmentView[],
  state: AttachmentsState,
): AttachmentsState {
  const known = new Set(server.map((a) => a.id));
  const added = state.added.filter((a) => !known.has(a.id));
  return added.length === state.added.length ? state : { ...state, added };
}

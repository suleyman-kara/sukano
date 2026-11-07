/**
 * Varlık (presence): notu açık tutanlar. İstemciler y-protocols farkındalık (awareness)
 * durumunu yayınlar; bu modül saf parçaları içerir:
 *
 * - Farkındalık güncellemesinin ikili biçimi (`decodeAwarenessUpdate` /
 *   `encodeAwarenessUpdate`; y-protocols `awareness.js` ile aynı tel biçimi:
 *   `varUint n, n × (varUint clientID, varUint clock, varString JSON)`).
 * - Sunucu tarafı güvenlik: istemcinin gönderdiği `user` alanı oturumdaki kişiyle
 *   değiştirilir (`sanitizeAwarenessEntries`); başkası adına görünülemez.
 * - Sunucunun bellek içi durum haritası (`applyAwarenessEntries`; eski saatli giriş yok sayılır).
 * - Arayüz için kişi listesi (`mergePresence`): aynı kişinin birden çok sekmesi tek kişi.
 */
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";

/** Varlıkta görünen kişi bilgisi (Collaboration caret de `user.name` / `user.color` okur). */
export type PresenceUser = {
  id: string;
  name: string;
  color: string;
  avatarUrl?: string | null;
};

/** İstemcinin farkındalık durumu. `cursor` Collaboration caret eklentisinindir. */
export type PresenceState = {
  user: PresenceUser;
  /** Yapılacaklar notunda odaklanılan görev (isteğe bağlı). */
  focus?: { taskId: string } | null;
  cursor?: unknown;
};

export type AwarenessEntry = { clientID: number; clock: number; state: unknown };

export function decodeAwarenessUpdate(update: Uint8Array): AwarenessEntry[] {
  const decoder = decoding.createDecoder(update);
  const n = decoding.readVarUint(decoder);
  const out: AwarenessEntry[] = [];
  for (let i = 0; i < n; i++) {
    const clientID = decoding.readVarUint(decoder);
    const clock = decoding.readVarUint(decoder);
    const json = decoding.readVarString(decoder);
    let state: unknown = null;
    try {
      state = JSON.parse(json);
    } catch {
      state = null;
    }
    out.push({ clientID, clock, state });
  }
  return out;
}

export function encodeAwarenessUpdate(entries: readonly AwarenessEntry[]): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, entries.length);
  for (const e of entries) {
    encoding.writeVarUint(encoder, e.clientID);
    encoding.writeVarUint(encoder, e.clock);
    encoding.writeVarString(encoder, JSON.stringify(e.state ?? null));
  }
  return encoding.toUint8Array(encoder);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Güvenilmeyen durumu doğrular; geçersizse null. */
export function parsePresenceState(raw: unknown): PresenceState | null {
  if (!isObject(raw) || !isObject(raw.user)) return null;
  const { id, name, color, avatarUrl } = raw.user;
  if (typeof id !== "string" || !id || typeof name !== "string") return null;
  const user: PresenceUser = {
    id,
    name,
    color: typeof color === "string" && color ? color : "#597895",
    ...(typeof avatarUrl === "string" ? { avatarUrl } : {}),
  };
  const focus =
    isObject(raw.focus) && typeof raw.focus.taskId === "string" && raw.focus.taskId
      ? { taskId: raw.focus.taskId }
      : null;
  return { user, focus, ...(raw.cursor !== undefined ? { cursor: raw.cursor } : {}) };
}

/**
 * Sunucu: istemcinin gönderdiği girişlerde `user`'ı oturumdaki kişiyle değiştirir
 * (ad ve renk dahil). `null` durum (ayrılma) olduğu gibi kalır. Geçersiz nesne → yalnızca
 * güvenilir `user`. JSON boyutu `maxStateBytes`'ı aşan durum atılır (ayrılma sayılır).
 */
export function sanitizeAwarenessEntries(
  entries: readonly AwarenessEntry[],
  trusted: PresenceUser,
  maxStateBytes = 4096,
): AwarenessEntry[] {
  return entries.map((e) => {
    if (e.state === null) return e;
    const base = isObject(e.state) ? e.state : {};
    const state = { ...base, user: { ...trusted } };
    if (JSON.stringify(state).length > maxStateBytes) return { ...e, state: null };
    return { ...e, state };
  });
}

export type AwarenessMap = Map<number, { clock: number; state: unknown }>;

/**
 * Girişleri haritaya uygular (y-protocols kuralı: daha yeni saat kazanır; aynı saatte
 * `null` ayrılma kabul edilir). Değişen girişleri döner (yayınlanacaklar).
 */
export function applyAwarenessEntries(
  map: AwarenessMap,
  entries: readonly AwarenessEntry[],
): AwarenessEntry[] {
  const changed: AwarenessEntry[] = [];
  for (const e of entries) {
    const prev = map.get(e.clientID);
    const newer =
      !prev ||
      prev.clock < e.clock ||
      (prev.clock === e.clock && e.state === null && prev.state !== null);
    if (!newer) continue;
    if (e.state === null) map.delete(e.clientID);
    else map.set(e.clientID, { clock: e.clock, state: e.state });
    changed.push(e);
  }
  return changed;
}

/** Haritadaki tüm girişler (yeni bağlanana gönderilir). */
export function awarenessSnapshot(map: AwarenessMap): AwarenessEntry[] {
  return [...map].map(([clientID, v]) => ({ clientID, clock: v.clock, state: v.state }));
}

/** Bağlantı kapanınca istemcilerinin ayrılma girişleri (saat bir artırılır). */
export function removalEntries(map: AwarenessMap, clientIDs: Iterable<number>): AwarenessEntry[] {
  const out: AwarenessEntry[] = [];
  for (const id of clientIDs) {
    const prev = map.get(id);
    if (!prev) continue;
    out.push({ clientID: id, clock: prev.clock + 1, state: null });
  }
  return out;
}

/** Arayüzdeki kişi: aynı kişinin birden çok sekmesi/cihazı tek kayıt. */
export type Peer = {
  userId: string;
  name: string;
  color: string;
  avatarUrl: string | null;
  /** Bu kişinin farkındalık istemci kimlikleri (sekme başına bir). */
  clientIds: number[];
  /** Odaklandığı görevler (yapılacaklar notu; sekmeler birleşir). */
  focusTaskIds: string[];
};

export type MergePresenceOptions = {
  /** Bu sekmenin istemci kimliği (listeden çıkarılır). */
  selfClientId?: number;
  /** Oturumdaki kişi; verilirse diğer sekmeleri de listeden çıkarılır. */
  selfUserId?: string;
};

const collator = new Intl.Collator("tr", { sensitivity: "base" });

/**
 * Farkındalık durumlarından varlık listesi: geçersiz durumlar atlanır, kişi başına tek
 * kayıt, ada göre (Türkçe) sıralı. Ad ve renk kişinin en büyük istemci kimliğindeki
 * durumdan gelir (kararlı sonuç).
 */
export function mergePresence(
  states: Iterable<[number, unknown]>,
  { selfClientId, selfUserId }: MergePresenceOptions = {},
): Peer[] {
  const byUser = new Map<string, Peer & { _top: number }>();
  for (const [clientId, raw] of states) {
    if (clientId === selfClientId) continue;
    const state = parsePresenceState(raw);
    if (!state || state.user.id === selfUserId) continue;
    const prev = byUser.get(state.user.id);
    const focus = state.focus?.taskId;
    if (!prev) {
      byUser.set(state.user.id, {
        userId: state.user.id,
        name: state.user.name,
        color: state.user.color,
        avatarUrl: state.user.avatarUrl ?? null,
        clientIds: [clientId],
        focusTaskIds: focus ? [focus] : [],
        _top: clientId,
      });
      continue;
    }
    prev.clientIds.push(clientId);
    if (focus && !prev.focusTaskIds.includes(focus)) prev.focusTaskIds.push(focus);
    if (clientId > prev._top) {
      prev._top = clientId;
      prev.name = state.user.name;
      prev.color = state.user.color;
      prev.avatarUrl = state.user.avatarUrl ?? null;
    }
  }
  return [...byUser.values()]
    .map(({ _top: _ignored, ...peer }) => ({
      ...peer,
      clientIds: [...peer.clientIds].sort((a, b) => a - b),
      focusTaskIds: [...peer.focusTaskIds].sort(),
    }))
    .sort((a, b) => collator.compare(a.name, b.name) || a.userId.localeCompare(b.userId));
}

/** Görevde odaklanan kişiler (satırda küçük avatar için). */
export function peersOnTask(peers: readonly Peer[], taskId: string): Peer[] {
  return peers.filter((p) => p.focusTaskIds.includes(taskId));
}

/** Liste değişti mi (gereksiz yeniden çizimi önlemek için). */
export function samePeers(a: readonly Peer[], b: readonly Peer[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

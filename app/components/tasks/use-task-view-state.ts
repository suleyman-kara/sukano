import { useCallback, useEffect, useRef, useState } from "react";

/** Aç/kapa durumunun localStorage anahtarı: not başına, cihaz bazında (PLAN §3). */
export const viewStateKey = (noteId: string) => `sukano:gorevler:${noteId}`;

type Stored = { acik?: string[]; tamamlananlar?: string[] };
type View = { expanded: ReadonlySet<string>; doneOpen: ReadonlySet<string> };

function read(noteId: string): Stored {
  try {
    const raw = window.localStorage.getItem(viewStateKey(noteId));
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

function write(noteId: string, view: View) {
  try {
    if (view.expanded.size === 0 && view.doneOpen.size === 0) {
      window.localStorage.removeItem(viewStateKey(noteId));
    } else {
      const value: Stored = { acik: [...view.expanded], tamamlananlar: [...view.doneOpen] };
      window.localStorage.setItem(viewStateKey(noteId), JSON.stringify(value));
    }
  } catch {
    /* depolama kapalı: durum yalnızca bu oturumda kalır */
  }
}

const toggled = (set: ReadonlySet<string>, key: string, on?: boolean) => {
  const next = new Set(set);
  if (on ?? !next.has(key)) next.add(key);
  else next.delete(key);
  return next;
};

const EMPTY: View = { expanded: new Set(), doneOpen: new Set() };

/**
 * Hangi görevlerin alt görevleri açık (`expanded`) ve hangi seviyelerin "Tamamlananlar"
 * grubu açık (`doneOpen`). İlk açılışta yalnızca üst seviye görünür. Sunucuda boş
 * başlar, tarayıcıda kayıtlı durum takılınca yüklenir (hidrasyon uyuşmazlığı olmasın);
 * her değişiklik hemen yazılır.
 */
export function useTaskViewState(noteId: string) {
  const [view, setView] = useState<View>(EMPTY);
  const idRef = useRef(noteId);

  useEffect(() => {
    idRef.current = noteId;
    const s = read(noteId);
    // Kayıtlı durum yalnızca tarayıcıda okunabilir: sunucu çizimi boş başlar, takılınca yüklenir.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView({ expanded: new Set(s.acik ?? []), doneOpen: new Set(s.tamamlananlar ?? []) });
  }, [noteId]);

  const update = useCallback((fn: (v: View) => View) => {
    setView((v) => {
      const next = fn(v);
      if (next !== v) write(idRef.current, next);
      return next;
    });
  }, []);

  const setOpen = useCallback(
    (id: string, on?: boolean) => update((v) => ({ ...v, expanded: toggled(v.expanded, id, on) })),
    [update],
  );
  const setGroupOpen = useCallback(
    (key: string, on?: boolean) =>
      update((v) => ({ ...v, doneOpen: toggled(v.doneOpen, key, on) })),
    [update],
  );
  const setExpanded = useCallback(
    (ids: Iterable<string>) => update((v) => ({ ...v, expanded: new Set(ids) })),
    [update],
  );

  return { expanded: view.expanded, doneOpen: view.doneOpen, setOpen, setGroupOpen, setExpanded };
}

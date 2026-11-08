/**
 * jsdom'da `window.matchMedia` yok. Bu sahte uygulama şu sorguları
 * anlar: `(prefers-color-scheme: dark)`, `(min-width: Npx)` /
 * `(max-width: Npx)`, `(pointer: coarse|fine)` ve `(prefers-reduced-motion: reduce)`
 * (varsayılan açık: bileşen testleri hareketsiz, deterministik koşar). Durum `setMedia` ile değiştirilir; eşleşmesi değişen
 * sorguların dinleyicilerine `change` olayı gönderilir.
 */
type MediaState = { width: number; dark: boolean; coarse: boolean; reducedMotion: boolean };

const state: MediaState = { width: 1440, dark: false, coarse: false, reducedMotion: true };
const lists = new Set<FakeMediaQueryList>();

function evaluate(query: string): boolean {
  return query.split(",").some((part) =>
    [...part.matchAll(/\(([^)]+)\)/g)].every(([, feature]) => {
      const [name, raw] = feature.split(":").map((s) => s.trim());
      if (name === "prefers-color-scheme") return (raw === "dark") === state.dark;
      if (name === "min-width") return state.width >= parseFloat(raw);
      if (name === "max-width") return state.width <= parseFloat(raw);
      if (name === "pointer") return (raw === "coarse") === state.coarse;
      if (name === "prefers-reduced-motion") return (raw === "reduce") === state.reducedMotion;
      return false;
    }),
  );
}

class FakeMediaQueryList extends EventTarget implements MediaQueryList {
  readonly media: string;
  matches: boolean;
  onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null = null;

  constructor(media: string) {
    super();
    this.media = media;
    this.matches = evaluate(media);
  }

  addListener(cb: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null) {
    if (cb) this.addEventListener("change", cb as EventListener);
  }

  removeListener(cb: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null) {
    if (cb) this.removeEventListener("change", cb as EventListener);
  }

  refresh() {
    const next = evaluate(this.media);
    if (next === this.matches) return;
    this.matches = next;
    const event = Object.assign(new Event("change"), { matches: next, media: this.media });
    this.dispatchEvent(event);
  }
}

export function installMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const list = new FakeMediaQueryList(query);
      lists.add(list);
      return list;
    },
  });
}

/** Görünüm genişliğini ve/veya sistem renk şemasını değiştirir. */
export function setMedia(next: Partial<MediaState>) {
  Object.assign(state, next);
  for (const list of lists) list.refresh();
}

export function resetMedia() {
  state.width = 1440;
  state.dark = false;
  state.coarse = false;
  state.reducedMotion = true;
  lists.clear();
}

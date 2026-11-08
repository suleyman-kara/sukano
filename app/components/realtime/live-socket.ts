/**
 * Yeniden bağlanan WebSocket (tarayıcı). Not odası ve kanallar bunun üstüne kurulur.
 *
 * Durum (`LiveStatus`):
 * - `baglaniyor`: bağlantı deneniyor (ilk açılış ya da yeniden deneme anı).
 * - `bagli`: bağlantı açık.
 * - `cevrimdisi`: tarayıcı çevrimdışı, deneme arasında bekleniyor ya da erişim kalktı
 *   (`fatal`). PLAN §5: çevrimdışıyken düzenleme kapalıdır.
 *
 * Kopunca `reconnectDelay` çizelgesiyle (500 ms → 15 sn, titreşimli) yeniden denenir;
 * `online` olayında hemen. Canlılık: her `pingMs`'te `{"t":"ping"}` gider (Durable
 * Object uyandırmadan `pong` yanıtlar); `pongTimeoutMs` içinde hiçbir ileti gelmezse
 * bağlantı ölü sayılıp yeniden kurulur. 4404 kapanışı ölümcüldür (yeniden denenmez),
 * 4000/4009 hemen yeniden bağlanır.
 */
import { reconnectDelay, type BackoffOptions } from "~/domain/realtime/backoff";
import { CLOSE_CODES, isFatalClose } from "~/domain/realtime/protocol";

export type LiveStatus = "baglaniyor" | "bagli" | "cevrimdisi";

/** Çevrimiçi durumu kaynağı (testte sahte). */
export type OnlineSource = {
  isOnline: () => boolean;
  subscribe: (onChange: (online: boolean) => void) => () => void;
};

export const browserOnline: OnlineSource = {
  isOnline: () => typeof navigator === "undefined" || navigator.onLine !== false,
  subscribe(onChange) {
    if (typeof window === "undefined") return () => {};
    const on = () => onChange(true);
    const off = () => onChange(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  },
};

/** WebSocket'in kullanılan alt kümesi (testte sahte soket). */
export type SocketLike = {
  readonly readyState: number;
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  binaryType: string;
  onopen: ((ev: Event) => unknown) | null;
  onclose: ((ev: CloseEvent) => unknown) | null;
  onerror: ((ev: Event) => unknown) | null;
  onmessage: ((ev: MessageEvent) => unknown) | null;
};

export type LiveSocketOptions = {
  /** Yol ya da tam adres; yol verilirse sayfanın kökünden ws(s):// üretilir. */
  url: string;
  onOpen?: () => void;
  onMessage?: (data: string | ArrayBuffer) => void;
  onClose?: (code: number, reason: string) => void;
  onStatus?: (status: LiveStatus) => void;
  backoff?: BackoffOptions;
  random?: () => number;
  pingMs?: number;
  pongTimeoutMs?: number;
  online?: OnlineSource;
  createSocket?: (url: string) => SocketLike;
};

const OPEN = 1;

export function toWsUrl(url: string): string {
  if (/^wss?:\/\//.test(url)) return url;
  const loc = typeof window === "undefined" ? null : window.location;
  if (!loc) return url;
  return `${loc.protocol === "https:" ? "wss:" : "ws:"}//${loc.host}${url}`;
}

export class LiveSocket {
  status: LiveStatus = "baglaniyor";
  /** Son ileti zamanı (ms). */
  lastMessageAt: number | null = null;
  /** Erişim kalktı (4404): yeniden denenmez. */
  fatal = false;
  private ws: SocketLike | null = null;
  private attempt = 0;
  private stopped = true;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeOnline: (() => void) | null = null;
  private readonly online: OnlineSource;

  constructor(private readonly options: LiveSocketOptions) {
    this.online = options.online ?? browserOnline;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.fatal = false;
    this.unsubscribeOnline = this.online.subscribe((online) => {
      if (this.stopped || this.fatal) return;
      if (online) {
        this.attempt = 0;
        this.reconnectNow();
      } else {
        this.dropSocket();
        this.clearRetry();
        this.setStatus("cevrimdisi");
      }
    });
    if (this.online.isOnline()) this.connect();
    else this.setStatus("cevrimdisi");
  }

  stop() {
    this.stopped = true;
    this.clearRetry();
    this.unsubscribeOnline?.();
    this.unsubscribeOnline = null;
    this.dropSocket(1000, "kapatıldı");
  }

  /** Açıksa gönderir; değilse false. */
  send(data: string | Uint8Array): boolean {
    if (!this.ws || this.ws.readyState !== OPEN) return false;
    try {
      this.ws.send(data);
      return true;
    } catch {
      return false;
    }
  }

  get isOpen() {
    return this.ws?.readyState === OPEN;
  }

  /** Bekleme süresini atlayıp hemen yeniden bağlanır. */
  reconnectNow() {
    if (this.stopped || this.fatal) return;
    this.clearRetry();
    this.dropSocket();
    if (this.online.isOnline()) this.connect();
    else this.setStatus("cevrimdisi");
  }

  private setStatus(status: LiveStatus) {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatus?.(status);
  }

  private connect() {
    this.setStatus("baglaniyor");
    const url = toWsUrl(this.options.url);
    let ws: SocketLike;
    try {
      ws = this.options.createSocket
        ? this.options.createSocket(url)
        : (new WebSocket(url) as unknown as SocketLike);
    } catch {
      this.scheduleRetry();
      return;
    }
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempt = 0;
      this.lastMessageAt = Date.now();
      this.setStatus("bagli");
      this.startPing();
      this.options.onOpen?.();
    };
    ws.onmessage = (e: MessageEvent) => {
      if (this.ws !== ws) return;
      this.lastMessageAt = Date.now();
      this.clearPong();
      const data = e.data as string | ArrayBuffer;
      if (data === '{"t":"pong"}') return;
      this.options.onMessage?.(data);
    };
    ws.onerror = () => {
      // Ardından close gelir.
    };
    ws.onclose = (e: CloseEvent) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopPing();
      this.options.onClose?.(e.code, e.reason);
      if (this.stopped) return;
      if (isFatalClose(e.code)) {
        this.fatal = true;
        this.setStatus("cevrimdisi");
        return;
      }
      if (e.code === CLOSE_CODES.yenidenBaglan || e.code === CLOSE_CODES.sifirlandi) {
        this.attempt = 0;
        this.connect();
        return;
      }
      this.scheduleRetry();
    };
  }

  private scheduleRetry() {
    if (this.stopped) return;
    this.setStatus("cevrimdisi");
    if (!this.online.isOnline()) return; // `online` olayı bekleniyor
    const delay = reconnectDelay(this.attempt++, this.options.backoff, this.options.random);
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopped) this.connect();
    }, delay);
  }

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private startPing() {
    this.stopPing();
    const every = this.options.pingMs ?? 25_000;
    if (every <= 0) return;
    this.pingTimer = setInterval(() => {
      if (!this.send('{"t":"ping"}')) return;
      if (this.pongTimer) return;
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        // Yanıt yok: bağlantı ölü; yeniden kur.
        const ws = this.ws;
        this.ws = null;
        this.stopPing();
        try {
          ws?.close(4001, "yanıt yok");
        } catch {
          // yok say
        }
        this.options.onClose?.(4001, "yanıt yok");
        this.scheduleRetry();
      }, this.options.pongTimeoutMs ?? 10_000);
    }, every);
  }

  private clearPong() {
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = null;
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.clearPong();
  }

  private dropSocket(code = 1000, reason = "") {
    const ws = this.ws;
    this.ws = null;
    this.stopPing();
    if (!ws) return;
    ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
    try {
      ws.close(code, reason);
    } catch {
      // yok say
    }
    this.options.onClose?.(code, reason);
  }
}

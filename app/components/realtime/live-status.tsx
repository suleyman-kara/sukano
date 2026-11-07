import { RefreshCw, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "cn";
import { syncLabel, syncLabelRefreshMs } from "~/domain/realtime/live-ui";
import type { LiveStatus } from "./live-socket";
import type { LiveChannelState } from "./use-live-channel";

/**
 * Göreli "Son eşitleme: …" metni; kendini yeniler (ilk saatte 15 sn'de bir). Zaman yoksa
 * çizilmez. Hidrasyon uyuşmazlığı olmasın diye "şimdi" yalnızca tarayıcıda alınır.
 */
export function SyncStatus({ at, className }: { at: number | null; className?: string }) {
  const now = useNow(at);
  const label = now === null ? null : syncLabel(at, now);
  if (!label) return null;
  return (
    <p data-testid="son-esitleme" className={cn("m-0 text-xs text-muted-foreground", className)}>
      {label}
    </p>
  );
}

/**
 * Saniyeye yuvarlanmış "şimdi" (dış depo): `at`'e göre aralıkla yenilenir (ilk saatte
 * 15 sn, sonra 5 dk); sunucuda null (hidrasyon uyuşmazlığı olmaz).
 */
function useNow(at: number | null): number | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const every = syncLabelRefreshMs(at, Date.now());
      if (every === null) return () => {};
      const timer = setInterval(onChange, every);
      return () => clearInterval(timer);
    },
    [at],
  );
  return useSyncExternalStore(subscribe, nowSnapshot, () => null);
}

const nowSnapshot = () => Math.ceil(Date.now() / 1000) * 1000;

type OfflineBannerProps = {
  /** "Yeniden dene" (`live.reconnect`); verilmezse düğme yok. */
  onRetry?: () => void;
  /** Bağlantı deneniyor mu (düğme dönerken). */
  retrying?: boolean;
  /** Not içinde (köşeli kutu) ya da sayfa üstünde. */
  variant?: "note" | "page";
  className?: string;
};

/**
 * Çevrimdışı bandı (States / MOffline: uyarı zemini, wifi-kapalı simgesi). PLAN §5:
 * çevrimdışıyken düzenleme kapalı; bağlantı gelince kendiliğinden açılır.
 */
export function OfflineBanner({
  onRetry,
  retrying = false,
  variant = "note",
  className,
}: OfflineBannerProps) {
  return (
    <div
      role="status"
      data-testid="cevrimdisi"
      className={cn(
        "flex items-center gap-2.5 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn",
        variant === "page" && "text-sm font-medium",
        className,
      )}
    >
      <WifiOff className="size-[18px] shrink-0" strokeWidth={2} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {variant === "note" ? (
          <>
            <b className="font-semibold">Çevrimdışısın.</b> Not okunabilir, düzenleme bağlantı
            gelince açılır.
          </>
        ) : (
          "Çevrimdışısın. Notlar okunabilir, düzenleme bağlantı gelince açılır."
        )}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 font-semibold outline-none hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)] focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-11"
        >
          <RefreshCw
            className={cn("size-4", retrying && "animate-spin reduced-motion:animate-none")}
            aria-hidden="true"
          />
          Yeniden dene
        </button>
      )}
    </div>
  );
}

/** Kısa kopmalarda (yeniden deneme arası) bant yanıp sönmesin: bu kadar sonra gösterilir (ms). */
export const OFFLINE_GRACE_MS = 1200;

/**
 * Çevrimdışı bandı gösterilsin mi. Tarayıcı çevrimdışıysa hemen; bağlantı başka nedenle
 * koptuysa (sunucuya ulaşılamıyor) kopukluk `OFFLINE_GRACE_MS` sürünce. Yeniden deneme
 * anlarında ("bağlanıyor") bant yanıp sönmez: yeniden bağlanana kadar kalır. İlk
 * bağlanma (hiç kopmadan) bant göstermez.
 */
export function useOfflineShown(status: LiveStatus | null | undefined): boolean {
  const disconnected = status != null && status !== "bagli";
  const [sawOffline, setSawOffline] = useState(false);
  if (status === "cevrimdisi" && !sawOffline) setSawOffline(true);
  if (status === "bagli" && sawOffline) setSawOffline(false);
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!disconnected) return;
    const timer = setTimeout(() => setLate(true), OFFLINE_GRACE_MS);
    return () => {
      clearTimeout(timer);
      setLate(false);
    };
  }, [disconnected]);
  if (!disconnected || !sawOffline) return false;
  return late || (status === "cevrimdisi" && typeof navigator !== "undefined" && !navigator.onLine);
}

/**
 * Alan sayfalarının (Notlarım, Arşiv, Çöp, proje) çevrimdışı durumu (MOffline): kanal
 * koptuysa sayfa üstünde bant ve "Son eşitleme: …" metni.
 */
export function GridLiveStatus({
  live,
  part,
}: {
  live: LiveChannelState | null | undefined;
  /** `banner`: sayfa üstü bant; `sync`: başlık altındaki son eşitleme satırı. */
  part: "banner" | "sync";
}) {
  const shown = useOfflineShown(live?.status);
  if (!shown || !live) return null;
  return part === "banner" ? (
    <OfflineBanner variant="page" />
  ) : (
    <SyncStatus at={live.lastEventAt} />
  );
}

/** Çevrimdışıyken içerik (ör. "Not al" alanı) etkileşimsiz ve soluk (MOffline). */
export function OfflineInert({
  live,
  children,
}: {
  live: LiveChannelState | null | undefined;
  children: React.ReactNode;
}) {
  const shown = useOfflineShown(live?.status);
  return (
    <div
      inert={shown}
      aria-disabled={shown || undefined}
      className={shown ? "opacity-60" : "contents"}
    >
      {children}
    </div>
  );
}

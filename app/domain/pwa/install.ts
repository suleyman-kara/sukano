/**
 * PWA kurulum ipucu kuralları (PLAN §10, tasarım: States "PWA kurulum ipucu", MInstall).
 * Saf; bileşen `app/components/pwa/install-hint.tsx`.
 *
 * - Android ve masaüstü Chromium: tarayıcı `beforeinstallprompt` gönderdiyse "Ekle" düğmeli
 *   ipucu (düğme tarayıcının kurulum penceresini açar).
 * - iPhone / iPad Safari: kurulum olayı yok; "Paylaş → Ana Ekrana Ekle" adımları.
 * - Uygulama zaten kurulu açıldıysa (`display-mode: standalone`) ya da "Şimdi değil"den
 *   sonra `DISMISS_DAYS` gün geçmediyse gösterilmez.
 */

export type InstallPlatform = "prompt" | "ios";

/** "Şimdi değil" ya da kurulumdan sonra ipucu bu kadar gün gösterilmez. */
export const DISMISS_DAYS = 30;

/** localStorage anahtarı: ipucunun kapatıldığı zaman (ms). */
export const INSTALL_HINT_KEY = "sukano:kurulum-ipucu";

/** Sayfa açıldıktan sonra ipucu bu kadar bekler (ilk izlenimi bölmesin). */
export const INSTALL_HINT_DELAY_MS = 2500;

/** iPhone / iPad / iPod Safari mi (Chrome, Firefox, Edge iOS sürümleri ve uygulama içi görünümler hariç). */
export function isIosSafari(userAgent: string, maxTouchPoints = 0): boolean {
  const ios =
    /iPhone|iPad|iPod/.test(userAgent) ||
    // iPadOS 13+ masaüstü Safari kimliğiyle gelir; dokunmatik noktadan anlaşılır.
    (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (!ios) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|GSA\//.test(userAgent)) return false;
  return /Safari\//.test(userAgent) && /Version\//.test(userAgent);
}

export type InstallContext = {
  userAgent: string;
  maxTouchPoints?: number;
  /** `display-mode: standalone` ya da iOS `navigator.standalone`. */
  standalone: boolean;
  /** `beforeinstallprompt` yakalandı mı. */
  promptAvailable: boolean;
  /** Son kapatma zamanı (ms) ya da null. */
  dismissedAt: number | null;
  now: number;
};

/** Hangi ipucu gösterilmeli; hiçbiri değilse null. */
export function installHintFor(ctx: InstallContext): InstallPlatform | null {
  if (ctx.standalone) return null;
  if (ctx.dismissedAt !== null && ctx.now - ctx.dismissedAt < DISMISS_DAYS * 86_400_000) {
    return null;
  }
  if (ctx.promptAvailable) return "prompt";
  if (isIosSafari(ctx.userAgent, ctx.maxTouchPoints)) return "ios";
  return null;
}

/** localStorage değerini zaman damgasına çevirir (geçersizse null). */
export function parseDismissedAt(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

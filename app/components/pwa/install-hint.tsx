import { Share, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  INSTALL_HINT_DELAY_MS,
  INSTALL_HINT_KEY,
  installHintFor,
  parseDismissedAt,
  type InstallPlatform,
} from "~/domain/pwa/install";

/** Chromium'un `beforeinstallprompt` olayı (standart DOM tiplerinde yok). */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function readDismissed(): number | null {
  try {
    return parseDismissedAt(localStorage.getItem(INSTALL_HINT_KEY));
  } catch {
    return null;
  }
}

function writeDismissed(now: number) {
  try {
    localStorage.setItem(INSTALL_HINT_KEY, String(now));
  } catch {
    // Özel pencere / engelli depolama: ipucu bu oturumda yine kapanır.
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * PWA kurulum ipucu (States "PWA kurulum ipucu", MInstall). Android ve masaüstünde tarayıcı
 * kurulumu önerdiğinde "Ekle"; iPhone / iPad Safari'de "Paylaş → Ana Ekrana Ekle" adımları.
 * "Şimdi değil" ya da kapatınca 30 gün gösterilmez; uygulama kurulu açıldıysa hiç.
 */
export function InstallHint() {
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const promptEvent = useRef<InstallPromptEvent | null>(null);
  const titleId = useId();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const decide = (promptAvailable: boolean) => {
      const next = installHintFor({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        standalone: isStandalone(),
        promptAvailable,
        dismissedAt: readDismissed(),
        now: Date.now(),
      });
      clearTimeout(timer);
      timer = setTimeout(() => setPlatform(next), INSTALL_HINT_DELAY_MS);
    };
    const onPrompt = (e: Event) => {
      e.preventDefault(); // tarayıcının kendi bandı yerine bizim ipucumuz
      promptEvent.current = e as InstallPromptEvent;
      decide(true);
    };
    const onInstalled = () => {
      writeDismissed(Date.now());
      setPlatform(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    decide(false);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!platform) return null;

  const dismiss = () => {
    writeDismissed(Date.now());
    setPlatform(null);
  };

  const install = async () => {
    const event = promptEvent.current;
    promptEvent.current = null;
    setPlatform(null);
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") writeDismissed(Date.now());
  };

  const onDevice = /iPad/.test(navigator.userAgent) ? "iPad'de" : "iPhone'da";

  return (
    <aside
      aria-labelledby={titleId}
      data-testid="kurulum-ipucu"
      className="fixed inset-x-3 bottom-24 z-50 flex items-start gap-3 rounded-[14px] border border-line bg-surface py-3 pr-1 pl-3 text-fg shadow-elevated md:inset-x-auto md:right-6 md:bottom-6 md:w-[400px] md:items-center"
    >
      <span
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-[#2E6B55]"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="#fff">
          <rect x="2" y="2" width="9" height="9" rx="2.5" />
          <rect x="13" y="2" width="9" height="9" rx="2.5" opacity=".35" />
          <rect x="2" y="13" width="9" height="9" rx="2.5" opacity=".35" />
          <rect x="13" y="13" width="9" height="9" rx="2.5" />
        </svg>
      </span>
      {platform === "prompt" ? (
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <p className="m-0 min-w-0 flex-1">
              <span id={titleId} className="block font-medium">
                Sukano'yu ana ekrana ekle
              </span>
              <small className="block text-[13px] text-muted-foreground">
                Uygulama gibi açılır, hatırlatıcılar bildirim olarak gelir.
              </small>
            </p>
            <div className="flex gap-2">
              <Button className="h-11 md:h-[34px] md:px-3" onClick={() => void install()}>
                Ekle
              </Button>
              <Button
                variant="ghost"
                className="h-11 text-muted-foreground md:hidden"
                onClick={dismiss}
              >
                Şimdi değil
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="hidden rounded-full text-muted-foreground md:inline-flex"
            aria-label="Kapat"
            onClick={dismiss}
          >
            <X className="size-[18px]" aria-hidden="true" />
          </Button>
        </>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-2 pr-2">
          <p className="m-0">
            <span id={titleId} className="block font-medium">
              Sukano'yu ana ekrana ekle
            </span>
            <small className="block text-[13px] text-muted-foreground">
              {onDevice} hatırlatıcı bildirimleri yalnızca ana ekrana eklenen uygulamada gelir.
            </small>
          </p>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            <Step n={1}>
              Safari'nin alt çubuğunda <b className="font-semibold">Paylaş</b>{" "}
              <Share
                className="inline size-[18px] align-[-3px] text-primary"
                role="img"
                aria-label="Paylaş simgesi"
              />{" "}
              düğmesine dokun.
            </Step>
            <Step n={2}>
              Listede <b className="font-semibold">Ana Ekrana Ekle</b>'yi seç.
            </Step>
            <Step n={3}>
              Sağ üstte <b className="font-semibold">Ekle</b> ile onayla.
            </Step>
          </ol>
          <Button
            variant="ghost"
            className="h-11 self-start px-1 text-muted-foreground"
            onClick={dismiss}
          >
            Şimdi değil
          </Button>
        </div>
      )}
    </aside>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary"
        aria-hidden="true"
      >
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

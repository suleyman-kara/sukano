import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

/**
 * Görünmez Cloudflare Turnstile (PLAN §10): widget `interaction-only` görünümüyle
 * çizilir, yalnızca Cloudflare etkileşim isterse görünür. Jeton formdaki gizli
 * `cf-turnstile-response` alanına yazılır; sunucu `TURNSTILE_SECRET_KEY` ile doğrular.
 */

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      appearance?: "always" | "execute" | "interaction-only";
      language?: string;
      "response-field-name"?: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __sukanoTurnstileLoading?: Promise<TurnstileApi>;
  }
}

export const TURNSTILE_FIELD = "cf-turnstile-response";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  window.__sukanoTurnstileLoading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile yok"));
    script.onerror = () => {
      window.__sukanoTurnstileLoading = undefined;
      reject(new Error("Turnstile betiği yüklenemedi"));
    };
    document.head.appendChild(script);
  });
  return window.__sukanoTurnstileLoading;
}

export type TurnstileHandle = { reset: () => void };

export function Turnstile({ siteKey, ref }: { siteKey: string; ref?: Ref<TurnstileHandle> }) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current || widget.current) return;
        widget.current = api.render(container.current, {
          sitekey: siteKey,
          appearance: "interaction-only",
          language: "tr",
          "response-field-name": TURNSTILE_FIELD,
        });
      })
      .catch(() => {
        // Betik engellendiyse jeton boş gider; sunucu Türkçe hata döner.
      });
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  return <div ref={container} className="empty:hidden [&_iframe]:max-w-full" />;
}

/** Form altındaki bilgilendirme satırı. */
export function TurnstileNotice() {
  return (
    <p className="m-0 text-center text-xs text-muted-foreground">
      Bu form Cloudflare Turnstile ile korunur.
    </p>
  );
}

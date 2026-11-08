import { cn } from "cn";
import { WifiOff } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router";
import { Logo } from "~/components/logo";
import { buttonVariants } from "~/components/ui/button";
import { PAGE_CACHE_PREFIX } from "~/domain/pwa/offline";

type ErrorViewProps = {
  /** Tarayıcı çevrimdışı ve sayfa önbellekte yok. */
  offline?: boolean;
  details?: string;
  stack?: string;
};

/**
 * Beklenmeyen hata ya da çevrimdışıyken önbellekte olmayan sayfa (404 görünümüyle aynı
 * düzen: logo, ortada başlık, açıklama, "Notlarıma dön").
 */
export function ErrorView({ offline = false, details, stack }: ErrorViewProps) {
  useReloadFromOfflineCache(offline);
  return (
    <div className="flex min-h-dvh flex-col bg-bg px-4 py-6 text-fg md:px-8">
      <Link to="/" aria-label="Sukano, ana sayfa" className="self-start rounded-[10px]">
        <Logo size={28} />
      </Link>
      <main className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
        {offline ? (
          <>
            <span className="inline-flex size-16 items-center justify-center rounded-[18px] bg-warn-soft text-warn">
              <WifiOff className="size-[30px]" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h1 className="m-0 text-lg font-semibold">Bu sayfa çevrimdışı açılamıyor</h1>
            <p className="m-0 max-w-[320px] text-muted-foreground">
              Çevrimdışıyken yalnızca son açtığın sayfalar okunabilir. Bağlantı gelince sayfa
              açılır.
            </p>
          </>
        ) : (
          <>
            <h1 className="m-0 text-lg font-semibold">Bir şeyler ters gitti</h1>
            <p className="m-0 max-w-[320px] text-muted-foreground">
              {details ?? "Beklenmeyen bir hata oluştu. Sayfayı yenilemeyi dene."}
            </p>
          </>
        )}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={cn(buttonVariants({ variant: "default" }))}
          >
            Sayfayı yenile
          </button>
          <Link to="/" className={cn(buttonVariants({ variant: "outline" }))}>
            Notlarıma dön
          </Link>
        </div>
        {stack && (
          <pre className="mt-4 w-full max-w-2xl overflow-x-auto rounded-xl bg-hover p-4 text-left text-xs">
            <code>{stack}</code>
          </pre>
        )}
      </main>
    </div>
  );
}

/**
 * Çevrimdışıyken istemci tarafı gezinmenin verisi önbellekte yoksa ama sayfanın kendisi
 * (belge) service worker önbelleğindeyse sayfa bir kez yeniden yüklenir: belge önbellekten
 * salt okunur açılır. Aynı adres için döngüye girmez (oturum deposunda 30 sn'lik işaret).
 */
function useReloadFromOfflineCache(offline: boolean) {
  useEffect(() => {
    if (!offline || typeof caches === "undefined") return;
    const url = window.location.href.split("#")[0]!;
    const mark = `sukano:cevrimdisi-yenileme:${url}`;
    try {
      if (Date.now() - Number(sessionStorage.getItem(mark) ?? 0) < 30_000) return;
    } catch {
      return;
    }
    let cancelled = false;
    void (async () => {
      for (const name of await caches.keys()) {
        if (!name.startsWith(PAGE_CACHE_PREFIX)) continue;
        const hit = await (await caches.open(name)).match(url, { ignoreVary: true });
        if (hit && !cancelled) {
          try {
            sessionStorage.setItem(mark, String(Date.now()));
          } catch {
            return;
          }
          window.location.reload();
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offline]);
}

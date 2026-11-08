import { ImageIcon, SquareCheckBig } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "cn";
import type * as ComposerModuleNs from "./composer";
import type { ComposerProps } from "./composer";

/**
 * "Not al" alanı, tembel yüklenen (bkz. `composer.tsx`). Düzenleyici (Tiptap + ProseMirror,
 * ~120 kB gz) ızgara sayfalarının ilk yüklemesinden çıkar: sayfa önce çizilip etkileşime
 * açılır, alan parçası hidrasyondan hemen sonra arkada gelir. Gelene kadar (ve sunucuda) aynı
 * görünümde, etkileşimsiz (`aria-disabled`) bir yer tutucu görünür. Parça yüklenemezse
 * (çevrimdışı, önbellekte yok) yer tutucu kalır ve bağlantı gelince yeniden denenir.
 */
type ComposerModule = typeof ComposerModuleNs;
let loaded: ComposerModule | null = null;
let pending: Promise<ComposerModule> | null = null;

function loadComposer(): Promise<ComposerModule> {
  pending ??= import("./composer").then(
    (m) => (loaded = m),
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}

export function LazyComposer(props: ComposerProps) {
  const [mod, setMod] = useState<ComposerModule | null>(loaded);
  useEffect(() => {
    if (mod) return;
    let cancelled = false;
    const tryLoad = () =>
      loadComposer().then(
        (m) => !cancelled && setMod(m),
        () => {}, // çevrimdışı: `online` olayında yeniden denenir
      );
    void tryLoad();
    window.addEventListener("online", tryLoad);
    return () => {
      cancelled = true;
      window.removeEventListener("online", tryLoad);
    };
  }, [mod]);
  if (mod) return <mod.Composer {...props} />;
  return props.defaultOpen ? null : (
    <ComposerPlaceholder label={props.label} className={props.className} />
  );
}

const IB =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground md:size-9";

/** Kapalı "Not al" alanının etkileşimsiz kopyası (düzen kaymasın). */
function ComposerPlaceholder({
  label = "Not al…",
  className,
}: Pick<ComposerProps, "label" | "className">) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[600px] items-center gap-0.5 rounded-2xl border border-line bg-surface py-1 pr-1.5 pl-[18px] shadow-elevated md:gap-1",
        className,
      )}
    >
      <button
        type="button"
        aria-disabled="true"
        className="h-11 min-w-0 flex-1 cursor-text text-left text-[15px] text-muted-foreground outline-none"
      >
        {label}
      </button>
      <span className={IB} aria-hidden="true">
        <SquareCheckBig className="size-5" strokeWidth={1.75} />
      </span>
      <span className={cn(IB, "opacity-45")} aria-hidden="true">
        <ImageIcon className="size-5" strokeWidth={1.75} />
      </span>
    </div>
  );
}

import { FileText, ImageIcon, SquareCheckBig } from "lucide-react";
import { useRef } from "react";
import { AppShell } from "~/components/shell/app-shell";
import { ViewSwitch } from "~/components/shell/view-switch";
import { Button } from "~/components/ui/button";
import { useShellData } from "~/lib/shell";
import type { Route } from "./+types/home";

export const meta: Route.MetaFunction = () => [
  { title: "Notlarım · Sukano" },
  { name: "description", content: "Kişisel notların ve ekip projelerin, tek yerde." },
];

export default function Home() {
  const composerRef = useRef<HTMLInputElement>(null);
  const shell = useShellData();

  return (
    <AppShell {...shell} showViewSwitch>
      <section className="flex flex-col gap-[18px] px-4 pt-2 pb-10 md:gap-6 md:px-7 md:pt-3 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="m-0 text-[22px] font-bold tracking-[-0.01em] md:text-2xl">Notlarım</h1>
          <ViewSwitch className="md:hidden" />
        </div>

        {/* "Not al" alanı: YER TUTUCU, Aşama 1'de not oluşturmaya bağlanacak. */}
        <form
          aria-label="Yeni not"
          onSubmit={(e) => e.preventDefault()}
          className="mx-auto flex w-full max-w-[600px] items-center gap-0.5 rounded-2xl border border-line bg-surface py-1 pr-1.5 pl-[18px] shadow-elevated md:gap-1"
        >
          <label htmlFor="not-al" className="sr-only">
            Not al
          </label>
          <input
            ref={composerRef}
            id="not-al"
            placeholder="Not al…"
            autoComplete="off"
            className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-hover hover:text-fg md:size-9"
            aria-label="Yeni yapılacaklar notu"
            title="Yeni yapılacaklar notu"
          >
            <SquareCheckBig className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-hover hover:text-fg md:size-9"
            aria-label="Görsel ekleyerek not başlat"
            title="Görsel ekle"
          >
            <ImageIcon className="size-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </form>

        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center md:py-24">
          <span className="inline-flex size-16 items-center justify-center rounded-[18px] bg-primary-soft text-primary">
            <FileText className="size-[30px]" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <h2 className="m-0 text-lg font-semibold">Henüz not yok</h2>
          <p className="m-0 max-w-[280px] text-muted-foreground">
            Yukarıdaki &ldquo;Not al&rdquo; alanına yaz ya da bir yapılacaklar notu başlat. Notların
            yalnızca sana görünür.
          </p>
          <Button className="mt-2" onClick={() => composerRef.current?.focus()}>
            Not al
          </Button>
        </div>
      </section>
    </AppShell>
  );
}

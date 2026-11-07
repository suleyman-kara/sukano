import { Link } from "react-router";
import { Logo } from "~/components/logo";
import { buttonVariants } from "~/components/ui/button";

/** 404 görünümü (docs/design/States.dc.html "Hata · sayfa bulunamadı"). */
export function NotFoundView() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg px-4 py-6 text-fg md:px-8">
      <Link to="/" aria-label="Sukano, ana sayfa" className="self-start rounded-[10px]">
        <Logo size={28} />
      </Link>
      <main className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
        <span className="text-5xl font-bold tracking-[-0.03em] text-muted-foreground">404</span>
        <h1 className="m-0 text-lg font-semibold">Bu sayfa yok ya da erişimin kaldırılmış</h1>
        <p className="m-0 max-w-[300px] text-muted-foreground">
          Not silinmiş, proje silinmiş ya da projeden çıkarılmış olabilirsin.
        </p>
        <Link to="/" className={buttonVariants({ variant: "outline", className: "mt-2" })}>
          Notlarıma dön
        </Link>
      </main>
    </div>
  );
}

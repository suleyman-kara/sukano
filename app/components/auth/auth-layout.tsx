import { Link } from "react-router";
import { cn } from "cn";
import { Logo } from "~/components/logo";
import { RisingGrid } from "~/components/rising-grid";
import { ThemeToggle } from "~/components/theme-toggle";

/**
 * Kabuksuz kimlik sayfalarının düzeni (tasarım: Auth, TAuth, MAuth…).
 * - ≥ 1024 px: solda "Yükselen ızgara"lı tanıtım paneli, sağda 400 px form sütunu.
 * - 768–1023 px: panel renginde zemin + ızgara, ortada 460 px kart.
 * - < 768 px: düz zemin, üstte logo, tam genişlik form.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh bg-bg text-fg md:bg-panel lg:bg-bg">
      <ThemeToggle className="absolute top-3 right-3 z-10 lg:top-5 lg:right-5" />

      {/* Masaüstü: sol tanıtım paneli */}
      <aside className="relative hidden flex-[1_1_420px] flex-col justify-between overflow-hidden bg-panel px-14 py-12 lg:flex">
        <RisingGrid />
        <Link to="/giris" aria-label="Sukano, giriş" className="relative self-start">
          <Logo size={32} wordmarkSize={22} />
        </Link>
        <div className="relative flex max-w-[440px] flex-col gap-4">
          <p className="m-0 text-[40px] leading-[1.15] font-bold tracking-[-0.02em]">
            Kişisel notların ve ekip projelerin, tek yerde.
          </p>
          <p className="m-0 text-base leading-relaxed text-muted-foreground">
            Notlarını kendine sakla, projeye taşıdığında ekiple paylaş. Yapılacaklar listelerin alt
            görevlerle, tarihlerle ve klavyeyle akar.
          </p>
        </div>
        <p className="relative m-0 text-[13px] text-muted-foreground">© 2026 Sukano</p>
      </aside>

      {/* Tablet: tüm zemin panel rengi + ızgara */}
      <RisingGrid className="hidden md:block lg:hidden" />

      <main className="relative flex flex-[1_1_480px] flex-col px-6 pt-16 pb-8 md:items-center md:justify-center md:gap-7 md:px-8 md:py-12 lg:gap-0 lg:py-12">
        <Logo size={36} wordmarkSize={22} className="mb-6 md:mb-0 lg:hidden md:[&_svg]:size-8" />
        <div className="flex w-full flex-1 flex-col md:max-w-[460px] md:flex-none md:rounded-[20px] md:border md:border-line md:bg-surface md:p-9 md:pb-8 md:shadow-elevated lg:max-w-[400px] lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          {children}
        </div>
        <p className="absolute right-0 bottom-8 left-0 m-0 hidden text-center text-[13px] text-muted-foreground md:block lg:hidden">
          © 2026 Sukano
        </p>
      </main>
    </div>
  );
}

/** "Giriş yap · Kayıt ol" sekmeleri (bağlantı; `next` korunur). */
export function AuthTabs({ current, next }: { current: "giris" | "kayit"; next?: string }) {
  const suffix = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  const tab = (key: "giris" | "kayit", label: string) => (
    <Link
      to={`/${key}${suffix}`}
      aria-current={current === key ? "page" : undefined}
      className={cn(
        "inline-flex min-h-11 flex-1 items-center justify-center rounded-[9px] px-2 text-center font-medium lg:min-h-0 lg:rounded-lg lg:py-2",
        current === key
          ? "bg-surface text-fg shadow-[0_1px_2px_rgba(0,0,0,.08)]"
          : "text-muted-foreground hover:text-fg",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav
      className="flex gap-1 rounded-xl bg-hover p-[3px] lg:rounded-[10px]"
      aria-label="Giriş veya kayıt"
    >
      {tab("giris", "Giriş yap")}
      {tab("kayit", "Kayıt ol")}
    </nav>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
      <span className="h-px flex-1 bg-line" />
      veya
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Sayfa başlığı + açıklama (doğrula, şifremi unuttum, sıfırla). */
export function AuthHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 md:gap-2">
      <h1 className="m-0 text-[26px] font-bold tracking-[-0.02em] lg:text-2xl">{title}</h1>
      {children && <p className="m-0 leading-relaxed text-muted-foreground">{children}</p>}
    </div>
  );
}

/** "Girişe dön" bağlantısı. */
export function BackToLogin({ next }: { next?: string }) {
  const suffix = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <p className="m-0 text-center text-[13px] text-muted-foreground">
      <Link
        to={`/giris${suffix}`}
        className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-[3px] lg:min-h-0"
      >
        Girişe dön
      </Link>
    </p>
  );
}

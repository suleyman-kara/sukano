import { toast } from "sonner";
import { Logo } from "~/components/logo";
import { RisingGrid } from "~/components/rising-grid";
import { ThemeToggle } from "~/components/theme-toggle";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { Route } from "./+types/giris";

export const meta: Route.MetaFunction = () => [
  { title: "Giriş yap · Sukano" },
  { name: "description", content: "Kişisel notların ve ekip projelerin, tek yerde." },
];

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
      />
      <path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9l3.3-2.5Z" />
      <path
        fill="#EA4335"
        d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.8 9.4 6 12 6Z"
      />
    </svg>
  );
}

const notReady = () => toast("Giriş Aşama 1'de etkinleşecek.");

/**
 * Giriş formu: YER TUTUCU. Gerçek akış (e-posta + şifre, Google, kayıt,
 * doğrulama, sıfırlama, Turnstile) Aşama 1'de Better Auth ile gelecek.
 */
function LoginForm() {
  return (
    <div className="flex flex-col gap-5">
      <div
        className="flex gap-1 rounded-xl bg-hover p-[3px] lg:rounded-[10px]"
        role="group"
        aria-label="Giriş veya kayıt"
      >
        <button
          type="button"
          aria-pressed="true"
          className="min-h-11 flex-1 rounded-[9px] bg-surface px-2 text-center font-medium text-fg shadow-[0_1px_2px_rgba(0,0,0,.08)] lg:min-h-0 lg:rounded-lg lg:py-2"
        >
          Giriş yap
        </button>
        <button
          type="button"
          aria-pressed="false"
          onClick={notReady}
          className="min-h-11 flex-1 rounded-[9px] px-2 text-center font-medium text-muted-foreground lg:min-h-0 lg:rounded-lg lg:py-2"
        >
          Kayıt ol
        </button>
      </div>

      <Button
        variant="outline"
        type="button"
        onClick={notReady}
        className="h-12 gap-2.5 text-base md:h-11 md:text-sm lg:h-[38px]"
      >
        <GoogleIcon />
        Google ile devam et
      </Button>

      <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
        <span className="h-px flex-1 bg-line" />
        veya
        <span className="h-px flex-1 bg-line" />
      </div>

      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          notReady();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="eposta" className="text-[13px] font-medium">
            E-posta
          </Label>
          <Input
            id="eposta"
            type="email"
            autoComplete="email"
            placeholder="ad@ornek.com"
            className="h-12 rounded-xl px-3.5 text-base md:h-11 md:rounded-[10px] md:text-sm lg:h-10"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="sifre" className="text-[13px] font-medium">
              Şifre
            </Label>
            <button
              type="button"
              onClick={notReady}
              className="-my-3 inline-flex min-h-11 items-center text-[13px] font-medium text-primary underline underline-offset-[3px] lg:my-0 lg:min-h-0"
            >
              Şifremi unuttum
            </button>
          </div>
          <Input
            id="sifre"
            type="password"
            autoComplete="current-password"
            className="h-12 rounded-xl px-3.5 text-base md:h-11 md:rounded-[10px] md:text-sm lg:h-10"
          />
        </div>
        <Button
          type="submit"
          className="h-12 rounded-xl text-base md:h-11 md:rounded-[10px] md:text-sm lg:h-[38px]"
        >
          Giriş yap
        </Button>
      </form>

      <p className="m-0 text-center text-[13px] text-muted-foreground">
        Hesabın yok mu?{" "}
        <button
          type="button"
          onClick={notReady}
          className="font-medium text-primary underline underline-offset-[3px]"
        >
          Kayıt ol
        </button>
      </p>
    </div>
  );
}

export default function Giris() {
  return (
    <div className="relative flex min-h-dvh bg-bg text-fg md:bg-panel lg:bg-bg">
      <ThemeToggle className="absolute top-3 right-3 z-10 lg:top-5 lg:right-5" />

      {/* Masaüstü: sol tanıtım paneli */}
      <aside className="relative hidden flex-[1_1_420px] flex-col justify-between overflow-hidden bg-panel px-14 py-12 lg:flex">
        <RisingGrid />
        <Logo size={32} wordmarkSize={22} className="relative" />
        <div className="relative flex max-w-[440px] flex-col gap-4">
          <h1 className="m-0 text-[40px] leading-[1.15] font-bold tracking-[-0.02em]">
            Kişisel notların ve ekip projelerin, tek yerde.
          </h1>
          <p className="m-0 text-base leading-relaxed text-muted-foreground">
            Notlarını kendine sakla, projeye taşıdığında ekiple paylaş. Yapılacaklar listelerin alt
            görevlerle, tarihlerle ve klavyeyle akar.
          </p>
        </div>
        <p className="relative m-0 text-[13px] text-muted-foreground">© 2026 Sukano</p>
      </aside>

      {/* Tablet: tüm zemin panel rengi + ızgara */}
      <RisingGrid className="hidden md:block lg:hidden" />

      <section className="relative flex flex-[1_1_480px] flex-col px-6 pt-[72px] pb-8 md:items-center md:justify-center md:gap-7 md:px-8 md:py-12 lg:gap-0 lg:py-12">
        <Logo size={36} wordmarkSize={22} className="mb-6 md:mb-0 lg:hidden md:[&_svg]:size-8" />
        <div className="w-full md:max-w-[460px] md:rounded-[20px] md:border md:border-line md:bg-surface md:p-9 md:pb-8 md:shadow-elevated lg:max-w-[400px] lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <div className="mb-6 md:mb-5 lg:hidden">
            <h1 className="m-0 mb-1.5 text-[26px] font-bold tracking-[-0.02em]">
              Tekrar hoş geldin
            </h1>
            <p className="m-0 text-muted-foreground">Notların ve projelerin seni bekliyor.</p>
          </div>
          <LoginForm />
        </div>
      </section>
    </div>
  );
}

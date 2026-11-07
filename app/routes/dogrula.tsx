import { Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { data, Form, useNavigation } from "react-router";
import { AuthHeading, BackToLogin } from "~/components/auth/auth-layout";
import { AUTH_BUTTON, FormMessage } from "~/components/auth/fields";
import { Button } from "~/components/ui/button";
import { safeNext } from "~/domain/auth/redirects";
import { isValidEmail, normalizeEmail } from "~/domain/auth/rules";
import { authFrom, callAuth, field } from "~/lib/auth-api.server";
import type { Route } from "./+types/dogrula";

export const meta: Route.MetaFunction = () => [{ title: "E-postanı doğrula · Sukano" }];

/** Tekrar gönder düğmesinin bekleme süresi (sn). */
const RESEND_COOLDOWN = 60;

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const email = normalizeEmail(url.searchParams.get("eposta") ?? "");
  return {
    email: isValidEmail(email) ? email : null,
    next: safeNext(url.searchParams.get("next")),
    unverifiedLogin: url.searchParams.get("neden") === "dogrulanmadi",
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { auth } = authFrom(context);
  const form = await request.formData();
  const email = normalizeEmail(field(form, "email"));
  if (!isValidEmail(email)) {
    return data(
      { ok: false as const, message: "Geçerli bir e-posta adresi yaz." },
      { status: 400 },
    );
  }
  const result = await callAuth(() =>
    auth.api.sendVerificationEmail({
      body: { email, callbackURL: safeNext(field(form, "next")) },
      headers: request.headers,
      returnHeaders: true,
    }),
  );
  if (!result.ok) {
    return data({ ok: false as const, message: result.message }, { status: result.status });
  }
  return { ok: true as const, message: "Yeni bir doğrulama bağlantısı gönderdik.", at: Date.now() };
}

/** Kalan bekleme süresi (sn). `startedAt` değişince sayaç baştan başlar. */
function useCooldown(startedAt: number) {
  const [now, setNow] = useState(startedAt);
  const left = Math.max(0, RESEND_COOLDOWN - Math.floor((now - startedAt) / 1000));
  useEffect(() => {
    if (left <= 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [left, startedAt]);
  return Math.min(left, RESEND_COOLDOWN);
}

export default function Dogrula({ loaderData, actionData }: Route.ComponentProps) {
  const { email, next, unverifiedLogin } = loaderData;
  const navigation = useNavigation();
  const sending = navigation.state === "submitting";
  const [mountedAt] = useState(() => Date.now());
  const left = useCooldown(actionData?.ok ? actionData.at : mountedAt);

  return (
    <div className="flex flex-1 flex-col justify-center gap-[18px] pb-10 md:pb-0 lg:gap-5">
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Mail className="size-7" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <AuthHeading title="E-postanı doğrula" />
      {unverifiedLogin && !actionData && (
        <FormMessage tone="info">
          Hesabın henüz doğrulanmadı. Giriş yapabilmen için yeni bir doğrulama bağlantısı gönderdik.
        </FormMessage>
      )}
      <p className="m-0 leading-relaxed text-muted-foreground">
        {email ? (
          <>
            <strong className="font-semibold text-fg">{email}</strong> adresine bir doğrulama
            bağlantısı gönderdik.
          </>
        ) : (
          "E-posta adresine bir doğrulama bağlantısı gönderdik."
        )}{" "}
        Bağlantıya tıkladığında hesabın açılır ve projelere davet alabilirsin.
      </p>

      {actionData && (
        <FormMessage tone={actionData.ok ? "success" : "error"}>{actionData.message}</FormMessage>
      )}

      {email && (
        <Form method="post" replace>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={next} />
          <Button
            type="submit"
            variant="outline"
            disabled={sending || left > 0}
            className={`${AUTH_BUTTON} border-line bg-surface hover:bg-hover`}
          >
            {left > 0
              ? `Bağlantıyı tekrar gönder (${left} sn)`
              : sending
                ? "Gönderiliyor…"
                : "Bağlantıyı tekrar gönder"}
          </Button>
        </Form>
      )}
      <BackToLogin next={next} />
    </div>
  );
}

import { isLocalUrl } from "~/domain/auth/links";
import { getCloudflare } from "~/lib/context";
import { getOutbox } from "~/lib/email.server";
import type { Route } from "./+types/__test.outbox";

/**
 * Yalnızca geliştirme ve uçtan uca testler için: yerel posta kutusundaki
 * iletiler (`GET /__test/outbox?to=adres`). Açık olması için Resend anahtarı
 * tanımlı olmamalı ve ya geliştirme sunucusu (`import.meta.env.DEV`) çalışmalı ya
 * da uygulama yerel bir adreste olmalı (`BETTER_AUTH_URL` localhost/127.0.0.1;
 * `vite preview` ile uçtan uca testler). Üretim ve önizleme dağıtımlarında 404.
 */
export function loader({ request, context }: Route.LoaderArgs) {
  const { env } = getCloudflare(context);
  const enabled = !env.RESEND_API_KEY && (import.meta.env.DEV || isLocalUrl(env.BETTER_AUTH_URL));
  if (!enabled) return new Response("Bulunamadı", { status: 404 });

  const to = new URL(request.url).searchParams.get("to")?.toLowerCase();
  const messages = getOutbox().filter((m) => !to || m.to.toLowerCase() === to);
  return Response.json(
    messages.map(({ to, subject, text, kind, url, sentAt }) => ({
      to,
      subject,
      text,
      kind,
      url,
      sentAt,
    })),
    { headers: { "Cache-Control": "no-store" } },
  );
}

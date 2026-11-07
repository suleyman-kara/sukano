import { getCloudflare } from "~/lib/context";
import { getOutbox } from "~/lib/email.server";
import type { Route } from "./+types/__test.outbox";

/**
 * Yalnızca geliştirme ve uçtan uca testler için: yerel posta kutusundaki
 * iletiler (`GET /__test/outbox?to=adres`). Açık olması için Resend anahtarı
 * olmamalı ve ya geliştirme sunucusu (`import.meta.env.DEV`) ya da
 * `SUKANO_TEST_UCLARI=1` (yalnızca `.dev.vars`) olmalı. Üretimde 404.
 */
export function loader({ request, context }: Route.LoaderArgs) {
  const env = getCloudflare(context).env as Env & { SUKANO_TEST_UCLARI?: string };
  const enabled = !env.RESEND_API_KEY && (import.meta.env.DEV || env.SUKANO_TEST_UCLARI === "1");
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

import { isLocalUrl } from "~/domain/auth/links";
import { getCloudflare } from "~/lib/context";
import { runReminderJob } from "~/lib/reminders.server";
import type { Route } from "./+types/__test.cron";

/**
 * Yalnızca geliştirme ve uçtan uca testler için: dakikalık cron'un hatırlatıcı işini
 * sahte saatle çalıştırır (`POST /__test/cron?now=<ISO ya da ms>`; `now` yoksa şimdi).
 * `/__test/outbox` ile aynı koruma: Resend anahtarı yokken ve geliştirme sunucusunda ya da
 * yerel adreste açık; üretim ve önizleme dağıtımlarında 404. Push hizmetine istek gitmez.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const { env } = getCloudflare(context);
  const enabled = !env.RESEND_API_KEY && (import.meta.env.DEV || isLocalUrl(env.BETTER_AUTH_URL));
  if (!enabled) return new Response("Bulunamadı", { status: 404 });
  const raw = new URL(request.url).searchParams.get("now");
  const now = raw ? new Date(/^\d+$/.test(raw) ? Number(raw) : raw) : new Date();
  if (Number.isNaN(now.getTime())) return new Response("Geçersiz zaman", { status: 400 });
  const result = await runReminderJob(env, now, async () => new Response(null, { status: 201 }));
  return Response.json(
    { now: now.toISOString(), ...result },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export function loader() {
  return new Response("Bulunamadı", { status: 404 });
}

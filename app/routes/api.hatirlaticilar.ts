import { data } from "react-router";
import { parseReminderIntent } from "~/domain/reminders/validation";
import { apiError } from "~/lib/api-errors.server";
import { assertSameOrigin } from "~/lib/auth-api.server";
import { getCloudflare } from "~/lib/context";
import { clearNoteReminder, setNoteReminder, setTaskReminder } from "~/lib/reminders.server";
import { requireUser } from "~/lib/session.server";
import type { Route } from "./+types/api.hatirlaticilar";

/**
 * Hatırlatıcı kurma ve kaldırma (form, `intent`):
 * - `note` (`noteId`, `date` YYYY-MM-DD, `time` HH:MM, `timeZone?`) → `{ ok, at }` (ISO)
 * - `note-clear` (`noteId`) → `{ ok }`
 * - `task` (`noteId`, `taskId`, `on` 1|0, `timeZone?`) → `{ ok, at }` (kapalıysa null)
 * Saat kişinin saat diliminde yorumlanır (`timeZone` verilirse o, saklanır). Hatalar:
 * 400 geçersiz form, 403 görüntüleyici, 404 not yok / erişim yok, 409 çöpteki not,
 * bitiş tarihi olmayan görev.
 */
export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { user } = await requireUser(request, context);
  if (request.method !== "POST")
    return data({ ok: false as const, error: "Yöntem desteklenmiyor" }, { status: 405 });
  const parsed = parseReminderIntent(Object.fromEntries(await request.formData()));
  if (!parsed.ok) return data({ ok: false as const, error: parsed.error }, { status: 400 });
  const { env } = getCloudflare(context);
  const intent = parsed.value;
  try {
    switch (intent.intent) {
      case "note": {
        const at = await setNoteReminder(env, user.id, intent);
        return { ok: true as const, at: new Date(at).toISOString() };
      }
      case "note-clear":
        await clearNoteReminder(env, user.id, intent.noteId);
        return { ok: true as const, at: null };
      case "task": {
        const at = await setTaskReminder(env, user.id, intent);
        return { ok: true as const, at: at === null ? null : new Date(at).toISOString() };
      }
    }
  } catch (error) {
    return apiError(error);
  }
}

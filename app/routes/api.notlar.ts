import { data } from "react-router";
import { parseNoteIntent } from "~/domain/notes/validation";
import { getCloudflare } from "~/lib/context";
import { NoteConflictError, NoteNotFoundError, personalNotes } from "~/lib/notes.server";
import { requireUser } from "~/lib/session.server";
import { personalTasks } from "~/lib/tasks.server";
import type { Route } from "./+types/api.notlar";

/**
 * Not eylemleri (POST, form verisi; `intent` alanı işlemi seçer). Arayüz bunları
 * `useNoteActions()` ile fetcher üzerinden gönderir; tamamlanınca loader'lar
 * yeniden doğrulanır.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const { user } = await requireUser(request, context);
  const parsed = parseNoteIntent(Object.fromEntries(await request.formData()));
  if (!parsed.ok) return data({ ok: false as const, error: parsed.error }, { status: 400 });
  try {
    const env = getCloudflare(context).env;
    const intent = parsed.value;
    const result =
      intent.intent === "create-todo" || intent.intent === "convert"
        ? await personalTasks(env, user.id).run(intent)
        : await personalNotes(env, user.id).run(intent);
    return { ok: true as const, ...(result ?? {}) };
  } catch (error) {
    if (error instanceof NoteNotFoundError) {
      return data({ ok: false as const, error: "Not bulunamadı" }, { status: 404 });
    }
    if (error instanceof NoteConflictError) {
      return data({ ok: false as const, error: error.message }, { status: 409 });
    }
    throw error;
  }
}

export function loader() {
  throw data(null, { status: 405 });
}

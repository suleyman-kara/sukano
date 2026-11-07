import { data } from "react-router";
import { parseNoteIntent } from "~/domain/notes/validation";
import { getCloudflare } from "~/lib/context";
import { NoteNotFoundError, personalNotes } from "~/lib/notes.server";
import { requireUser } from "~/lib/session.server";
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
    const result = await personalNotes(getCloudflare(context).env, user.id).run(parsed.value);
    return { ok: true as const, ...(result ?? {}) };
  } catch (error) {
    if (error instanceof NoteNotFoundError) {
      return data({ ok: false as const, error: "Not bulunamadı" }, { status: 404 });
    }
    throw error;
  }
}

export function loader() {
  throw data(null, { status: 405 });
}

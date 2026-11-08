/**
 * Canlı WebSocket yollarının Worker tarafı (React Router'dan önce ele alınır; 101 yanıtı
 * doğrudan döner). Yetki burada denetlenir, odaya yalnızca güvenilir başlıklarla gidilir:
 *
 * | Yol                          | Oda                          | Yetki                                   |
 * | ---------------------------- | ---------------------------- | --------------------------------------- |
 * | `GET /api/notlar/:id/canli`  | `NoteRoom` (not kimliği)     | notun sahibi ya da proje üyesi (rol)    |
 * | `GET /api/kanal/proje/:id`   | `ProjectRoom` (`proje:<id>`) | proje üyesi (her rol)                   |
 * | `GET /api/kanal/kisisel`     | `ProjectRoom` (`kisi:<uid>`) | oturumdaki kişi                          |
 *
 * Hatalar: 426 WebSocket değil, 405 yöntem, 403 başka kökenden (Origin), 401 oturum yok,
 * 404 not / proje yok ya da üye değil (varlık sızmaz), çöpteki not 404.
 */
import { and, eq } from "drizzle-orm";
import { createDb } from "~/db/client";
import { notes } from "~/db/schema";
import { can } from "~/domain/projects/permissions";
import { channelName, parseLivePath } from "~/domain/realtime/protocol";
import { getAuth } from "~/lib/auth.server";
import { avatarColorFor } from "~/lib/avatar";
import { noteScope } from "~/lib/note-access.server";
import { NoteNotFoundError } from "~/lib/notes.server";
import { memberRole, ProjectNotFoundError } from "~/lib/project-access.server";
import { ROOM_HEADERS } from "./note-room";
import { CHANNEL_USER_HEADER } from "./project-room";

const text = (body: string, status: number) => new Response(body, { status });

/** WebSocket çapraz site ele geçirmeye karşı: tarayıcı Origin'i aynı kökten olmalı. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true; // tarayıcı dışı istemci; çerez yine gerekir
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function forward(request: Request, headers: Record<string, string>): Request {
  const h = new Headers(request.headers);
  for (const [k, v] of Object.entries(headers)) h.set(k, v);
  return new Request(request.url, { method: "GET", headers: h });
}

/** Canlı yol değilse `null`. */
export async function routeLive(request: Request, env: Env): Promise<Response | null> {
  const route = parseLivePath(new URL(request.url).pathname);
  if (!route) return null;
  if (request.method !== "GET") return text("Yöntem desteklenmiyor", 405);
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return text("WebSocket bekleniyor", 426);
  }
  if (!sameOrigin(request)) return text("Başka kökenden bağlantı reddedildi", 403);
  const session = await getAuth(env).api.getSession({ headers: request.headers });
  if (!session) return text("Oturum gerekli", 401);
  const { user } = session;
  const db = createDb(env.DB);

  if (route.kind === "note") {
    try {
      const scope = await noteScope(db, user.id, route.noteId);
      const row = await db
        .select({ trashedAt: notes.trashedAt })
        .from(notes)
        .where(and(eq(notes.id, route.noteId)))
        .get();
      if (!row || row.trashedAt) return text("Not bulunamadı", 404);
      const readOnly = scope.kind === "project" && !can(scope.role, "note.edit");
      const presence = {
        id: user.id,
        name: user.name,
        color: (user as { avatarColor?: string | null }).avatarColor ?? avatarColorFor(user.id),
        avatarUrl: user.image ?? null,
      };
      return env.NOTE_ROOM.getByName(route.noteId).fetch(
        forward(request, {
          [ROOM_HEADERS.user]: encodeURIComponent(JSON.stringify(presence)),
          [ROOM_HEADERS.note]: route.noteId,
          [ROOM_HEADERS.readOnly]: readOnly ? "1" : "0",
        }),
      );
    } catch (error) {
      if (error instanceof NoteNotFoundError) return text("Not bulunamadı", 404);
      throw error;
    }
  }

  if (route.kind === "project") {
    try {
      await memberRole(db, user.id, route.projectId);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) return text("Proje bulunamadı", 404);
      throw error;
    }
    return env.PROJECT_ROOM.getByName(
      channelName({ kind: "project", projectId: route.projectId }),
    ).fetch(forward(request, { [CHANNEL_USER_HEADER]: user.id }));
  }

  return env.PROJECT_ROOM.getByName(channelName({ kind: "personal", userId: user.id })).fetch(
    forward(request, { [CHANNEL_USER_HEADER]: user.id }),
  );
}

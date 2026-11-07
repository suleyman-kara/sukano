import { DurableObject } from "cloudflare:workers";

/**
 * Not odası: not başına bir Durable Object (`NOTE_ROOM.idFromName(noteId)`).
 *
 * Şimdilik İSKELET: WebSocket Hibernation API'siyle bağlantı kabul eder ve gelen
 * her mesajı odadaki tüm bağlantılara (gönderen dahil) yayınlar. Yetki denetimi
 * Worker'da, odaya yönlendirmeden önce yapılacak. Yjs eşitleme, varlık ve canlı
 * ızgara mantığı Aşama 4'te gelir.
 */
export class NoteRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket bekleniyor", { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    // Hibernation: bağlantı DO uyurken de açık kalır; mesajlar aşağıdaki
    // webSocketMessage/webSocketClose işleyicilerine gelir.
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // TODO(Aşama 4): Yjs güncellemeleri, farkındalık (varlık) ve kalıcı depolama.
    for (const peer of this.ctx.getWebSockets()) {
      try {
        peer.send(message);
      } catch {
        // Kapanmakta olan bağlantı; yok say.
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close(1011, "Hata");
  }
}

const ROOM_PATH = /^\/api\/notes\/([A-Za-z0-9_-]{1,128})\/ws$/;

/**
 * `GET /api/notes/:noteId/ws` (WebSocket yükseltmesi) → not odası. Oturum zorunlu.
 * Eşleşmeyen isteklerde `null` döner.
 */
export async function routeToNoteRoom(
  request: Request,
  env: Env,
  getUserId: (request: Request) => Promise<string | null>,
): Promise<Response | null> {
  const match = ROOM_PATH.exec(new URL(request.url).pathname);
  if (!match) return null;
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("WebSocket bekleniyor", { status: 426 });
  }
  const userId = await getUserId(request);
  if (!userId) return new Response("Oturum gerekli", { status: 401 });
  // TODO(Aşama 4): notun sahibi ya da proje üyesi mi denetle.
  const noteId = match[1]!;
  return env.NOTE_ROOM.getByName(noteId).fetch(request);
}

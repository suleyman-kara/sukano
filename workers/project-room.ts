import { DurableObject } from "cloudflare:workers";
import { CLOSE_CODES, type ChannelServerMessage } from "~/domain/realtime/protocol";
import type { ChannelEvent } from "~/domain/realtime/grid-events";

/** Worker'ın odaya ilettiği kullanıcı kimliği başlığı (yetki Worker'da denetlenir). */
export const CHANNEL_USER_HEADER = "x-sukano-kullanici-id";

/**
 * Yayın kanalı: proje başına (`proje:<projectId>`) ve kişisel alan için kişi başına
 * (`kisi:<userId>`) bir Durable Object. Yalnızca sunucudan istemciye: değişiklik D1'e
 * yazıldıktan sonra Worker ya da NoteRoom `publish` RPC'siyle küçük bir olay gönderir,
 * oda sıra numarası verip tüm bağlantılara iletir. Görüntüleyici de alır.
 * WebSocket Hibernation: boşta bağlantılar odayı uyanık tutmaz.
 */
export class ProjectRoom extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  private get seq(): number {
    const row = this.sql
      .exec<{ value: string }>(`SELECT value FROM meta WHERE key = 'seq'`)
      .toArray()[0];
    return Number(row?.value ?? 0);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket bekleniyor", { status: 426 });
    }
    const userId = request.headers.get(CHANNEL_USER_HEADER);
    if (!userId) return new Response("Yetkisiz", { status: 401 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [userId]);
    server.send(JSON.stringify({ t: "hosgeldin", seq: this.seq } satisfies ChannelServerMessage));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Olayı yayınlar; verilen sıra numarasını döner. */
  async publish(event: ChannelEvent): Promise<number> {
    const seq = this.seq + 1;
    this.sql.exec(`INSERT OR REPLACE INTO meta (key, value) VALUES ('seq', ?)`, String(seq));
    const message = JSON.stringify({ t: "olay", seq, event } satisfies ChannelServerMessage);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(message);
      } catch {
        // Kapanmakta olan bağlantı.
      }
    }
    return seq;
  }

  /** Kişinin bu kanaldaki bağlantılarını kapatır (projeden çıkarıldı). */
  async disconnectUser(userId: string, code: number = CLOSE_CODES.erisimYok): Promise<void> {
    for (const ws of this.ctx.getWebSockets(userId)) {
      try {
        ws.close(code, "Erişim yok");
      } catch {
        // Zaten kapandı.
      }
    }
  }

  async webSocketMessage(): Promise<void> {
    // İstemciden uygulama iletisi beklenmez (canlılık yoklaması otomatik yanıtlanır).
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, reason);
    } catch {
      // Zaten kapandı.
    }
  }
}

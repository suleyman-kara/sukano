import { createRequestHandler, RouterContextProvider } from "react-router";
import { getAuth } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/context";
import { routeToNoteRoom } from "./note-room";
import { runScheduled } from "./scheduled";

export { NoteRoom } from "./note-room";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    // WebSocket odaları React Router'dan önce ele alınır (101 yanıtı doğrudan döner).
    const room = await routeToNoteRoom(request, env, async (req) => {
      const session = await getAuth(env).api.getSession({ headers: req.headers });
      return session?.user.id ?? null;
    });
    if (room) return room;

    // `v8_middleware` açık: yükleme bağlamı bir RouterContextProvider'dır.
    // Loader/action/middleware içinde `getCloudflare(context)` ile okunur.
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return requestHandler(request, context);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller, env));
  },
} satisfies ExportedHandler<Env>;

import { createRequestHandler, RouterContextProvider } from "react-router";
import { cloudflareContext } from "~/lib/context";
import { routeLive } from "./live-routes";
import { runScheduled } from "./scheduled";

export { NoteRoom } from "./note-room";
export { ProjectRoom } from "./project-room";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    // Canlı WebSocket yolları (not odası, proje / kişisel kanal) React Router'dan önce
    // ele alınır: yetki denetlenir, 101 yanıtı Durable Object'ten doğrudan döner.
    const live = await routeLive(request, env);
    if (live) return live;

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

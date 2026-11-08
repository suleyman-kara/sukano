import { createRequestHandler, RouterContextProvider } from "react-router";
import { createNonce, isCrossOriginWrite, securityHeaders } from "~/domain/security/headers";
import { cloudflareContext } from "~/lib/context";
import { routeLive } from "./live-routes";
import { runScheduled } from "./scheduled";

export { NoteRoom } from "./note-room";
export { ProjectRoom } from "./project-room";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

/**
 * Belge CSP'si geliştirme sunucusunda kapalı: Vite'ın HMR istemcisi nonce'suz satır içi
 * betik ekler. Üretimde, önizlemede (`vite preview`) ve Worker testlerinde açık.
 */
const DOCUMENT_CSP = import.meta.env.MODE !== "development";

export default {
  async fetch(request, env, ctx) {
    // CSRF (derinlemesine savunma): başka kökenden gelen durum değiştiren istek, hangi
    // rotaya gittiğine bakılmadan reddedilir. Better Auth kendi köken denetimini yapar.
    if (isCrossOriginWrite(request)) {
      return withSecurityHeaders(
        Response.json({ ok: false, error: "İzin verilmeyen köken" }, { status: 403 }),
        request,
      );
    }

    // Canlı WebSocket yolları (not odası, proje / kişisel kanal) React Router'dan önce
    // ele alınır: yetki denetlenir, 101 yanıtı Durable Object'ten doğrudan döner.
    const live = await routeLive(request, env);
    if (live) return live.status === 101 ? live : withSecurityHeaders(live, request);

    // `v8_middleware` açık: yükleme bağlamı bir RouterContextProvider'dır.
    // Loader/action/middleware içinde `getCloudflare(context)` ile okunur.
    const nonce = DOCUMENT_CSP ? createNonce() : undefined;
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx, nonce });
    return withSecurityHeaders(await requestHandler(request, context), request, nonce);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller, env));
  },
} satisfies ExportedHandler<Env>;

/**
 * Güvenlik başlıklarını ekler (bkz. `app/domain/security/headers.ts`). Rotanın kendi
 * koyduğu başlık (ör. ek indirmenin `sandbox` CSP'si) korunur.
 */
function withSecurityHeaders(response: Response, request: Request, nonce?: string): Response {
  const headers = securityHeaders(response.headers.get("content-type"), {
    url: request.url,
    nonce,
  });
  let out = response;
  try {
    for (const [name, value] of headers) if (!out.headers.has(name)) out.headers.set(name, value);
  } catch {
    // Değişmez başlıklı yanıt (ör. `Response.redirect`): kopyası üzerinde yazılır.
    out = new Response(response.body, response);
    for (const [name, value] of headers) if (!out.headers.has(name)) out.headers.set(name, value);
  }
  return out;
}

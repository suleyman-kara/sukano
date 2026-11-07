import { createRequestHandler } from "react-router";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

// Worker giriş noktası. Veri katmanı burada `env`/`ctx` değerlerini
// React Router bağlamına (getLoadContext / RouterContextProvider) aktaracak,
// Durable Object sınıflarını dışa aktaracak ve `scheduled` (cron) işleyicisini
// ekleyecek.
export default {
  async fetch(request) {
    return requestHandler(request);
  },
} satisfies ExportedHandler<Env>;

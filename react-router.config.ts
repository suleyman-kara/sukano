import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // Paralel uçtan uca koşuları için ayrı derleme klasörü seçilebilir (varsayılan `build`).
  buildDirectory: process.env.SUKANO_BUILD_DIR ?? "build",
  future: {
    v8_middleware: true,
    v8_passThroughRequests: true,
    v8_splitRouteModules: true,
    v8_trailingSlashAwareDataRequests: true,
    v8_viteEnvironmentApi: true,
  },
} satisfies Config;

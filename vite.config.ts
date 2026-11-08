import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Uçtan uca testler ayrı bir yerel durum klasörü kullanır (`SUKANO_PERSIST_DIR`,
// bkz. tests/e2e/global-setup.ts); geliştirme verisine dokunulmaz.
const persistDir = process.env.SUKANO_PERSIST_DIR;

export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      persistState: persistDir ? { path: persistDir } : true,
    }),
    tailwindcss(),
    reactRouter(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});

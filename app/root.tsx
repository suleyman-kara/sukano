import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { NotFoundView } from "~/components/not-found";
import { Toaster } from "~/components/ui/sonner";
import { TooltipProvider } from "~/components/ui/tooltip";
import { isPublicPath, stripDataSuffix } from "~/domain/auth/redirects";
import { protectRoute } from "~/lib/session.server";
import { loadShellData } from "~/lib/shell.server";
import { themeInitScript } from "~/lib/theme";

export const links: Route.LinksFunction = () => [
  {
    rel: "preload",
    href: "/fonts/onest-latin.woff2",
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  },
  {
    rel: "preload",
    href: "/fonts/onest-latin-ext.woff2",
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/manifest.webmanifest" },
];

/**
 * Oturum koruması (varsayılan kapalı): kimlik sayfaları, `/health`, `/api/auth/*`
 * dışındaki her yol oturum ister; yoksa `/giris?next=…`. Middleware loader'lardan
 * önce çalıştığı için korumalı rotaların loader'ları oturumsuz hiç çalışmaz.
 */
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request, context }) => {
    await protectRoute(request, context);
  },
];

/**
 * Kabuk verisi (kullanıcı, projeler, sayaçlar). Kabuksuz kimlik sayfalarında
 * `null`: oturumsuz ziyaretçiye boş kabuk verisi gönderilmez.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const pathname = stripDataSuffix(new URL(request.url).pathname);
  if (isPublicPath(pathname)) return { shell: null };
  return { shell: await loadShellData(request, context) };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* Tema ve sol panel durumu ilk boyamadan önce uygulanır (FOUC önleyici). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <meta name="theme-color" content="#F7F6F2" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#141413" media="(prefers-color-scheme: dark)" />
        <Meta />
        <Links />
      </head>
      <body>
        <TooltipProvider delayDuration={400}>{children}</TooltipProvider>
        <Toaster />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundView />;
  }

  let details = "Beklenmeyen bir hata oluştu. Sayfayı yenilemeyi dene.";
  let stack: string | undefined;
  if (isRouteErrorResponse(error)) {
    details = error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-3 p-6">
      <h1 className="text-lg font-semibold">Bir şeyler ters gitti</h1>
      <p className="text-muted-foreground">{details}</p>
      {stack && (
        <pre className="w-full overflow-x-auto rounded-xl bg-hover p-4 text-xs">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}

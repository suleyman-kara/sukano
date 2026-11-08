import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { ErrorView } from "~/components/error-view";
import { MotionPreferenceConfig } from "~/components/motion-config";
import { NotFoundView } from "~/components/not-found";
import { InstallHint } from "~/components/pwa/install-hint";
import { ServiceWorkerManager } from "~/components/pwa/service-worker";
import { LiveConfigProvider } from "~/components/realtime/live-context";
import { Toaster } from "~/components/ui/sonner";
import { TooltipProvider } from "~/components/ui/tooltip";
import { isPublicPath, stripDataSuffix } from "~/domain/auth/redirects";
import { useNonce } from "~/lib/nonce";
import { markOfflineSession } from "~/lib/offline-session.server";
import { protectRoute } from "~/lib/session.server";
import { motionAttribute, parseMotionCookie } from "~/lib/motion";
import { loadShellData } from "~/lib/shell.server";
import { themeInitScript } from "~/lib/theme";
import { revalidateUnlessOffline } from "~/lib/offline-revalidate";

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
  async ({ request, context }, next) => {
    await protectRoute(request, context);
    // Çevrimdışı önbelleğin oturum işareti (bkz. `public/sw.js`).
    return markOfflineSession(request, context, await next());
  },
];

/** Çevrimdışıyken ekrandaki veri kalır (bkz. `app/lib/offline-revalidate.ts`). */
export const shouldRevalidate = revalidateUnlessOffline;

/**
 * Kabuk verisi (kullanıcı, projeler, sayaçlar). Kabuksuz kimlik sayfalarında
 * `null`: oturumsuz ziyaretçiye boş kabuk verisi gönderilmez.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const pathname = stripDataSuffix(new URL(request.url).pathname);
  // "Hareketi azalt": oturumda kullanıcı tercihi, oturumsuz sayfalarda çerez (app/lib/motion.ts).
  const cookieMotion = parseMotionCookie(request.headers.get("cookie"));
  if (isPublicPath(pathname)) return { shell: null, motion: cookieMotion };
  const shell = await loadShellData(request, context);
  return { shell, motion: shell.motion ?? cookieMotion };
}

export function Layout({ children }: { children: React.ReactNode }) {
  // Hareket tercihi sunucuda yazılır: ilk boyamada animasyon titremesi olmaz.
  const root = useRouteLoaderData<typeof loader>("root");
  const motion = root?.motion ? motionAttribute(root.motion) : undefined;
  const nonce = useNonce();
  return (
    <html lang="tr" data-motion={motion} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* Tema ve sol panel durumu ilk boyamadan önce uygulanır (FOUC önleyici). */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        <meta name="theme-color" content="#F7F6F2" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#141413" media="(prefers-color-scheme: dark)" />
        {/* PWA: ana ekrandan açılınca adı ve durum çubuğu (iOS). */}
        <meta name="application-name" content="Sukano" />
        <meta name="apple-mobile-web-app-title" content="Sukano" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
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

/**
 * Canlı katman (not odası, kanallar) yalnızca oturum varken açılır; bileşen testleri ve
 * kabuksuz sayfalar sağlayıcısız (kapalı) çalışır.
 */
export default function App({ loaderData }: Route.ComponentProps) {
  const user = loaderData?.shell?.user;
  const me = user?.id
    ? { id: user.id, name: user.name, color: user.avatarColor, avatarUrl: user.avatarUrl ?? null }
    : null;
  return (
    <LiveConfigProvider enabled={me !== null} me={me}>
      <MotionPreferenceConfig>
        <Outlet />
      </MotionPreferenceConfig>
      <ServiceWorkerManager signedIn={me !== null} />
      {me && <InstallHint />}
    </LiveConfigProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundView />;
  }
  // Çevrimdışıyken önbellekte olmayan sayfaya gidildi (veri isteği ağa çıkamadı).
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return <ErrorView offline />;
  }

  let details: string | undefined;
  let stack: string | undefined;
  if (isRouteErrorResponse(error)) {
    details = error.statusText || undefined;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }
  return <ErrorView details={details} stack={stack} />;
}

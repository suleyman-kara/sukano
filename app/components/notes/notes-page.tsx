import { GridLiveStatus } from "~/components/realtime/live-status";
import type { LiveChannelState } from "~/components/realtime/use-live-channel";
import { AppShell } from "~/components/shell/app-shell";
import { ViewSwitch } from "~/components/shell/view-switch";
import { useShellData } from "~/lib/shell";

/**
 * Alan sayfası iskeleti (Notlarım, Arşiv, Çöp): kabuk + başlık + görünüm kapsülü.
 * `live` (kanal durumu) koptuysa üstte çevrimdışı bandı, başlık altında son eşitleme.
 */
export function NotesPage({
  title = "Notlarım",
  subtitle,
  live,
  children,
}: {
  title?: string;
  subtitle?: string;
  live?: LiveChannelState | null;
  children: React.ReactNode;
}) {
  const shell = useShellData();
  return (
    <AppShell {...shell} showViewSwitch>
      <section className="flex flex-col gap-[18px] px-4 pt-2 pb-32 md:gap-6 md:px-7 md:pt-3 md:pb-10 lg:px-8">
        <GridLiveStatus live={live} part="banner" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="m-0 text-[22px] font-bold tracking-[-0.01em] md:text-2xl">{title}</h1>
            {subtitle && <p className="m-0 text-[13px] text-muted-foreground">{subtitle}</p>}
            <GridLiveStatus live={live} part="sync" />
          </div>
          <ViewSwitch className="md:hidden" />
        </div>
        {children}
      </section>
    </AppShell>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="m-0 mb-2 text-[11px] font-semibold tracking-[.08em] text-muted-foreground uppercase md:mb-3">
      {children}
    </h2>
  );
}

/** Boş durum (States): simge, başlık, açıklama, isteğe bağlı eylemler. */
export function EmptyState({
  icon,
  title,
  children,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center md:py-24">
      <span className="empty-in inline-flex size-16 items-center justify-center rounded-[18px] bg-primary-soft text-primary [&_svg]:size-[30px]">
        {icon}
      </span>
      <h2 className="empty-in-late m-0 text-lg font-semibold">{title}</h2>
      {children && (
        <p className="empty-in-late m-0 max-w-[320px] text-muted-foreground">{children}</p>
      )}
      {actions && <div className="mt-2 flex gap-2">{actions}</div>}
    </div>
  );
}

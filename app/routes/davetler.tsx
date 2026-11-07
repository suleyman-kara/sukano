import { Inbox } from "lucide-react";
import { InviteCard } from "~/components/invites/invite-card";
import { EmptyState, SectionHeading } from "~/components/notes/notes-page";
import { AppShell } from "~/components/shell/app-shell";
import { getCloudflare } from "~/lib/context";
import { invitationsService } from "~/lib/invitations.server";
import { requireUser } from "~/lib/session.server";
import { useShellData } from "~/lib/shell";
import type { Route } from "./+types/davetler";

export const meta: Route.MetaFunction = () => [{ title: "Davetler · Sukano" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  const invites = await invitationsService(getCloudflare(context).env, user.id).list();
  return { ...invites, now: new Date().toISOString() };
}

/** Davetler: bekleyen davetler (kabul / ret) ve geçmiş (PLAN §4; Invites). */
export default function InvitesRoute({ loaderData }: Route.ComponentProps) {
  const shell = useShellData();
  const { pending, history } = loaderData;
  const now = new Date(loaderData.now);

  return (
    <AppShell {...shell}>
      <section className="flex w-full max-w-[820px] flex-col gap-6 px-4 pt-2 pb-12 md:px-7 md:pt-3 lg:px-8">
        <h1 className="m-0 text-[22px] font-bold tracking-[-0.01em] md:text-2xl">Davetler</h1>
        {pending.length === 0 && history.length === 0 ? (
          <EmptyState icon={<Inbox strokeWidth={1.75} aria-hidden="true" />} title="Davet yok">
            Bir proje yöneticisi seni davet ettiğinde burada görünür; e-postayla da haber verilir.
          </EmptyState>
        ) : (
          <>
            <section aria-labelledby="davet-bekleyen">
              <SectionHeading>
                <span id="davet-bekleyen">Bekleyen</span>
              </SectionHeading>
              {pending.length === 0 ? (
                <p className="m-0 text-muted-foreground">Bekleyen davetin yok.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {pending.map((inv) => (
                    <InviteCard key={inv.id} invite={inv} now={now} />
                  ))}
                </ul>
              )}
            </section>
            {history.length > 0 && (
              <section aria-labelledby="davet-gecmis">
                <SectionHeading>
                  <span id="davet-gecmis">Geçmiş</span>
                </SectionHeading>
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {history.map((inv) => (
                    <InviteCard key={inv.id} invite={inv} now={now} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        <p className="m-0 text-[13px] text-muted-foreground">
          Davetleri proje yöneticileri gönderir; e-postayla da haber verilir. Yalnızca hesabı olan
          kişiler davet edilebilir. Bir daveti kabul edince proje sol menüde görünür.
        </p>
      </section>
    </AppShell>
  );
}

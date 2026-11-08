import { Trash2 } from "lucide-react";
import { DeletedProjectRow } from "~/components/projects/deleted-project-row";
import { EmptyState } from "~/components/notes/notes-page";
import { AppShell } from "~/components/shell/app-shell";
import { getCloudflare } from "~/lib/context";
import { projectsService } from "~/lib/projects.server";
import { requireUser } from "~/lib/session.server";
import { useShellData } from "~/lib/shell";
import type { Route } from "./+types/silinmis-projeler";

export const meta: Route.MetaFunction = () => [{ title: "Silinmiş projeler · Sukano" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  return { deleted: await projectsService(getCloudflare(context).env, user.id).deleted() };
}

/** Silinmiş projeler (yalnızca yönetici olunanlar): 7 gün içinde geri getirilebilir. */
export default function DeletedProjectsRoute({ loaderData }: Route.ComponentProps) {
  const shell = useShellData();
  const { deleted } = loaderData;
  return (
    <AppShell {...shell}>
      <section className="flex w-full max-w-[820px] flex-col gap-5 px-4 pt-2 pb-12 md:px-7 md:pt-3 lg:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[22px] font-bold tracking-[-0.01em] md:text-2xl">
            Silinmiş projeler
          </h1>
          <p className="m-0 text-muted-foreground">
            7 gün içinde projeyi geri getirebilirsin; sonra notlar, dosyalar ve sürümler kalıcı
            olarak silinir.
          </p>
        </div>
        {deleted.length === 0 ? (
          <EmptyState
            icon={<Trash2 strokeWidth={1.75} aria-hidden="true" />}
            title="Silinmiş proje yok"
          >
            Yönetici olduğun bir proje silinirse 7 gün boyunca burada bekler.
          </EmptyState>
        ) : (
          <ul className="m-0 flex list-none flex-col rounded-[14px] border border-line bg-surface p-0">
            {deleted.map((p) => (
              <DeletedProjectRow key={p.id} project={p} />
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

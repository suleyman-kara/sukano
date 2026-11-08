import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { data, Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "cn";
import { FieldError } from "~/components/auth/fields";
import { ProjectColorPicker } from "~/components/projects/color-picker";
import { FIELD_INPUT, FIELD_LABEL } from "~/components/projects/dialog-styles";
import { InviteForm } from "~/components/projects/invite-form";
import { MembersList } from "~/components/projects/members-list";
import { PendingInvites } from "~/components/projects/pending-invites";
import { DeleteProjectDialog, LeaveProjectDialog } from "~/components/projects/project-dialogs";
import { ProjectMark } from "~/components/projects/project-meta";
import { projectAction, useProjectAction } from "~/components/projects/use-project-action";
import { AppShell } from "~/components/shell/app-shell";
import { Button } from "~/components/ui/button";
import type { ProjectColor } from "~/db/schema";
import { ROLE_DESCRIPTIONS } from "~/domain/projects/permissions";
import {
  MAX_EMOJI_LENGTH,
  MAX_PROJECT_DESCRIPTION_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  isProjectId,
} from "~/domain/projects/validation";
import { loaderError } from "~/lib/api-errors.server";
import { getCloudflare } from "~/lib/context";
import { projectsService } from "~/lib/projects.server";
import { requireUser } from "~/lib/session.server";
import { useShellData } from "~/lib/shell";
import type { Route } from "./+types/proje.ayarlar";

export const meta: Route.MetaFunction = ({ data: d }) => [
  { title: `Ayarlar · ${d?.settings.project.name ?? "Proje"} · Sukano` },
];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  if (!isProjectId(params.projeId)) throw data(null, { status: 404 });
  try {
    const settings = await projectsService(getCloudflare(context).env, user.id).settings(
      params.projeId,
    );
    return { settings, now: new Date().toISOString() };
  } catch (error) {
    loaderError(error);
  }
}

const PANEL =
  "flex scroll-mt-24 flex-col gap-4 rounded-[14px] border border-line bg-surface px-4 py-5 md:px-6";
const GENERAL_FORM = "proje-genel";

/**
 * Proje ayarları (ProjectSettings, TProjectSettings, MProjectSettings): genel bilgiler,
 * üyeler ve roller, davet gönderme ve bekleyen davetler (yönetici), projeden ayrılma ve
 * proje silme. Yönetici olmayan üye listeyi görür ve projeden ayrılabilir.
 */
export default function ProjectSettingsRoute({ loaderData }: Route.ComponentProps) {
  const shell = useShellData();
  const navigate = useNavigate();
  const { settings } = loaderData;
  const { project, members, permissions, myRole, isLastManager } = settings;
  const now = new Date(loaderData.now);
  const base = `/proje/${project.id}`;
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canManage = permissions.canManage;

  return (
    <AppShell {...shell} hideMobileTopbar>
      <section className="flex w-full max-w-[860px] flex-col gap-5 px-4 pt-3 pb-12 md:px-7 md:pt-3 lg:px-8">
        {/* Mobil başlık (MProjectSettings): geri, proje adı, "Ayarlar", Kaydet. */}
        <div className="flex items-center gap-2 pt-[env(safe-area-inset-top)] md:hidden">
          <Link
            to={base}
            aria-label="Projeye dön"
            className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronLeft className="size-6" aria-hidden="true" />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <ProjectMark color={project.color} emoji={project.emoji} size="sm" />
              <span className="truncate">{project.name}</span>
            </span>
            <h1 className="m-0 text-xl leading-tight font-bold">Ayarlar</h1>
          </div>
          {canManage && (
            <Button type="submit" form={GENERAL_FORM} className="h-11 px-4">
              Kaydet
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-2 max-md:hidden">
          <Link
            to={base}
            className="-ml-1 inline-flex w-fit items-center gap-1 rounded-lg px-1 py-1 font-medium text-fg no-underline outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronLeft className="size-[18px]" aria-hidden="true" />
            Projeye dön
          </Link>
          <h1 className="m-0 flex min-w-0 items-center gap-3 text-2xl font-bold tracking-[-0.01em]">
            <ProjectMark color={project.color} emoji={project.emoji} size="lg" />
            <span className="min-w-0 break-words">{project.name} · Ayarlar</span>
          </h1>
        </div>

        {canManage && <GeneralPanel key={project.id} project={project} />}

        <section id="uyeler" className={PANEL} aria-labelledby="uyeler-baslik">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="uyeler-baslik" className="m-0 text-base font-semibold">
              Üyeler
            </h2>
            <span className="text-[13px] text-muted-foreground">
              {members.length} üye · {settings.managerCount} yönetici
            </span>
          </div>
          <p className="m-0 text-[13px] text-muted-foreground">
            Yönetici: {ROLE_DESCRIPTIONS.yonetici.toLocaleLowerCase("tr-TR")} Düzenleyici:{" "}
            {ROLE_DESCRIPTIONS.duzenleyici.toLocaleLowerCase("tr-TR")} Görüntüleyici:{" "}
            {ROLE_DESCRIPTIONS.goruntuleyici.toLocaleLowerCase("tr-TR")}
          </p>
          <MembersList
            projectId={project.id}
            members={members}
            canManage={canManage}
            onLeave={() => setLeaving(true)}
          />
        </section>

        {canManage && (
          <section id="davet" className={PANEL} aria-labelledby="davet-baslik">
            <h2 id="davet-baslik" className="m-0 text-base font-semibold">
              Davet gönder
            </h2>
            <p className="m-0 text-muted-foreground">
              Yalnızca Sukano hesabı olan kişiler davet edilebilir. E-posta adresini tam yaz.
            </p>
            <InviteForm projectId={project.id} />
            <PendingInvites projectId={project.id} invites={settings.pendingInvites} now={now} />
          </section>
        )}

        <section
          id="tehlike"
          className={cn(PANEL, "border-danger-soft")}
          aria-labelledby="tehlike-baslik"
        >
          <h2 id="tehlike-baslik" className="m-0 text-base font-semibold">
            Tehlikeli bölge
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex min-w-[220px] flex-1 flex-col">
              <b className="font-medium">Projeden ayrıl</b>
              <small className="text-[13px] text-muted-foreground">
                Notlar projede kalır. Ayrıldıktan sonra yalnızca davetle geri dönebilirsin.
              </small>
            </span>
            <Button variant="outline" onClick={() => setLeaving(true)}>
              Ayrıl
            </Button>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
              <span className="flex min-w-[220px] flex-1 flex-col">
                <b className="font-medium">Projeyi sil</b>
                <small className="text-[13px] text-muted-foreground">
                  Proje 7 gün boyunca yöneticiler tarafından geri getirilebilir; sonra notlar,
                  dosyalar ve sürümler kalıcı olarak silinir. Üyelere bildirim gider.
                </small>
              </span>
              <Button
                variant="outline"
                className="border-danger text-danger hover:bg-danger-soft hover:text-danger"
                onClick={() => setDeleting(true)}
              >
                Projeyi sil
              </Button>
            </div>
          )}
        </section>
      </section>

      <LeaveProjectDialog
        open={leaving}
        onOpenChange={setLeaving}
        project={project}
        memberRole={myRole}
        isLastManager={isLastManager}
        onGoToSettings={() => {
          setLeaving(false);
          navigate("#uyeler", { preventScrollReset: false });
          document.getElementById("uyeler")?.scrollIntoView({ block: "start" });
        }}
      />
      {canManage && (
        <DeleteProjectDialog
          open={deleting}
          onOpenChange={setDeleting}
          project={project}
          noteCount={settings.noteCount}
          memberCount={members.length}
        />
      )}
    </AppShell>
  );
}

function GeneralPanel({
  project,
}: {
  project: {
    id: string;
    name: string;
    color: ProjectColor;
    emoji: string | null;
    description: string | null;
  };
}) {
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState(project.color);
  const [emoji, setEmoji] = useState(project.emoji ?? "");
  const [description, setDescription] = useState(project.description ?? "");
  const [nameError, setNameError] = useState<string>();
  const save = useProjectAction(projectAction(project.id), {
    onSuccess: () => toast.success("Proje kaydedildi"),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Proje adı gerekli");
      return;
    }
    void save.submit({ intent: "update", name: name.trim(), color, emoji, description });
  };

  return (
    <section id="genel" className={PANEL} aria-labelledby="genel-baslik">
      <h2 id="genel-baslik" className="m-0 text-base font-semibold">
        Genel
      </h2>
      <form id={GENERAL_FORM} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-4 md:flex-nowrap">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="proje-ad" className={FIELD_LABEL}>
              Proje adı
            </label>
            <input
              id="proje-ad"
              value={name}
              maxLength={MAX_PROJECT_NAME_LENGTH}
              autoComplete="off"
              onChange={(e) => {
                setName(e.target.value);
                setNameError(undefined);
              }}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "proje-ad-hata" : undefined}
              className={FIELD_INPUT}
            />
            <FieldError id="proje-ad-hata">{nameError}</FieldError>
          </div>
          <div className="flex w-[80px] flex-col gap-1.5 md:w-[96px]">
            <label htmlFor="proje-simge" className={FIELD_LABEL}>
              Simge
            </label>
            <input
              id="proje-simge"
              value={emoji}
              maxLength={MAX_EMOJI_LENGTH}
              autoComplete="off"
              placeholder="🙂"
              aria-describedby="proje-simge-ipucu"
              onChange={(e) => setEmoji(e.target.value)}
              className={FIELD_INPUT}
            />
            <span id="proje-simge-ipucu" className="sr-only">
              İsteğe bağlı emoji; boşsa renkli nokta görünür.
            </span>
          </div>
          <div className="max-md:w-full md:min-w-[290px]">
            <ProjectColorPicker value={color} onChange={setColor} name="proje-renk" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="proje-aciklama" className={FIELD_LABEL}>
            Açıklama <span className="font-normal text-muted-foreground">(isteğe bağlı)</span>
          </label>
          <textarea
            id="proje-aciklama"
            value={description}
            rows={2}
            maxLength={MAX_PROJECT_DESCRIPTION_LENGTH}
            placeholder="Projenin amacı bir cümleyle"
            onChange={(e) => setDescription(e.target.value)}
            className={cn(FIELD_INPUT, "h-auto min-h-11 resize-y py-2.5 md:h-auto md:min-h-10")}
          />
        </div>
        <div className="max-md:hidden">
          <Button type="submit" disabled={save.busy}>
            Kaydet
          </Button>
        </div>
      </form>
    </section>
  );
}

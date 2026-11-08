import { Lock, Settings, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { ViewSwitch, type View } from "~/components/shell/view-switch";
import { Button } from "~/components/ui/button";
import type { ProjectColor, ProjectRole } from "~/db/schema";
import { ROLE_DESCRIPTIONS } from "~/domain/projects/permissions";
import { MemberAvatars } from "./member-avatars";
import { InviteDialog } from "./project-dialogs";
import { ProjectMark, RoleChip } from "./project-meta";

type HeaderProject = {
  id: string;
  name: string;
  color: ProjectColor;
  emoji: string | null;
  description: string | null;
};

type HeaderMember = { userId: string; name: string; avatarColor: string; avatarUrl: string | null };

/**
 * Proje sayfası başlığı (Project, TProject, MProject): ad, renk/simge, rol çipi,
 * açıklama, üye avatarları, "Davet gönder" (yönetici) ve ayarlar düğmesi. Mobilde
 * görünüm kapsülü başlığın sağında.
 */
export function ProjectHeader({
  project,
  role,
  members,
  canManage,
  base,
  views,
  subtitle,
}: {
  project: HeaderProject;
  role: ProjectRole;
  members: HeaderMember[];
  canManage: boolean;
  base: string;
  views: readonly View[];
  /** Arşiv / çöp görünümünde başlığın altındaki satır. */
  subtitle?: string;
}) {
  const [inviting, setInviting] = useState(false);
  const viewer = role === "goruntuleyici";
  const chip = (
    <RoleChip role={role}>{viewer && <Lock className="size-3" aria-hidden="true" />}</RoleChip>
  );
  const actions = (
    <>
      {canManage && (
        <Button
          variant="outline"
          onClick={() => setInviting(true)}
          className="h-11 border-line bg-surface md:h-10"
        >
          <UserPlus className="size-[18px] max-md:hidden" aria-hidden="true" />
          Davet gönder
        </Button>
      )}
      <Link
        to={`${base}/ayarlar`}
        aria-label="Proje ayarları"
        title="Proje ayarları"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 md:size-10"
      >
        <Settings className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </Link>
    </>
  );
  const count = <span className="text-[13px] text-muted-foreground">{members.length} üye</span>;

  return (
    <header className="flex flex-col gap-3 md:gap-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
            <ProjectMark
              color={project.color}
              emoji={project.emoji}
              size="lg"
              className="self-start max-md:mt-[7px] md:self-center"
            />
            <h1 className="m-0 min-w-0 text-[22px] leading-tight font-bold tracking-[-0.01em] break-words md:text-2xl">
              {project.name}
            </h1>
            <span className="max-md:hidden">{chip}</span>
          </div>
          {project.description && (
            <p className="m-0 text-[13px] text-muted-foreground md:pl-[26px] md:text-sm">
              {project.description}
            </p>
          )}
          {viewer && (
            <p className="m-0 text-[13px] text-muted-foreground md:pl-[26px] md:text-sm">
              {ROLE_DESCRIPTIONS.goruntuleyici}
            </p>
          )}
          {subtitle && (
            <p className="m-0 text-[13px] text-muted-foreground md:pl-[26px]">{subtitle}</p>
          )}
        </div>
        <ViewSwitch className="md:hidden" base={base} views={views} />
        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          <MemberAvatars members={members} />
          {count}
          {actions}
        </div>
      </div>
      <div className="flex items-center gap-2.5 md:gap-3 md:pl-[26px] lg:hidden">
        <MemberAvatars members={members} size={26} />
        <span className="md:hidden">{chip}</span>
        <span className="max-md:hidden">{count}</span>
        <span className="flex-1" />
        {actions}
      </div>
      {canManage && <InviteDialog open={inviting} onOpenChange={setInviting} project={project} />}
    </header>
  );
}

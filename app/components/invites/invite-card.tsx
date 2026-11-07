import { useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "cn";
import { Avatar } from "~/components/avatar";
import { ProjectMark, RoleChip } from "~/components/projects/project-meta";
import { useProjectRequest } from "~/components/projects/use-project-action";
import { Button } from "~/components/ui/button";
import type { InvitationStatus, ProjectColor, ProjectRole } from "~/db/schema";
import { relativeAgo } from "~/domain/auth/format";
import { roleLabel } from "~/domain/projects/permissions";

export type InviteCardData = {
  id: string;
  project: { id: string; name: string; color: ProjectColor; emoji: string | null };
  role: ProjectRole;
  invitedBy: { name: string; avatarColor: string } | null;
  createdAt: string;
  expiryLabel: string;
  status: InvitationStatus;
  respondedAt: string | null;
  canOpenProject: boolean;
};

const STATUS_LABELS: Record<InvitationStatus, string> = {
  beklemede: "bekliyor",
  kabul_edildi: "kabul edildi",
  reddedildi: "reddedildi",
  geri_cekildi: "geri çekildi",
  suresi_doldu: "süresi doldu",
};

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" })
    .format(new Date(iso))
    .replace(".", "");

/**
 * Davet kartı (Invites, TInvites, MInvites). Bekleyende Reddet / Kabul et (kabulde
 * proje açılır); geçmişte durum satırı ve gerekirse "Projeye git".
 */
export function InviteCard({ invite, now }: { invite: InviteCardData; now: Date }) {
  const navigate = useNavigate();
  const pending = invite.status === "beklemede";
  const request = useProjectRequest();
  const respond = async (intent: "accept" | "decline") => {
    const res = await request.send("/api/davetler", { intent, id: invite.id });
    if (!res.ok) return;
    if (intent === "accept" && res.projectId) {
      toast.success("Davet kabul edildi");
      await navigate(`/proje/${res.projectId}`, {
        state: {
          joined: { role: roleLabel(invite.role), invitedBy: invite.invitedBy?.name ?? null },
        },
      });
    } else toast("Davet reddedildi");
    await request.refresh();
  };
  const by = invite.invitedBy?.name ?? "Silinmiş kullanıcı";
  const when = pending
    ? relativeAgo(new Date(invite.createdAt), now)
    : shortDate(invite.respondedAt ?? invite.createdAt);
  const tail = pending ? invite.expiryLabel : STATUS_LABELS[invite.status];

  return (
    <li
      className={cn(
        "flex gap-3 rounded-[14px] border border-line px-4 py-4 max-md:flex-col md:items-center md:px-5",
        pending ? "bg-surface" : "bg-surface/60",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 md:items-center">
        <ProjectMark
          color={invite.project.color}
          emoji={invite.project.emoji}
          size="lg"
          className={cn("max-md:mt-1.5", !pending && "opacity-70")}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h3
              className={cn(
                "m-0 text-[15px] font-semibold md:text-base",
                !pending && "text-muted-foreground",
              )}
            >
              {invite.project.name}
            </h3>
            <RoleChip role={invite.role} className="py-px text-[11px]" />
          </div>
          <p className="m-0 flex items-start gap-1.5 text-[13px] text-muted-foreground md:items-center">
            {pending && invite.invitedBy && (
              <Avatar
                name={invite.invitedBy.name}
                color={invite.invitedBy.avatarColor}
                size={18}
                className="shrink-0 max-md:mt-px"
              />
            )}
            <span>
              {by} davet etti · {when} · {tail}
            </span>
          </p>
        </div>
      </div>
      {pending ? (
        <div className="flex gap-2 max-md:[&>*]:h-11 max-md:[&>*]:flex-1">
          <Button
            variant="outline"
            disabled={request.busy}
            aria-label={`Reddet: ${invite.project.name}`}
            onClick={() => void respond("decline")}
          >
            Reddet
          </Button>
          <Button
            disabled={request.busy}
            aria-label={`Kabul et: ${invite.project.name}`}
            onClick={() => void respond("accept")}
          >
            Kabul et
          </Button>
        </div>
      ) : (
        invite.canOpenProject && (
          <Button
            variant="outline"
            className="self-start md:self-center"
            onClick={() => navigate(`/proje/${invite.project.id}`)}
            aria-label={`Projeye git: ${invite.project.name}`}
          >
            Projeye git
          </Button>
        )
      )}
    </li>
  );
}

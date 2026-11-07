import { toast } from "sonner";
import { Avatar } from "~/components/avatar";
import { Button } from "~/components/ui/button";
import type { ProjectRole } from "~/db/schema";
import { relativeAgo } from "~/domain/auth/format";
import { inviteExpiryLabel } from "~/domain/projects/lifecycle";
import { roleLabel } from "~/domain/projects/permissions";
import { projectAction, useProjectAction } from "./use-project-action";

export type PendingInviteRow = {
  id: string;
  email: string;
  role: ProjectRole;
  inviteeName: string | null;
  createdAt: string;
  expiresAt: string;
};

/** Bekleyen davetler (yöneticiye): rol, gönderim zamanı, geçerlilik; "Geri çek". */
export function PendingInvites({
  projectId,
  invites,
  now,
}: {
  projectId: string;
  invites: PendingInviteRow[];
  now: Date;
}) {
  if (invites.length === 0) return null;
  return (
    <div className="flex flex-col">
      <h3 className="m-0 border-b border-line pb-2 text-[13px] font-medium text-muted-foreground">
        Bekleyen davetler
      </h3>
      <ul className="m-0 flex list-none flex-col p-0">
        {invites.map((inv) => (
          <InviteRow key={inv.id} projectId={projectId} invite={inv} now={now} />
        ))}
      </ul>
    </div>
  );
}

function InviteRow({
  projectId,
  invite,
  now,
}: {
  projectId: string;
  invite: PendingInviteRow;
  now: Date;
}) {
  const revoke = useProjectAction(projectAction(projectId), {
    onSuccess: () => toast("Davet geri çekildi"),
  });
  if (revoke.busy) return null;
  return (
    <li className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
      <Avatar
        name={invite.inviteeName ?? invite.email}
        color="var(--hover)"
        size={36}
        className="text-muted-foreground"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{invite.email}</span>
        <span className="text-[13px] text-muted-foreground">
          {roleLabel(invite.role)} · {relativeAgo(new Date(invite.createdAt), now)} gönderildi ·{" "}
          {inviteExpiryLabel(new Date(invite.expiresAt), now)}
        </span>
      </span>
      <Button
        variant="outline"
        onClick={() => void revoke.submit({ intent: "revoke-invite", invitationId: invite.id })}
        aria-label={`Geri çek: ${invite.email}`}
      >
        Geri çek
      </Button>
    </li>
  );
}

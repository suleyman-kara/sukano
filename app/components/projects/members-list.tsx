import { UserMinus, X } from "lucide-react";
import { useState } from "react";
import { Avatar } from "~/components/avatar";
import { ConfirmDialog } from "~/components/notes/confirm-dialog";
import { Button } from "~/components/ui/button";
import type { ProjectRole } from "~/db/schema";
import { roleLabel } from "~/domain/projects/permissions";
import { RoleSelect } from "./role-select";
import { projectAction, useProjectAction } from "./use-project-action";

export type MemberRow = {
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  avatarUrl: string | null;
  role: ProjectRole;
  isMe: boolean;
};

/**
 * Üye listesi (ProjectSettings → Üyeler): yöneticide rol seçici ve çıkarma (onaylı);
 * kendi satırında "Ayrıl". Rol değişikliği hemen gönderilir; kural ihlali (son
 * yönetici) sunucudan gelen metinle toast olur ve seçici eski değere döner.
 */
export function MembersList({
  projectId,
  members,
  canManage,
  onLeave,
}: {
  projectId: string;
  members: MemberRow[];
  canManage: boolean;
  onLeave: () => void;
}) {
  const [removing, setRemoving] = useState<MemberRow | null>(null);
  const remove = useProjectAction(projectAction(projectId), {
    onSuccess: () => removing && setRemoving(null),
  });

  return (
    <>
      <ul className="m-0 flex list-none flex-col p-0">
        {members.map((m) => (
          <MemberItem
            key={m.userId}
            projectId={projectId}
            member={m}
            canManage={canManage}
            onRemove={() => setRemoving(m)}
            onLeave={onLeave}
          />
        ))}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        icon={<UserMinus className="size-5" />}
        title="Üye projeden çıkarılsın mı?"
        chip={
          removing && (
            <>
              <Avatar
                name={removing.name}
                color={removing.avatarColor}
                src={removing.avatarUrl}
                size={30}
              />
              <span className="flex min-w-0 flex-col">
                <b className="truncate font-semibold">{removing.name}</b>
                <small className="truncate text-xs text-muted-foreground">
                  {removing.email} · {roleLabel(removing.role)}
                </small>
              </span>
            </>
          )
        }
        description={
          <>
            Notlar projede kalır; {removing?.name ?? "üyenin"} adlı üyenin görev atamaları
            kaldırılır. Oluşturduğu ve düzenlediği notlarda adı görünmeye devam eder. Kendisine
            bildirim gider.
          </>
        }
        confirmLabel="Projeden çıkar"
        onConfirm={() => {
          if (removing) void remove.submit({ intent: "remove-member", userId: removing.userId });
        }}
      />
    </>
  );
}

function MemberItem({
  projectId,
  member: m,
  canManage,
  onRemove,
  onLeave,
}: {
  projectId: string;
  member: MemberRow;
  canManage: boolean;
  onRemove: () => void;
  onLeave: () => void;
}) {
  const roleAction = useProjectAction(projectAction(projectId), {
    key: `rol-${projectId}-${m.userId}`,
    onSuccess: () => {},
  });
  const pending = roleAction.fetcher.formData?.get("role") as ProjectRole | undefined;
  const role = pending ?? m.role;

  return (
    <li className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
      <Avatar name={m.name} color={m.avatarColor} src={m.avatarUrl} size={36} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">
          {m.name}
          {m.isMe && <span className="font-normal text-muted-foreground"> (sen)</span>}
        </span>
        <span className="truncate text-[13px] text-muted-foreground">{m.email}</span>
      </span>
      {canManage ? (
        <RoleSelect
          value={role}
          label={`${m.name} rolü`}
          variant="plain"
          className="md:w-[150px]"
          onChange={(next) =>
            void roleAction.submit({ intent: "set-role", userId: m.userId, role: next })
          }
        />
      ) : (
        <span className="text-[13px] text-muted-foreground">{roleLabel(m.role)}</span>
      )}
      <span className="flex shrink-0 justify-end md:w-[64px]">
        {m.isMe ? (
          <Button variant="outline" onClick={onLeave} className="max-md:hidden">
            Ayrıl
          </Button>
        ) : canManage ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${m.name}: projeden çıkar`}
            title="Projeden çıkar"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 md:size-9"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        ) : null}
      </span>
    </li>
  );
}

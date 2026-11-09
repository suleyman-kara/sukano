import { LogOut, Trash2, TriangleAlert } from "lucide-react";
import { AlertDialog } from "radix-ui";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { TOAST_MS } from "~/lib/motion";
import { ConfirmDialog } from "~/components/notes/confirm-dialog";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import type { ProjectColor, ProjectRole } from "~/db/schema";
import { MESSAGES, roleLabel } from "~/domain/projects/permissions";
import { SHEET_DIALOG } from "./dialog-styles";
import { InviteForm } from "./invite-form";
import { ProjectMark } from "./project-meta";
import { projectAction, useProjectRequest } from "./use-project-action";

type ProjectRef = { id: string; name: string; color: ProjectColor; emoji: string | null };

function ProjectChip({ project, detail }: { project: ProjectRef; detail: string }) {
  return (
    <>
      <ProjectMark color={project.color} emoji={project.emoji} />
      <b className="min-w-0 flex-1 truncate font-semibold">{project.name}</b>
      <small className="shrink-0 text-xs text-muted-foreground">{detail}</small>
    </>
  );
}

/**
 * "Projeden ayrılıyor musun?" (Dialogs2). Son yönetici ayrılamaz: uyarı kutusu,
 * "Proje ayarlarına git" ve devre dışı onay.
 */
export function LeaveProjectDialog({
  open,
  onOpenChange,
  project,
  memberRole: role,
  isLastManager,
  onGoToSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectRef;
  memberRole: ProjectRole;
  isLastManager: boolean;
  onGoToSettings: () => void;
}) {
  const navigate = useNavigate();
  const request = useProjectRequest();
  const leave = async () => {
    const res = await request.send(projectAction(project.id), { intent: "leave" });
    if (!res.ok) return;
    toast(`${project.name} projesinden ayrıldın`);
    await navigate("/");
    await request.refresh();
  };
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<LogOut className="size-5" />}
      title="Projeden ayrılıyor musun?"
      chip={
        <ProjectChip
          project={project}
          detail={isLastManager ? `${roleLabel(role)} · tek yönetici` : roleLabel(role)}
        />
      }
      description={
        isLastManager ? (
          <span className="sr-only">{MESSAGES.sonYoneticiAyrilma}</span>
        ) : (
          "Notlar projede kalır ve sana atanan görevlerden çıkarılırsın. Geri dönmek için bir yöneticinin seni yeniden davet etmesi gerekir."
        )
      }
      confirmLabel="Projeden ayrıl"
      confirmDisabled={isLastManager}
      cancel={
        isLastManager ? (
          <AlertDialog.Cancel asChild>
            <Button variant="outline" onClick={onGoToSettings}>
              Proje ayarlarına git
            </Button>
          </AlertDialog.Cancel>
        ) : undefined
      }
      onConfirm={() => void leave()}
    >
      {isLastManager && (
        <p
          aria-hidden="true"
          className="m-0 -mt-3 flex items-start gap-2.5 rounded-[10px] bg-warn-soft px-3 py-2.5 text-[13px] text-warn"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{MESSAGES.sonYoneticiAyrilma}</span>
        </p>
      )}
    </ConfirmDialog>
  );
}

/** "Proje silinsin mi?" (Dialogs2): 7 gün bekleme açıklamasıyla. */
export function DeleteProjectDialog({
  open,
  onOpenChange,
  project,
  noteCount,
  memberCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectRef;
  noteCount: number;
  memberCount: number;
}) {
  const navigate = useNavigate();
  const request = useProjectRequest();
  const del = async () => {
    const res = await request.send(projectAction(project.id), { intent: "delete" });
    if (!res.ok) return;
    toast(`${project.name} silindi · 7 gün içinde Silinmiş projeler'den geri getirebilirsin`, {
      duration: TOAST_MS,
    });
    await navigate("/");
    await request.refresh();
  };
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Trash2 className="size-5" />}
      title="Proje silinsin mi?"
      chip={<ProjectChip project={project} detail={`${noteCount} not · ${memberCount} üye`} />}
      description="Proje 7 gün boyunca silinmiş olarak bekler; bu sürede yöneticiler projeyi geri getirebilir. Sonra notlar, dosyalar ve sürümler kalıcı olarak silinir. Üyelere bildirim gider."
      confirmLabel="Projeyi sil"
      onConfirm={() => void del()}
    />
  );
}

/** Proje sayfasındaki "Davet gönder": davet formu diyalogda. */
export function InviteDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectRef;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${SHEET_DIALOG} sm:max-w-[520px]`}>
        <DialogTitle className="m-0 text-lg font-semibold">Davet gönder</DialogTitle>
        <DialogDescription className="m-0 text-muted-foreground">
          {project.name} · Yalnızca Sukano hesabı olan kişiler davet edilebilir. E-posta adresini
          tam yaz.
        </DialogDescription>
        {open && (
          <InviteForm
            projectId={project.id}
            idPrefix="davet-diyalog"
            onSent={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

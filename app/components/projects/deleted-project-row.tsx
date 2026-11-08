import { useNavigate } from "react-router";
import { toast } from "sonner";
import { cn } from "cn";
import { DEFAULT_TIME_ZONE } from "~/domain/notes/dates";
import { Button } from "~/components/ui/button";
import type { ProjectColor } from "~/db/schema";
import { ProjectMark } from "./project-meta";
import { projectAction, useProjectRequest } from "./use-project-action";

export type DeletedProjectRowData = {
  id: string;
  name: string;
  color: ProjectColor;
  emoji: string | null;
  deletedAt: string;
  deletedBy: { name: string } | null;
  deletedByMe: boolean;
  daysLeft: number;
  purgeLabel: string;
};

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: DEFAULT_TIME_ZONE })
    .format(new Date(iso))
    .replace(".", "");

/** Silinmiş proje satırı (States2): kim, ne zaman sildi, kalan gün; "Projeyi geri getir". */
export function DeletedProjectRow({ project }: { project: DeletedProjectRowData }) {
  const navigate = useNavigate();
  const request = useProjectRequest();
  const restore = async () => {
    const res = await request.send(projectAction(project.id), { intent: "restore" });
    if (!res.ok) return;
    toast.success(`${project.name} geri getirildi`);
    await navigate(`/proje/${project.id}`);
    await request.refresh();
  };
  const who = project.deletedByMe
    ? "Sen sildin"
    : `${project.deletedBy?.name ?? "Silinmiş kullanıcı"} sildi`;
  const urgent = project.daysLeft <= 1;
  return (
    <li className="flex items-center gap-3 border-t border-line px-4 py-3.5 first:border-t-0 max-sm:flex-wrap md:px-5">
      <ProjectMark color={project.color} emoji={project.emoji} size="lg" />
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="truncate font-semibold">{project.name}</b>
        <small className={cn("text-[13px]", urgent ? "text-danger" : "text-muted-foreground")}>
          {who} · {shortDate(project.deletedAt)} · {project.purgeLabel}
        </small>
      </span>
      <Button
        variant="outline"
        disabled={request.busy}
        onClick={() => void restore()}
        aria-label={`Projeyi geri getir: ${project.name}`}
        className="max-sm:ml-[26px]"
      >
        Projeyi geri getir
      </Button>
    </li>
  );
}

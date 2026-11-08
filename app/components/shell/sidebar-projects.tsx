import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, useFetcher } from "react-router";
import { cn } from "cn";
import { reorderIds } from "~/domain/projects/members";
import { roleLabel } from "~/domain/projects/permissions";
import type { ShellProject } from "./types";

type Props = {
  projects: ShellProject[];
  itemClass: (state: { isActive: boolean }) => string;
  rc: (classes: string) => string;
  labelClass: string;
  onNavigate?: () => void;
};

export const projectHref = (id: string) => `/proje/${id}`;

/**
 * Sol menüdeki projeler: kişiye özel sıra (PLAN §4). Fareyle sürükleyerek (6 px),
 * dokunmatikte basılı tutup (350 ms) ya da odaklı bağlantıda Alt+↑/↓ ile taşınır;
 * sıra `POST /api/projeler intent=reorder` ile kaydedilir, arayüz hemen güncellenir.
 */
export function SidebarProjects({ projects, itemClass, rc, labelClass, onNavigate }: Props) {
  const fetcher = useFetcher({ key: "proje-sirasi" });
  const ids = projects.map((p) => p.id);
  // İyimser sıra; sunucudan yeni sıra (farklı kimlik dizisi) gelince geçersiz olur.
  const [local, setLocal] = useState<{ from: string; order: string[] } | null>(null);
  const focusAfter = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const idsKey = ids.join("|");

  const order = local && local.from === idsKey ? local.order : null;

  useEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = null;
    listRef.current?.querySelector<HTMLElement>(`[data-project-id="${CSS.escape(id)}"]`)?.focus();
  });

  const current = order ?? ids;
  const byId = new Map(projects.map((p) => [p.id, p]));
  const list = current.flatMap((id) => byId.get(id) ?? []);

  const move = (id: string, toIndex: number) => {
    const next = reorderIds(current, id, toIndex);
    if (next.join("|") === current.join("|")) return;
    setLocal({ from: idsKey, order: next });
    void fetcher.submit(
      { intent: "reorder", order: JSON.stringify(next) },
      { method: "post", action: "/api/projeler" },
    );
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.over.id === e.active.id) return;
    move(String(e.active.id), current.indexOf(String(e.over.id)));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable: "Sırayı değiştirmek için sürükleyin ya da Alt ve ok tuşlarını kullanın.",
        },
        announcements: {
          onDragStart: () => "Proje taşınıyor.",
          onDragOver: () => "",
          onDragEnd: ({ over }) => (over ? "Proje yeni yerine bırakıldı." : "Taşıma iptal edildi."),
          onDragCancel: () => "Taşıma iptal edildi.",
        },
      }}
    >
      <SortableContext items={current} strategy={verticalListSortingStrategy}>
        <div ref={listRef} className="flex flex-col gap-0.5">
          {list.map((project, i) => (
            <SortableProject
              key={project.id}
              project={project}
              itemClass={itemClass}
              rc={rc}
              labelClass={labelClass}
              onNavigate={onNavigate}
              onKeyMove={(delta) => {
                const to = i + delta;
                if (to < 0 || to >= list.length) return;
                focusAfter.current = project.id;
                move(project.id, to);
              }}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableProject({
  project,
  itemClass,
  rc,
  labelClass,
  onNavigate,
  onKeyMove,
}: Omit<Props, "projects"> & { project: ShellProject; onKeyMove: (delta: -1 | 1) => void }) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: project.id,
  });
  const viewer = project.role === "goruntuleyici";
  return (
    <NavLink
      ref={setNodeRef}
      to={projectHref(project.id)}
      prefetch="intent"
      data-project-id={project.id}
      onClick={onNavigate}
      className={(state) =>
        cn(itemClass(state), isDragging && "z-10 bg-surface shadow-elevated", "touch-manipulation")
      }
      style={{ transform: DndCSS.Translate.toString(transform), transition }}
      title={project.role ? `${project.name} · ${roleLabel(project.role)}` : project.name}
      aria-label={project.name}
      {...listeners}
      onKeyDown={(e) => {
        if (!e.altKey) return;
        if (e.key === "ArrowUp") {
          e.preventDefault();
          onKeyMove(-1);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          onKeyMove(1);
        }
      }}
    >
      {project.emoji ? (
        <span
          className={rc(
            "inline-flex w-5 shrink-0 justify-center text-base leading-none railed:size-7 railed:items-center railed:text-lg",
          )}
          aria-hidden="true"
        >
          {project.emoji}
        </span>
      ) : (
        <>
          <span
            className={rc("mx-[5px] size-2.5 shrink-0 rounded-full railed:hidden")}
            style={{ background: `var(--p-${project.color})` }}
            aria-hidden="true"
          />
          <span
            className={rc(
              "hidden size-7 shrink-0 items-center justify-center rounded-full text-xs leading-none font-semibold text-white railed:inline-flex",
            )}
            style={{ background: `var(--p-${project.color})` }}
            aria-hidden="true"
          >
            {project.name.trim().charAt(0).toLocaleUpperCase("tr-TR")}
          </span>
        </>
      )}
      <span className={labelClass}>{project.name}</span>
      {viewer && (
        <Lock
          className={rc("ml-auto size-3.5 shrink-0 text-muted-foreground railed:hidden")}
          aria-hidden="true"
        />
      )}
    </NavLink>
  );
}

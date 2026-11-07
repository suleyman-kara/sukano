import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import type { NoteCardData } from "~/domain/notes/optimistic";
import { NoteCard, type NoteCardProps } from "./note-card";

type CardProps = Omit<NoteCardProps, "note" | "href" | "onKeyMove">;

type NoteGridProps = CardProps & {
  notes: NoteCardData[];
  /** Kartın açtığı adres. */
  hrefFor?: (note: NoteCardData) => string | undefined;
  /** Verilirse sürükleyerek ve Alt+ok ile sıralama açık olur. */
  onMove?: (id: string, toIndex: number) => void;
  label: string;
};

/** Son sürüklemenin bittiği an; hemen ardından gelen tıklama notu açmasın. */
let lastDragEnd = 0;

/**
 * Masonry ızgara (CSS sütunları): masaüstünde en çok 4 sütun (≥ 232 px),
 * tablet ve mobilde 2 sütun. Sürükleme `@dnd-kit` ile; sütun düzeninde kartlar
 * yer değiştirmez, sürüklenen kartın yeri kesikli çerçeveyle, hedef kart vurguyla
 * gösterilir.
 */
export function NoteGrid({ notes, hrefFor, onMove, label, ...card }: NoteGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const focusAfterMove = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
  );

  useEffect(() => {
    const id = focusAfterMove.current;
    if (!id) return;
    focusAfterMove.current = null;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-note-id="${CSS.escape(id)}"] a[data-open]`)
      ?.focus();
  }, [notes]);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    lastDragEnd = Date.now();
    setActiveId(null);
    setOverId(null);
    if (!onMove || !e.over || e.over.id === e.active.id) return;
    const to = notes.findIndex((n) => n.id === e.over!.id);
    if (to >= 0) onMove(String(e.active.id), to);
  };

  const active = activeId ? notes.find((n) => n.id === activeId) : undefined;

  const cards = notes.map((note, i) => (
    <SortableCard
      key={note.id}
      note={note}
      href={hrefFor?.(note)}
      sortable={Boolean(onMove)}
      dropTarget={overId === note.id && activeId !== note.id}
      onKeyMove={
        onMove
          ? (delta) => {
              const to = i + delta;
              if (to < 0 || to >= notes.length) return;
              focusAfterMove.current = note.id;
              onMove(note.id, to);
            }
          : undefined
      }
      {...card}
    />
  ));

  const grid = (
    <div
      ref={listRef}
      role="list"
      aria-label={label}
      className={cn("columns-2 gap-2.5 md:gap-4 lg:[columns:4_232px]")}
      onClickCapture={(e) => {
        if (Date.now() - lastDragEnd < 150) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {cards}
    </div>
  );

  if (!onMove) return grid;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={(e) => setOverId(e.over ? String(e.over.id) : null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setOverId(null);
      }}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Taşımak için kartı sürükleyin ya da kart odaklıyken Alt ve ok tuşlarını kullanın.",
        },
        announcements: {
          onDragStart: () => "Not taşınıyor.",
          onDragOver: () => "",
          onDragEnd: ({ over }) => (over ? "Not yeni yerine bırakıldı." : "Taşıma iptal edildi."),
          onDragCancel: () => "Taşıma iptal edildi.",
        },
      }}
    >
      <SortableContext items={notes.map((n) => n.id)} strategy={() => null}>
        {grid}
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {active ? <NoteCard note={active} overlay {...card} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableCard({
  note,
  sortable,
  ...props
}: Omit<NoteCardProps, "dragging"> & { sortable: boolean }) {
  const { setNodeRef, attributes, listeners, isDragging } = useSortable({
    id: note.id,
    disabled: !sortable,
  });
  // Klavyeyle taşıma kendi Alt+ok kısayolumuzla; dnd-kit'in role/tabIndex öznitelikleri
  // kartı ikinci bir sekme durağı yapmasın diye alınmaz.
  void attributes;
  return (
    <div role="listitem" className="break-inside-avoid">
      <NoteCard
        ref={setNodeRef}
        note={note}
        dragging={isDragging}
        {...(sortable ? listeners : {})}
        {...props}
      />
    </div>
  );
}

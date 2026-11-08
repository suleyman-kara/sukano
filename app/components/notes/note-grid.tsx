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
import {
  AnimatePresence,
  LazyMotion,
  domMax,
  m,
  type TargetAndTransition,
  type Transition,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import { DROP_ANIMATION } from "~/components/drag-motion";
import { exitTransition, motionTransition } from "~/lib/motion";
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
 *
 * Canlı ızgara hareketi (PLAN §10, Motion yalnızca yerleşim ve çıkış için): kartlar
 * `layout="position"` ile yeni yerlerine kayar (sıralama, ekleme, başka kişinin
 * değişikliği), giren kart belirir, çıkan kart `AnimatePresence` ile solar. Hareketi
 * azalt açıkken (sistem ya da `data-motion="reduced"`) hiçbiri çalışmaz.
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

  const reduced = useReducedMotion();
  const cards = notes.map((note, i) => (
    <SortableCard
      key={note.id}
      reduced={reduced}
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
      <AnimatePresence initial={false}>{cards}</AnimatePresence>
    </div>
  );

  if (!onMove) return <LazyMotion features={domMax}>{grid}</LazyMotion>;

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
        <LazyMotion features={domMax}>{grid}</LazyMotion>
      </SortableContext>
      <DragOverlay dropAnimation={reduced ? null : DROP_ANIMATION}>
        {active ? <NoteCard note={active} overlay {...card} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Izgaraya giriş ve çıkış (MicroMotion 5): yeni kart .92 → 1 ölçek, medium ease-out;
 * silinen 1 → .92 ve saydam, small ease-in; komşular medium kayar. Azaltılmış harekette
 * ölçek ve kayma yok (MotionConfig), kart 120 ms saydamlıkla girer ya da çıkar.
 */
const CARD_TRANSITION = motionTransition("medium", false) as Transition;
const CARD_EXIT: TargetAndTransition = {
  opacity: 0,
  scale: 0.92,
  transition: exitTransition("medium", false) as Transition,
};
const REDUCED_TRANSITION = motionTransition("medium", true) as Transition;
const REDUCED_EXIT: TargetAndTransition = {
  opacity: 0,
  transition: exitTransition("medium", true) as Transition,
};

function SortableCard({
  note,
  sortable,
  reduced,
  ...props
}: Omit<NoteCardProps, "dragging"> & { sortable: boolean; reduced: boolean }) {
  const { setNodeRef, attributes, listeners, isDragging } = useSortable({
    id: note.id,
    disabled: !sortable,
  });
  // Klavyeyle taşıma kendi Alt+ok kısayolumuzla; dnd-kit'in role/tabIndex öznitelikleri
  // kartı ikinci bir sekme durağı yapmasın diye alınmaz.
  void attributes;
  return (
    <m.div
      role="listitem"
      data-note-item={note.id}
      className="break-inside-avoid"
      layout={reduced || isDragging ? false : "position"}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduced ? REDUCED_EXIT : CARD_EXIT}
      transition={reduced ? REDUCED_TRANSITION : CARD_TRANSITION}
    >
      <NoteCard
        ref={setNodeRef}
        note={note}
        dragging={isDragging}
        {...(sortable ? listeners : {})}
        {...props}
      />
    </m.div>
  );
}

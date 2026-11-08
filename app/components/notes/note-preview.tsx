import { ArrowLeft, X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate, useNavigation } from "react-router";
import { cn } from "cn";
import { preloadCollab } from "~/components/realtime/collab-loader";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import type { NoteCardData } from "~/domain/notes/optimistic";
import { TABLET_UP_QUERY, useMediaQuery } from "~/hooks/use-media-query";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import { focusCard, useCardToModalEnter } from "./card-to-modal";
import { noteBg } from "./colors";
import { noteIdFromPath } from "./note-links";

const IB =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-5 pointer-coarse:size-11";

/**
 * Izgaradan not açılırken loader beklenmez: tıklanan kartın elde olan verisiyle (başlık,
 * metin, görevler, renk) diyalog hemen açılır ve karttan büyür; not yüklenince gerçek
 * diyalog (düzenleyici) aynı yerde, hareketi sürdürerek yerini alır (`card-to-modal.ts`).
 *
 * Izgara rotaları `<Outlet />` yanına koyar. Bekleyen gezinme bu ızgaradaki bir notun
 * adresine gidiyorsa (ve not henüz açık değilse) önizleme çizilir.
 */
export function PendingNotePreview({ notes }: { notes: readonly NoteCardData[] }) {
  const navigation = useNavigation();
  const location = useLocation();
  const target = navigation.location;
  const id = navigation.state === "loading" && target ? noteIdFromPath(target.pathname) : null;
  if (!id || noteIdFromPath(location.pathname) === id) return null;
  const note = notes.find((n) => n.id === id);
  if (!note) return null;
  return <NotePreviewDialog key={id} note={note} />;
}

/** Yükleme sürerken açık notun yer tutucusu: salt okunur başlık ve içerik. */
export function NotePreviewDialog({ note }: { note: NoteCardData }) {
  const tabletUp = useMediaQuery(TABLET_UP_QUERY, true);
  const reduced = useReducedMotion();
  const enter = useCardToModalEnter(note.id, reduced, { preview: true });
  // Klavyeyle ya da bağlantıyla açılışta da ortak düzenleme parçası loader'la paralel iner.
  useEffect(preloadCollab, []);
  const navigate = useNavigate();
  const location = useLocation();
  // Yükleme bitmeden kapatılırsa bekleyen gezinme bulunulan adrese dönülerek iptal edilir.
  const cancelled = useRef(false);
  const cancel = useCallback(() => {
    cancelled.current = true;
    void navigate(location.pathname + location.search, { preventScrollReset: true });
  }, [navigate, location.pathname, location.search]);
  const title = note.title || "Başlıksız not";
  const isTodo = note.kind === "todo";
  const closeButton = tabletUp ? (
    <button type="button" className={IB} aria-label="Kapat" title="Kapat" onClick={cancel}>
      <X aria-hidden="true" />
    </button>
  ) : (
    <button type="button" className={IB} aria-label="Geri" onClick={cancel}>
      <ArrowLeft aria-hidden="true" />
    </button>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && cancel()}>
      <DialogContent
        ref={enter}
        showCloseButton={false}
        data-not-onizleme=""
        aria-busy="true"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
        // Gerçek diyalog gelince odak ona geçer (burada dokunulmaz); önizleme kapatılırsa
        // odak açılan kartın bağlantısına döner.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (cancelled.current) focusCard(note.id);
        }}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0 text-fg ring-0 data-open:animate-none data-closed:animate-none",
          tabletUp
            ? cn(
                "top-[60px] max-h-[calc(100dvh-120px)] w-[calc(100%-2rem)] max-w-[680px] translate-y-0 rounded-2xl shadow-elevated sm:max-w-[680px]",
                isTodo && "h-[min(760px,calc(100dvh-100px))] max-h-[calc(100dvh-100px)]",
              )
            : "inset-0 top-0 left-0 h-dvh w-full max-w-none translate-x-0 translate-y-0 rounded-none sm:max-w-none",
        )}
        style={{ background: noteBg(note.color), ["--note-bg" as string]: noteBg(note.color) }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">Not yükleniyor.</DialogDescription>
        {tabletUp ? (
          <div className="flex items-center gap-2.5 pt-[18px] pr-5 pb-1 pl-7">
            <p
              className={cn(
                "m-0 min-w-0 flex-1 truncate py-px text-xl font-semibold",
                !note.title && "text-muted-foreground",
              )}
            >
              {note.title || "Başlık"}
            </p>
            {closeButton}
          </div>
        ) : (
          <div className="flex items-center gap-0.5 px-2 pt-[max(12px,env(safe-area-inset-top))]">
            {closeButton}
          </div>
        )}
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden",
            tabletUp ? "px-7 pt-[50px] pb-3" : "px-5 pt-2",
          )}
        >
          {!tabletUp && (
            <p
              className={cn(
                "m-0 pt-1 pb-2 text-[22px] font-semibold break-words",
                !note.title && "text-muted-foreground",
              )}
            >
              {note.title || "Başlık"}
            </p>
          )}
          {isTodo ? (
            <ul className="m-0 flex list-none flex-col gap-3 p-0 pt-2">
              {note.tasks.map((t, i) => (
                <li key={t.id ?? `i${i}`} className="flex items-start gap-3">
                  <span
                    className="mt-0.5 size-[18px] shrink-0 rounded-[5px] border-[1.5px] border-muted-foreground opacity-80"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 break-words">{t.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p
              className={cn(
                "m-0 min-h-[120px] break-words whitespace-pre-line",
                tabletUp ? "text-[15px] leading-[1.65]" : "text-base leading-[1.6]",
                !note.preview && "text-muted-foreground",
              )}
            >
              {note.preview || "Not al…"}
            </p>
          )}
        </div>
        {tabletUp && <div className="h-[60px] shrink-0" aria-hidden="true" />}
      </DialogContent>
    </Dialog>
  );
}

import { Download, Paperclip, RotateCw, X } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "cn";
import type { AttachmentView, PendingUpload } from "~/domain/attachments/pending";
import {
  ACCEPT_ATTR,
  attachmentUrl,
  fileBadge,
  formatProgress,
  formatSize,
  type BadgeTone,
} from "~/domain/attachments/rules";
import { AttachmentViewer } from "./attachment-viewer";
import type { NoteAttachments } from "./use-note-attachments";

const TONES: Record<BadgeTone, string> = {
  pdf: "bg-danger-soft text-danger",
  image: "bg-primary-soft text-primary",
  doc: "bg-[color-mix(in_srgb,var(--p-mavi)_20%,var(--surface))] text-fg",
  sheet: "bg-[color-mix(in_srgb,var(--p-yesil)_20%,var(--surface))] text-fg",
  slide: "bg-[color-mix(in_srgb,var(--p-turuncu)_20%,var(--surface))] text-fg",
  neutral: "bg-hover text-muted-foreground",
};

/** Uzantı rozeti (TextNote: 36 px, "PDF"). */
export function FileBadge({ name, className }: { name: string; className?: string }) {
  const { label, tone } = fileBadge(name);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold tracking-tight",
        TONES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Ek kutucuğunun ortak çerçevesi (TextNote `.att`). */
const TILE =
  "relative flex items-center gap-2.5 rounded-[10px] border border-[rgba(0,0,0,.08)] bg-[rgba(255,255,255,.5)] dark:border-[rgba(255,255,255,.1)] dark:bg-transparent";

const IB =
  "inline-flex size-[30px] shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-[18px] pointer-coarse:size-10";

/**
 * Notun ekleri: görseller önce (küçük resim; tıklayınca görüntüleyici), sonra dosya
 * çipleri (rozet, ad, boyut; tıklayınca iner), sonra yüklenen / hata veren dosyalar.
 * Masaüstü ve tablette yan yana sarar, mobilde alt alta tam genişlik.
 */
export function AttachmentStrip({
  attachments: a,
  editable,
  stacked = false,
}: {
  attachments: NoteAttachments;
  editable: boolean;
  /** Mobil: tam genişlik, alt alta. */
  stacked?: boolean;
}) {
  const [viewing, setViewing] = useState<string | null>(null);
  const images = a.visible.filter((x) => x.kind === "image");
  const others = a.visible.filter((x) => x.kind !== "image");
  if (a.visible.length === 0 && a.pending.length === 0) return null;
  return (
    <section
      aria-label="Ekler"
      data-testid="ekler"
      className={cn("mt-2 flex gap-2.5", stacked ? "flex-col gap-2" : "flex-wrap items-start")}
    >
      {images.map((x) => (
        <ImageTile
          key={x.id}
          item={x}
          stacked={stacked}
          editable={editable}
          onOpen={() => setViewing(x.id)}
          onRemove={() => void a.remove(x.id)}
        />
      ))}
      {others.map((x) => (
        <FileTile
          key={x.id}
          item={x}
          stacked={stacked}
          editable={editable}
          onRemove={() => void a.remove(x.id)}
        />
      ))}
      {a.pending.map((u) => (
        <PendingTile
          key={u.key}
          item={u}
          stacked={stacked}
          onRetry={() => a.retry(u.key)}
          onDismiss={() => a.dismiss(u.key)}
        />
      ))}
      <AttachmentViewer images={images} openId={viewing} onOpenChange={(id) => setViewing(id)} />
    </section>
  );
}

function RemoveButton({
  name,
  onClick,
  className,
}: {
  name: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(IB, className)}
      aria-label={`Eki kaldır: ${name}`}
      title="Eki kaldır"
      onClick={onClick}
    >
      <X aria-hidden="true" />
    </button>
  );
}

function ImageTile({
  item,
  stacked,
  editable,
  onOpen,
  onRemove,
}: {
  item: AttachmentView;
  stacked: boolean;
  editable: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        TILE,
        "group/ek items-stretch overflow-hidden p-0",
        stacked ? "h-[140px] w-full" : "h-[132px] w-[200px]",
      )}
      data-ek={item.id}
    >
      <button
        type="button"
        className="block size-full bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        aria-label={`Görseli aç: ${item.name}`}
        onClick={onOpen}
      >
        <img
          src={attachmentUrl(item.id)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full object-cover"
        />
      </button>
      {editable && (
        <RemoveButton
          name={item.name}
          onClick={onRemove}
          className="absolute top-1.5 right-1.5 bg-surface/85 text-fg opacity-0 shadow-sm backdrop-blur-sm group-focus-within/ek:opacity-100 group-hover/ek:opacity-100 hover:bg-surface pointer-coarse:opacity-100"
        />
      )}
    </div>
  );
}

function FileTile({
  item,
  stacked,
  editable,
  onRemove,
}: {
  item: AttachmentView;
  stacked: boolean;
  editable: boolean;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(TILE, "py-2 pr-1.5 pl-2", stacked ? "w-full" : "w-[260px] md:max-lg:w-[280px]")}
      data-ek={item.id}
    >
      <a
        href={attachmentUrl(item.id, true)}
        download={item.name}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-fg no-underline outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <FileBadge name={item.name} />
        <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
          <span className="truncate font-medium">
            <span className="sr-only">İndir:</span> {item.name}
          </span>{" "}
          <span className="text-xs text-muted-foreground">{formatSize(item.size)}</span>
        </span>
        {!editable && (
          <Download
            className="mr-1.5 size-[18px] shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </a>
      {editable && <RemoveButton name={item.name} onClick={onRemove} />}
    </div>
  );
}

function PendingTile({
  item,
  stacked,
  onRetry,
  onDismiss,
}: {
  item: PendingUpload;
  stacked: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const failed = item.status === "hata";
  const percent = item.size ? Math.min(100, Math.round((item.loaded / item.size) * 100)) : 0;
  return (
    <div
      className={cn(
        TILE,
        "py-2 pr-2 pl-2",
        stacked ? "w-full" : failed ? "w-full max-w-[420px]" : "w-[260px]",
        failed && "border-danger bg-danger-soft dark:border-danger dark:bg-danger-soft",
      )}
      data-yukleme={item.status}
      role={failed ? "alert" : undefined}
    >
      <FileBadge name={item.name} className={failed ? "bg-surface/60 text-danger" : undefined} />
      <span className="flex min-w-0 flex-1 flex-col gap-1 leading-[1.3]">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{item.name}</span>
          {!failed && (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatProgress(item.loaded, item.size)}
            </span>
          )}
        </span>
        {failed ? (
          <span className="text-xs text-danger">{item.error}</span>
        ) : (
          <span
            role="progressbar"
            aria-label={`${item.name} yükleniyor`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="block h-1 overflow-hidden rounded-full bg-line"
          >
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${percent}%` }}
            />
          </span>
        )}
      </span>
      {failed && item.retryable && (
        <button
          type="button"
          className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-2.5 text-[13px] font-medium hover:bg-hover"
          onClick={onRetry}
        >
          <RotateCw className="size-3.5" aria-hidden="true" />
          Tekrar dene
        </button>
      )}
      {failed && (
        <button
          type="button"
          className="inline-flex h-[30px] shrink-0 items-center rounded-[10px] border border-line bg-surface px-2.5 text-[13px] font-medium hover:bg-hover"
          onClick={onDismiss}
        >
          Kaldır
        </button>
      )}
    </div>
  );
}

/** "Dosya ekle" (ataç) düğmesi ve gizli dosya seçicisi. */
export function AttachButton({
  canAdd,
  onFiles,
  className,
}: {
  canAdd: boolean;
  onFiles: (files: File[]) => void;
  className: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label="Dosya ekle"
        title="Dosya ekle"
        disabled={!canAdd}
        onClick={() => input.current?.click()}
      >
        <Paperclip aria-hidden="true" />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="dosya-sec"
        onChange={(e) => {
          const list = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = "";
          onFiles(list);
        }}
      />
    </>
  );
}

/** Sürüklerken notun üstünde kesik çizgili bırakma alanı (States2). */
export function DropOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-[color-mix(in_srgb,var(--fg)_30%,transparent)] bg-[color-mix(in_srgb,var(--note-bg)_88%,transparent)] px-6 text-center text-[13px] text-muted-foreground"
    >
      Dosyayı buraya bırak ya da seç · yalnızca metin notunda
    </div>
  );
}

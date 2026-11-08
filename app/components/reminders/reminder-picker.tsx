import { Bell, Calendar as CalendarIcon, Clock } from "lucide-react";
import { useMemo, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "cn";
import { Avatar } from "~/components/avatar";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { TABLET_UP_QUERY, useMediaQuery } from "~/hooks/use-media-query";
import {
  quickReminderOptions,
  timeZoneLabel,
  zonedParts,
  zonedToUtc,
} from "~/domain/reminders/time";

export type ReminderAudience =
  | { kind: "personal" }
  | { kind: "project"; members: { id: string; name: string; color: string }[] };

export type ReminderPickerProps = {
  noteTitle: string;
  /** Kurulu hatırlatıcının anı (ms) ya da null. */
  value: number | null;
  timeZone: string;
  audience: ReminderAudience;
  /** Kaydedince (yerel tarih + saat); başarılıysa true. */
  onSave: (date: string, time: string) => Promise<boolean> | boolean;
  onClear: () => Promise<boolean> | boolean;
  onCancel: () => void;
  variant?: "popover" | "sheet";
  /** Testler için sabit saat (ms). */
  now?: number;
};

const FIELD =
  "h-11 w-full min-w-0 rounded-[10px] border border-line bg-surface pr-2 pl-9 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 aria-invalid:border-danger md:h-10";

/**
 * Not hatırlatıcısı seçicisi (Forms "Not hatırlatıcısı · proje notu", MReminder): hızlı
 * seçenekler, tarih ve saat alanları, kime gideceği, "Bir kez çalar. Saat dilimi: …" ve
 * Kaldır / Vazgeç / Kaydet. Saat kişinin saat diliminde yorumlanır.
 */
export function ReminderPicker({
  noteTitle,
  value,
  timeZone,
  audience,
  onSave,
  onClear,
  onCancel,
  variant = "popover",
  now: fixedNow,
}: ReminderPickerProps) {
  const [now] = useState(() => fixedNow ?? Date.now());
  const quick = useMemo(() => quickReminderOptions(now, timeZone), [now, timeZone]);
  const initial =
    value !== null ? zonedParts(value, timeZone) : { date: quick[0]!.date, time: quick[0]!.time };
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [busy, setBusy] = useState(false);
  const sheet = variant === "sheet";

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time);
  const past = valid && zonedToUtc(date, time, timeZone) <= now;
  const error = !valid ? "Tarih ve saat seç." : past ? "Geçmiş bir zaman seçilemez." : null;

  const run = async (fn: () => Promise<boolean> | boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("flex flex-col", sheet ? "gap-3" : "gap-2.5")}>
      <div className="flex items-center gap-2.5 px-1 pt-0.5 pb-1">
        <Bell className="size-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden="true" />
        <h2
          id="hatirlatici-baslik"
          className={cn("m-0 font-semibold", sheet ? "text-lg" : "text-[15px]")}
        >
          Hatırlatıcı
        </h2>
        <span className="ml-auto min-w-0 truncate text-[13px] text-muted-foreground">
          {noteTitle || "Başlıksız not"}
        </span>
      </div>

      <div className="flex flex-col gap-0.5" role="group" aria-label="Hızlı seçenekler">
        {quick.map((q) => {
          const on = q.date === date && q.time === time;
          return (
            <button
              key={q.key}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setDate(q.date);
                setTime(q.time);
              }}
              className={cn(
                "flex min-h-11 items-center justify-between rounded-lg px-3 font-medium outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9",
                on && "bg-primary-soft text-primary hover:bg-primary-soft",
              )}
            >
              {q.label}
              <small
                className={cn(
                  "text-[13px] font-normal text-muted-foreground",
                  on && "text-primary",
                )}
              >
                {q.hint}
              </small>
            </button>
          );
        })}
      </div>

      <div className="h-px bg-line" aria-hidden="true" />

      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2.5">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[13px] font-medium">Tarih</span>
          <span className="relative block">
            <CalendarIcon
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "hatirlatici-hata" : undefined}
              className={FIELD}
            />
          </span>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[13px] font-medium">Saat</span>
          <span className="relative block">
            <Clock
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "hatirlatici-hata" : undefined}
              className={FIELD}
            />
          </span>
        </label>
      </div>
      {error && (
        <p id="hatirlatici-hata" role="alert" className="m-0 text-[13px] text-danger">
          {error}
        </p>
      )}

      {audience.kind === "project" && (
        <div className="flex items-center gap-2.5 rounded-[10px] bg-hover px-3 py-2.5">
          <span className="flex shrink-0">
            {audience.members.slice(0, 3).map((m, i) => (
              <Avatar
                key={m.id}
                name={m.name}
                color={m.color}
                size={sheet ? 26 : 24}
                className={cn("border-2 border-hover", i > 0 && "-ml-1.5")}
              />
            ))}
          </span>
          <span className="text-sm">
            Projedeki herkese gider{" "}
            <span className="text-muted-foreground">· {audience.members.length} üye</span>
          </span>
        </div>
      )}

      <p className="m-0 text-[13px] text-muted-foreground">
        Bir kez çalar. Saat dilimi: {timeZoneLabel(timeZone)} (tarayıcıdan).
      </p>

      <div className="flex items-center gap-2 border-t border-line pt-2.5">
        {value !== null && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-[34px] px-2.5 text-danger hover:text-danger"
            disabled={busy}
            onClick={() => void run(onClear)}
          >
            Kaldır
          </Button>
        )}
        <span className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-[34px] border-line bg-surface px-3 hover:bg-hover"
          onClick={onCancel}
        >
          Vazgeç
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-[34px] px-3.5"
          disabled={busy || error !== null}
          onClick={() => void run(() => onSave(date, time))}
        >
          Kaydet
        </Button>
      </div>
    </div>
  );
}

type ReminderControlProps = Omit<ReminderPickerProps, "variant" | "onCancel"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Masaüstü / tablette açılır pencerenin bağlandığı düğme. */
  trigger?: React.ReactNode;
};

/**
 * Masaüstü ve tablette tetikleyiciye bağlı açılır pencere, mobilde alttan açılan sayfa
 * (onaylı sheet kuralı: altta Vazgeç + Kaydet, × yok; tutamak ve karartma "Kapat").
 */
export function ReminderControl({ open, onOpenChange, trigger, ...props }: ReminderControlProps) {
  const tabletUp = useMediaQuery(TABLET_UP_QUERY, true);
  const close = () => onOpenChange(false);

  if (tabletUp && trigger) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          sideOffset={6}
          data-todo-esc=""
          aria-labelledby="hatirlatici-baslik"
          role="dialog"
          className="w-[360px] gap-0 rounded-[14px] border border-line bg-surface p-4 text-fg shadow-elevated ring-0"
        >
          {open && <ReminderPicker {...props} onCancel={close} />}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <>
      {trigger}
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-dim data-[state=open]:animate-in data-[state=open]:fade-in-0 reduced-motion:animate-none" />
          <DialogPrimitive.Content
            data-todo-esc=""
            aria-labelledby="hatirlatici-baslik"
            aria-describedby={undefined}
            className={cn(
              "fixed z-50 flex max-h-[92dvh] flex-col gap-3 overflow-y-auto border border-line bg-surface text-fg shadow-elevated outline-none",
              "inset-x-0 bottom-0 rounded-t-[20px] px-4 pt-2 pb-[max(24px,env(safe-area-inset-bottom))]",
              "md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[400px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:p-5",
              "data-[state=open]:animate-in data-[state=open]:fade-in-0 max-md:data-[state=open]:slide-in-from-bottom-8 reduced-motion:animate-none",
            )}
          >
            <DialogPrimitive.Title className="sr-only">Hatırlatıcı</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Kapat"
                className="mx-auto -mb-1 flex h-6 w-16 shrink-0 items-center justify-center md:hidden"
              >
                <span className="h-1 w-10 rounded-full bg-line" aria-hidden="true" />
              </button>
            </DialogPrimitive.Close>
            {open && <ReminderPicker {...props} variant="sheet" onCancel={close} />}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

import {
  ArrowRight,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { Switch } from "~/components/ui/switch";
import { formatDay, quickDates, type DateSlot } from "~/domain/tasks/dates";

export const MONTHS_FULL = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];
const WEEKDAYS_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const CAL_HEAD = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

const pad = (n: number) => String(n).padStart(2, "0");
const weekdayOf = (iso: string) => WEEKDAYS_SHORT[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;

export type DatePickerValue = {
  startDate: string | null;
  dueDate: string | null;
  dueTime: string | null;
};

export type DatePickerProps = DatePickerValue & {
  today: string;
  slot: DateSlot;
  onSlot: (slot: DateSlot) => void;
  timeOpen: boolean;
  onToggleTime: () => void;
  onTime: (time: string | null) => void;
  /** Başlangıç ≤ bitiş kuralı ya da saat uyarısı. */
  warning: string | null;
  /** Doğal yazım alanı. */
  text: string;
  textError: boolean;
  onText: (text: string) => void;
  onTextSubmit: (text: string) => void;
  onPick: (date: string) => void;
  onClear: () => void;
  /** Doğal yazım alanının kimliği (Ctrl+D odağı). */
  textId?: string;
  variant?: "popover" | "sheet";
  /** "Hatırlat" açık mı (görevin hatırlatıcısı var). */
  remind?: boolean;
  /** Kime gider: "Atananlara gider" ya da "Sana gider". */
  remindTo?: string;
  /** Anahtar değişince; yoksa anahtar devre dışı (görüntüleyici). */
  onRemind?: (on: boolean) => void;
};

/**
 * Görev tarih seçicisi (PLAN §10, prototip TodoNote / MTodoDate): iki yuva ve ok
 * (başlangıç → bitiş, varsayılan bitiş), saat düğmesi, doğal yazım alanı, hızlı
 * seçenekler, aralık vurgulu takvim (Pazartesi başlangıçlı), Hatırlat (bitiş tarihi varken; saat
 * yoksa 09:00) ve
 * "Tarihleri temizle". Kontrollüdür; değerler görevden gelir.
 */
export function DatePicker(props: DatePickerProps) {
  const {
    startDate,
    dueDate,
    dueTime,
    today,
    slot,
    onSlot,
    timeOpen,
    onToggleTime,
    onTime,
    warning,
    text,
    textError,
    onText,
    onTextSubmit,
    onPick,
    onClear,
    textId,
    variant = "popover",
    remind = false,
    remindTo = "Sana gider",
    onRemind,
  } = props;
  const remindDisabled = !onRemind || !dueDate;
  const sheet = variant === "sheet";
  const focus = (slot === "start" ? startDate : dueDate) ?? dueDate ?? startDate ?? today;
  const [month, setMonth] = useState(() => focus.slice(0, 7));
  const quick = quickDates(today);
  const errorId = textId ? `${textId}-hata` : undefined;

  return (
    <div className={cn("flex flex-col", sheet ? "gap-2.5" : "")}>
      <div className={cn("flex items-center gap-1.5", sheet ? "" : "px-0.5 pt-0.5 pb-2")}>
        <SlotButton
          label="Başlangıç"
          aria="Başlangıç tarihi"
          value={startDate ? formatDay(startDate, today) : ""}
          on={slot === "start"}
          onClick={() => onSlot("start")}
          sheet={sheet}
        />
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <SlotButton
          label="Bitiş"
          aria="Bitiş tarihi"
          value={dueDate ? formatDay(dueDate, today) : ""}
          on={slot === "due"}
          onClick={() => onSlot("due")}
          sheet={sheet}
        />
        <button
          type="button"
          onClick={onToggleTime}
          aria-label={dueTime ? `Saat ${dueTime}` : "Saat ekle"}
          aria-expanded={timeOpen}
          className={cn(
            "inline-flex min-w-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-muted-foreground outline-none hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-[17px]",
            sheet ? "h-11" : "h-9",
            dueTime && "text-primary hover:text-primary",
            timeOpen && "bg-hover",
          )}
        >
          <Clock aria-hidden="true" />
          {dueTime && <span>{dueTime}</span>}
        </button>
      </div>

      {timeOpen && (
        <div className={cn("flex items-center gap-2", sheet ? "" : "px-0.5 pb-2")}>
          <input
            type="time"
            aria-label="Bitiş saati"
            value={dueTime ?? ""}
            onChange={(e) => onTime(e.target.value || null)}
            className="h-8 flex-1 rounded-[7px] border border-line bg-surface px-2 outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
      )}

      {warning && (
        <div
          role="status"
          className={cn(
            "rounded-[7px] bg-warn-soft px-2 py-1.5 text-xs text-warn",
            sheet ? "" : "mx-0.5 mb-2",
          )}
        >
          {warning}
        </div>
      )}

      <div className={sheet ? "" : "px-0.5 pb-2"}>
        <label className="block">
          <span className="sr-only">
            {slot === "start" ? "Başlangıç tarihini yaz" : "Bitiş tarihini yaz"}
          </span>
          <input
            id={textId}
            value={text}
            placeholder="yarın, cuma, 15 kasım…"
            autoComplete="off"
            aria-invalid={textError}
            aria-describedby={textError ? errorId : undefined}
            onChange={(e) => onText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                onTextSubmit(e.currentTarget.value);
              }
            }}
            className={cn(
              "w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus:outline-2 focus:-outline-offset-1 focus:outline-primary",
              sheet ? "h-11 text-[15px]" : "h-[34px]",
              textError && "border-danger outline-2 -outline-offset-1 outline-danger",
            )}
          />
        </label>
        {textError && (
          <span id={errorId} className="block px-0.5 pt-1 text-xs text-danger">
            Anlaşılmadı · ör. yarın, cuma, 15 kasım
          </span>
        )}
      </div>

      <div className={cn(sheet ? "grid grid-cols-3 gap-1" : "flex flex-col")}>
        <QuickButton
          label="Bugün"
          hint={weekdayOf(quick.today)}
          onClick={() => onPick(quick.today)}
          sheet={sheet}
        />
        <QuickButton
          label="Yarın"
          hint={weekdayOf(quick.tomorrow)}
          onClick={() => onPick(quick.tomorrow)}
          sheet={sheet}
        />
        <QuickButton
          label="Gelecek hafta"
          hint={`${weekdayOf(quick.nextWeek)}, ${formatDay(quick.nextWeek, today)}`}
          onClick={() => onPick(quick.nextWeek)}
          sheet={sheet}
        />
      </div>

      <Calendar
        month={month}
        onMonth={setMonth}
        today={today}
        startDate={startDate}
        dueDate={dueDate}
        onPick={onPick}
        sheet={sheet}
      />

      <div
        className={cn(
          "flex items-center gap-2 border-t border-line",
          sheet ? "pt-2.5" : "mt-2 pt-2.5 pr-1.5 pb-0.5 pl-2.5",
        )}
      >
        <div
          className="flex min-w-0 flex-1 items-center gap-2 text-[13px] font-medium"
          title={onRemind && !dueDate ? "Hatırlatmak için önce bitiş tarihi ver" : undefined}
        >
          <Switch
            checked={remind && Boolean(dueDate)}
            disabled={remindDisabled}
            onCheckedChange={(on) => onRemind?.(on)}
            aria-label="Hatırlat"
            aria-describedby="hatirlat-kime"
          />
          <span className="flex flex-col leading-tight" aria-hidden="true">
            Hatırlat
            <small id="hatirlat-kime" className="text-xs font-normal text-muted-foreground">
              {remindTo}
            </small>
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="h-[30px] shrink-0 rounded-[10px] border border-line px-2.5 text-[13px] font-medium text-danger outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Tarihleri temizle
        </button>
      </div>
    </div>
  );
}

function SlotButton({
  label,
  aria,
  value,
  on,
  onClick,
  sheet,
}: {
  label: string;
  aria: string;
  value: string;
  on: boolean;
  onClick: () => void;
  sheet: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={value ? `${aria}: ${value}` : aria}
      aria-pressed={on}
      className={cn(
        "inline-flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-px rounded-lg border border-line text-center text-[13px] font-semibold outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50",
        sheet ? "h-14" : "h-[46px]",
        on && "border-2 border-primary bg-primary-soft text-primary hover:bg-primary-soft",
      )}
    >
      <span
        className={cn(
          "text-[11px] leading-tight font-medium text-muted-foreground",
          on && "text-primary",
        )}
        aria-hidden="true"
      >
        {label}
      </span>
      {value ? (
        <span aria-hidden="true">{value}</span>
      ) : (
        <CalendarIcon
          className={cn(
            "size-[18px] text-muted-foreground opacity-55",
            on && "text-primary opacity-80",
          )}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

function QuickButton({
  label,
  hint,
  onClick,
  sheet,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  sheet: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg font-medium outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50",
        sheet
          ? "flex min-h-11 flex-col items-center justify-center border border-line px-1 text-[13px] leading-tight"
          : "flex w-full items-center justify-between px-2.5 py-[7px]",
      )}
    >
      {label} <small className="font-normal text-muted-foreground">{hint}</small>
    </button>
  );
}

export function Calendar({
  month,
  onMonth,
  today,
  startDate,
  dueDate,
  onPick,
  sheet,
}: {
  /** `YYYY-MM` */
  month: string;
  onMonth: (month: string) => void;
  today: string;
  startDate: string | null;
  dueDate: string | null;
  onPick: (date: string) => void;
  sheet?: boolean;
}) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const shift = (d: number) => {
    const n = new Date(Date.UTC(y, m - 1 + d, 1));
    onMonth(`${n.getUTCFullYear()}-${pad(n.getUTCMonth() + 1)}`);
  };
  const rangeStart = startDate && dueDate && startDate < dueDate ? startDate : null;
  const title = `${MONTHS_FULL[m - 1]} ${y}`;
  const yearSuffix = String(y) === today.slice(0, 4) ? "" : ` ${y}`;

  return (
    <div className={sheet ? "border-t border-line pt-1" : ""}>
      <div className="flex items-center justify-between pt-2 pr-1 pl-2.5 font-semibold">
        <span aria-live="polite">{title}</span>
        <span className="inline-flex gap-0.5">
          <button
            type="button"
            aria-label="Önceki ay"
            title="Önceki ay"
            onClick={() => shift(-1)}
            className={cn(
              "inline-flex items-center justify-center rounded-[7px] text-muted-foreground outline-none hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4",
              sheet ? "size-11" : "size-7",
            )}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Sonraki ay"
            title="Sonraki ay"
            onClick={() => shift(1)}
            className={cn(
              "inline-flex items-center justify-center rounded-[7px] text-muted-foreground outline-none hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4",
              sheet ? "size-11" : "size-7",
            )}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </span>
      </div>
      <div role="group" aria-label={title} className="mt-1.5 grid grid-cols-7 gap-0.5">
        {CAL_HEAD.map((d) => (
          <span
            key={d}
            className="py-1 text-center text-[11px] text-muted-foreground"
            aria-hidden="true"
          >
            {d}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`e${i}`} aria-hidden="true" />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const n = i + 1;
          const iso = `${y}-${pad(m)}-${pad(n)}`;
          const isDue = iso === dueDate;
          const isStart = !isDue && iso === startDate;
          const inRange = !!rangeStart && iso > rangeStart && iso < dueDate!;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPick(iso)}
              aria-label={`${n} ${MONTHS_FULL[m - 1]}${yearSuffix}`}
              aria-pressed={isDue || isStart}
              aria-current={iso === today ? "date" : undefined}
              data-range={isDue ? "due" : isStart ? "start" : inRange ? "in" : undefined}
              className={cn(
                "rounded-[7px] text-center text-[13px] outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-primary",
                sheet ? "h-10" : "h-[30px]",
                iso === today && "font-semibold text-primary",
                inRange && "rounded-none bg-primary-soft",
                isStart && "font-semibold text-primary shadow-[inset_0_0_0_2px_var(--accent)]",
                isDue && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

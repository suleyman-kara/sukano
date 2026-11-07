import { Check, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Avatar } from "~/components/avatar";

/**
 * Kişi seçici (PLAN §3 "Atama", prototip TodoNote `pop` "Kişiye ata", MTodoWho):
 * yalnızca proje notunda. Birden fazla kişi seçilebilir; "sen" en üstte; görüntüleyiciler
 * soluk ve "görüntüleyici · işaretleyemez" notuyla (atanabilir ama işaretleyemez).
 */

/** Atanabilir proje üyesi (sıra: sen, rol, ad — sunucudaki `sortMembers`). */
export type Assignable = {
  id: string;
  name: string;
  color: string;
  avatarUrl?: string | null;
  isMe: boolean;
  /** Görüntüleyici: atanabilir, görevi işaretleyemez. */
  viewer: boolean;
};

/** Proje notunda kişi seçicinin verisi; kişisel notta yok (atama yok). */
export type TodoPeople = {
  members: Assignable[];
  /** Kişi seçici açılabilir mi (yönetici, düzenleyici). */
  canAssign: boolean;
};

export const personLabel = (p: Assignable) => (p.isMe ? `${p.name} (sen)` : p.name);

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Ayrıntıdaki kişi çipinin metni: "Sen, Zeynep" ya da "Kişiye ata". */
export function assigneeChipText(people: readonly Assignable[]) {
  return people.length
    ? people.map((p) => (p.isMe ? "Sen" : firstName(p.name))).join(", ")
    : "Kişiye ata";
}

/** Atananların kimliklerini üye kayıtlarına çevirir (üye olmayan/çıkarılan atlanır). */
export function resolveAssignees(
  ids: readonly string[] | undefined,
  members: readonly Assignable[],
) {
  if (!ids?.length) return [];
  return members.filter((m) => ids.includes(m.id));
}

/** Satırdaki ve karttaki sessiz ipucu: en çok 3 avatar, fazlası "+n". */
export function AssigneeAvatars({
  people,
  size = 22,
  max = 3,
  className,
}: {
  people: readonly Assignable[] | readonly { id: string; name: string; color: string }[];
  size?: number;
  max?: number;
  className?: string;
}) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const names = people.map((p) => p.name).join(", ");
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)} title={names}>
      <span className="sr-only">Atananlar: {names}</span>
      {shown.map((p, i) => (
        <Avatar
          key={p.id}
          name={p.name}
          color={p.color}
          size={size}
          className={cn(i > 0 && "-ml-1.5 ring-2 ring-[var(--row-ring,var(--surface))]")}
        />
      ))}
      {rest > 0 && (
        <span
          className="-ml-1.5 inline-flex items-center justify-center rounded-full bg-line px-1 text-[10px] font-semibold text-muted-foreground"
          style={{ height: size, minWidth: size }}
          aria-hidden="true"
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

export type PersonListProps = {
  members: readonly Assignable[];
  selected: readonly string[];
  onToggle: (userId: string) => void;
  /** Açılınca ilk kişiye odaklan (klavye akışı). */
  focusOnMount?: boolean;
  /** Mobil sayfa: büyük satırlar (44+ px). */
  large?: boolean;
  /** Erişilebilir ad ("Kişiye ata: İçerik yazımı"). */
  label: string;
  id?: string;
};

/**
 * Proje üyeleri listesi. Klavye: ↑ / ↓ (Home / End) gezinir, Enter ya da Boşluk seçer
 * veya seçimi kaldırır; Esc katmanı kapatır (Popover / sayfa karşılar).
 */
export function PersonList({
  members,
  selected,
  onToggle,
  focusOnMount,
  large,
  label,
  id,
}: PersonListProps) {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const optionAt = (i: number) =>
    listRef.current?.querySelectorAll<HTMLElement>("[role=option]")[i] ?? null;

  useEffect(() => {
    if (focusOnMount) optionAt(0)?.focus();
  }, [focusOnMount]);

  const move = (i: number) => {
    const next = Math.max(0, Math.min(members.length - 1, i));
    setActive(next);
    optionAt(next)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number, userId: string) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        return move(i + 1);
      case "ArrowUp":
        e.preventDefault();
        return move(i - 1);
      case "Home":
        e.preventDefault();
        return move(0);
      case "End":
        e.preventDefault();
        return move(members.length - 1);
      case "Enter":
      case " ":
        e.preventDefault();
        return onToggle(userId);
    }
  };

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "text-[11px] font-semibold tracking-[.08em] text-muted-foreground uppercase",
          large ? "mx-1.5 mb-1" : "px-2 pt-1 pb-1.5",
        )}
        aria-hidden="true"
      >
        Proje üyeleri
      </div>
      <div
        ref={listRef}
        id={id}
        role="listbox"
        aria-multiselectable="true"
        aria-label={label}
        className="flex flex-col"
      >
        {members.map((m, i) => {
          const on = selected.includes(m.id);
          return (
            <div
              key={m.id}
              role="option"
              aria-selected={on}
              tabIndex={i === active ? 0 : -1}
              data-person={m.id}
              onClick={() => {
                setActive(i);
                onToggle(m.id);
              }}
              onKeyDown={(e) => onKeyDown(e, i, m.id)}
              onFocus={() => setActive(i)}
              className={cn(
                "flex w-full cursor-pointer items-center rounded-lg outline-none select-none hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-primary",
                large ? "min-h-12 gap-3 px-1.5" : "min-h-9 gap-2.5 px-2 py-1.5",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] border-muted-foreground",
                  on && "border-primary bg-primary text-primary-foreground",
                  large && "size-5",
                )}
                aria-hidden="true"
              >
                {on && <Check className="size-3.5" strokeWidth={3} />}
              </span>
              <Avatar
                name={m.name}
                color={m.color}
                src={m.avatarUrl}
                size={large ? 32 : 24}
                className={cn(m.viewer && "saturate-[.35]")}
              />
              <span className="flex min-w-0 flex-col leading-tight">
                <span
                  className={cn(
                    "truncate",
                    large && "text-[15px]",
                    m.viewer && "text-muted-foreground",
                  )}
                >
                  {personLabel(m)}
                </span>
                {m.viewer && (
                  <small className="text-xs text-muted-foreground">
                    görüntüleyici · işaretleyemez
                  </small>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Ayrıntıdaki kişi çipi (TodoNote `.chip`, MTodoDetail `.dchip`). */
export function PersonChip({
  people,
  onClick,
  large,
  disabled,
}: {
  people: readonly Assignable[];
  onClick?: () => void;
  large?: boolean;
  disabled?: boolean;
}) {
  const set = people.length > 0;
  const aria = set ? `Atananlar: ${people.map((p) => p.name).join(", ")}` : "Kişiye ata";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-line pr-2.5 pl-2 text-[13px] font-medium outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none [&_svg]:size-[15px] [&_svg]:text-muted-foreground",
        large ? "h-11 rounded-xl text-[15px]" : "h-[30px]",
        set && "border-transparent bg-primary-soft text-primary [&_svg]:text-primary",
        set && "[--row-ring:var(--accent-soft)]",
      )}
    >
      {set && large ? (
        <AssigneeAvatars people={people} size={24} />
      ) : (
        <UserRound aria-hidden="true" />
      )}
      {assigneeChipText(people)}
    </button>
  );
}

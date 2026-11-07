import { Avatar } from "~/components/avatar";

type Member = { userId: string; name: string; avatarColor: string; avatarUrl: string | null };

const MAX = 5;

/** Üst üste binen üye avatarları (en çok 5, fazlası "+n"); adlar ekran okuyucuya. */
export function MemberAvatars({ members, size = 28 }: { members: Member[]; size?: number }) {
  const shown = members.slice(0, MAX);
  const extra = members.length - shown.length;
  return (
    <span className="inline-flex items-center" title={members.map((m) => m.name).join(", ")}>
      {shown.map((m, i) => (
        <span key={m.userId} className={i === 0 ? "inline-flex" : "-ml-2 inline-flex"}>
          <Avatar
            name={m.name}
            color={m.avatarColor}
            src={m.avatarUrl}
            size={size}
            className="ring-2 ring-bg"
          />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="-ml-2 inline-flex items-center justify-center rounded-full bg-hover text-[11px] font-semibold text-muted-foreground ring-2 ring-bg"
          style={{ width: size, height: size }}
          aria-hidden="true"
        >
          +{extra}
        </span>
      )}
      <span className="sr-only">Üyeler: {members.map((m) => m.name).join(", ")}</span>
    </span>
  );
}

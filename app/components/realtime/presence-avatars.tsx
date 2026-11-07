import { cn } from "cn";
import { Avatar } from "~/components/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { presenceLabel, stackPeers } from "~/domain/realtime/live-ui";
import type { Peer } from "~/domain/realtime/presence";

type PresenceAvatarsProps = {
  /** Notu açık tutan diğer kişiler (kendin hariç; `live.peers`). */
  peers: readonly Peer[];
  /** En çok kaç avatar (fazlası "+n"). */
  max?: number;
  size?: number;
  className?: string;
};

/**
 * Not köşesindeki varlık göstergesi (PLAN §5): notu açık tutan diğer kişilerin üst üste
 * binen avatarları (proje üye yığınıyla aynı dil: 2 px zemin halkası, -8 px bindirme),
 * fazlası "+n". Odaklanınca / üzerine gelince ipucunda adlar. Kimse yoksa çizilmez.
 */
export function PresenceAvatars({ peers, max = 3, size = 28, className }: PresenceAvatarsProps) {
  if (peers.length === 0) return null;
  const { shown, extra } = stackPeers(peers, max);
  const label = presenceLabel(peers);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid="varlik"
          data-kisi={peers.length}
          className={cn(
            "presence-stack inline-flex shrink-0 cursor-default items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            className,
          )}
        >
          <span className="sr-only">{label}</span>
          {shown.map((p, i) => (
            <span
              key={p.userId}
              className={cn("presence-avatar inline-flex rounded-full", i > 0 && "-ml-2")}
              data-kisi-id={p.userId}
            >
              <Avatar
                name={p.name}
                color={p.color}
                src={p.avatarUrl}
                size={size}
                className="ring-2 ring-[var(--presence-ring,var(--surface))]"
              />
            </span>
          ))}
          {extra > 0 && (
            <span
              className="presence-avatar -ml-2 inline-flex items-center justify-center rounded-full bg-hover text-[11px] font-semibold text-fg ring-2 ring-[var(--presence-ring,var(--surface))]"
              style={{ width: size, height: size }}
              aria-hidden="true"
            >
              +{extra}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        <span className="flex flex-col gap-1 py-0.5">
          <span className="font-semibold">Şu an bu notta</span>
          {peers.map((p) => (
            <span key={p.userId} className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: p.color }}
                aria-hidden="true"
              />
              {p.name}
            </span>
          ))}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

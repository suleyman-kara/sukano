import { cn } from "cn";

type LogoMarkProps = {
  size?: number;
  className?: string;
  /** Erişilebilir ad; verilmezse işaret dekoratif sayılır. */
  title?: string;
};

/**
 * Sukano işareti: 2×2 yuvarlatılmış kare ızgara; sol üst ve sağ alt tam renk,
 * diğer ikisi %35. Renk `currentColor` (varsayılan vurgu yeşili).
 */
export function LogoMark({ size = 28, className, title }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={cn("shrink-0 text-primary", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect x="2" y="2" width="9" height="9" rx="2.5" />
      <rect x="13" y="2" width="9" height="9" rx="2.5" opacity=".35" />
      <rect x="2" y="13" width="9" height="9" rx="2.5" opacity=".35" />
      <rect x="13" y="13" width="9" height="9" rx="2.5" />
    </svg>
  );
}

type LogoProps = {
  /** İşaret boyutu (px). Kelime işareti orantılı büyür. */
  size?: number;
  /** Kelime işareti yazı boyutu (px); varsayılan işaretin ~%65'i. */
  wordmarkSize?: number;
  className?: string;
  wordmarkClassName?: string;
};

/** İşaret + küçük harf "sukano" kelime işareti (700, -0.01em). */
export function Logo({ size = 28, wordmarkSize, className, wordmarkClassName }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-foreground", className)}>
      <LogoMark size={size} />
      <span
        className={cn("leading-none font-bold tracking-[-0.01em]", wordmarkClassName)}
        style={{ fontSize: wordmarkSize ?? Math.round(size * 0.65) }}
      >
        sukano
      </span>
    </span>
  );
}

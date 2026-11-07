import { cn } from "cn";

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toLocaleUpperCase("tr-TR");
}

type AvatarProps = {
  name: string;
  color: string;
  src?: string | null;
  size?: number;
  className?: string;
};

/** Baş harfli yuvarlak avatar (beyaz metin). */
export function Avatar({ name, color, src, size = 34, className }: AvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white",
        className,
      )}
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.38) }}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : initialsOf(name)}
    </span>
  );
}

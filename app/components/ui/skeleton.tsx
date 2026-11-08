import { cn } from "cn";

/**
 * İskelet yükleme (MicroMotion 6): durağan gri satırlar + ışıltı bandı (1,6 sn + 0,8 sn
 * ara, yalnızca transform). 300 ms'den kısa yüklemede hiç görünmez (`.skeleton-late`);
 * azaltılmış harekette ışıltı yoktur. Ekran okuyucu "Yükleniyor…" duyar.
 */
export function Skeleton({
  lines = 3,
  className,
  label = "Yükleniyor…",
}: {
  lines?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("skeleton-late flex flex-col gap-2.5 py-3", className)} data-iskelet="">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="skeleton block h-3.5"
          style={{ width: `${[92, 74, 58, 84, 66][i % 5]}%` }}
        />
      ))}
    </div>
  );
}

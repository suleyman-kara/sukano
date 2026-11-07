import { cn } from "cn";
import { LogoMark } from "~/components/logo";

/**
 * Giriş ekranı arka planı: A "Yükselen ızgara" (PLAN §10 Hareket).
 * Logo işaretleri yavaşça yükselip alçalır; yalnızca transform ve opacity
 * canlandırılır (app/app.css `.rising-grid-mark`). `prefers-reduced-motion`
 * ve <html data-motion="reduced"> durumunda hareket durur.
 * Konumlar docs/design/Auth.dc.html (masaüstü paneli ~690×900) ve
 * TAuth.dc.html'den yüzdeye çevrildi; genlik üretim değeri (18–30 px).
 */
const MARKS = [
  { left: "61%", top: "-4.5%", size: 300, dur: "12s", delay: "-4s", amp: "-26px" },
  { left: "-13%", top: "70%", size: 340, dur: "14s", delay: "-9s", amp: "-30px" },
  { left: "69%", top: "63%", size: 200, dur: "9s", delay: "-2s", amp: "-18px" },
  { left: "7%", top: "16%", size: 170, dur: "11s", delay: "-6.5s", amp: "-22px" },
] as const;

export function RisingGrid({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden text-primary", className)}
    >
      {MARKS.map((m, i) => (
        <span
          key={i}
          className="rising-grid-mark"
          style={
            {
              left: m.left,
              top: m.top,
              width: m.size,
              height: m.size,
              "--rg-dur": m.dur,
              "--rg-delay": m.delay,
              "--rg-amp": m.amp,
            } as React.CSSProperties
          }
        >
          <LogoMark size={m.size} className="block size-full text-current" />
        </span>
      ))}
    </div>
  );
}

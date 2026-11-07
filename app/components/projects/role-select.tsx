import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { PROJECT_ROLES, type ProjectRole } from "~/db/schema";
import { roleLabel } from "~/domain/projects/permissions";

/** Rol seçici (yerel `<select>`: klavye ve ekran okuyucuda doğal davranış). */
export function RoleSelect({
  value,
  onChange,
  id,
  name,
  label,
  disabled,
  className,
  variant = "boxed",
  tall = false,
}: {
  value: ProjectRole;
  onChange: (role: ProjectRole) => void;
  id?: string;
  name?: string;
  /** Görünür etiket yoksa erişilebilir ad. */
  label?: string;
  disabled?: boolean;
  className?: string;
  /** "boxed": çerçeveli (masaüstü); "plain": mobil üye satırındaki yalın görünüm. */
  variant?: "boxed" | "plain";
  /** Masaüstünde 40 px (form alanlarıyla aynı hiza); varsayılan 34 px. */
  tall?: boolean;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <select
        id={id}
        name={name}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.value as ProjectRole)}
        className={cn(
          "h-11 w-full cursor-pointer appearance-none rounded-[10px] bg-surface pr-9 pl-3 text-[15px] text-fg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-60 md:text-sm",
          tall ? "md:h-10" : "md:h-[34px]",
          variant === "boxed"
            ? "border border-line"
            : "border border-transparent max-md:[field-sizing:content] max-md:pr-7 max-md:pl-1 md:border-line",
        )}
      >
        {PROJECT_ROLES.map((r) => (
          <option key={r} value={r}>
            {roleLabel(r)}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground max-md:right-2"
        aria-hidden="true"
      />
    </span>
  );
}

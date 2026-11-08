import { cn } from "cn";
import type { ProjectColor, ProjectRole } from "~/db/schema";
import { roleLabel } from "~/domain/projects/permissions";

/** Proje renkleri (PLAN §10: 7 koyu ton) ve erişilebilir adları. */
export const PROJECT_COLOR_OPTIONS: { value: ProjectColor; label: string }[] = [
  { value: "turuncu", label: "Kiremit" },
  { value: "mavi", label: "Mavi" },
  { value: "yesil", label: "Yeşil" },
  { value: "pembe", label: "Gül" },
  { value: "mor", label: "Mor" },
  { value: "sari", label: "Hardal" },
  { value: "grimavi", label: "Arduvaz" },
];

export const projectColorVar = (color: ProjectColor) => `var(--p-${color})`;

/** Proje simgesi: emoji varsa emoji, yoksa renkli nokta. */
export function ProjectMark({
  color,
  emoji,
  size = "md",
  className,
}: {
  color: ProjectColor;
  emoji?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  if (emoji) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center leading-none",
          size === "lg" ? "text-[22px]" : size === "md" ? "text-base" : "text-sm",
          className,
        )}
        aria-hidden="true"
      >
        {emoji}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full",
        size === "lg" ? "size-3.5" : size === "md" ? "size-2.5" : "size-2",
        className,
      )}
      style={{ background: projectColorVar(color) }}
      aria-hidden="true"
    />
  );
}

/** Rol çipi ("Yönetici", "Görüntüleyici"; görüntüleyicide kilit simgesiyle). */
export function RoleChip({
  role,
  className,
  children,
}: {
  role: ProjectRole;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        role === "goruntuleyici"
          ? "bg-hover text-muted-foreground"
          : "bg-primary-soft text-primary",
        className,
      )}
    >
      {children}
      {roleLabel(role)}
    </span>
  );
}

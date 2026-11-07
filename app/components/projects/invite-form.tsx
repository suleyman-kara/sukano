import { Info, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { FieldError } from "~/components/auth/fields";
import { Button } from "~/components/ui/button";
import type { ProjectRole } from "~/db/schema";
import type { RuleCode } from "~/domain/projects/permissions";
import { FIELD_INPUT, FIELD_LABEL } from "./dialog-styles";
import { RoleSelect } from "./role-select";
import { projectAction, useProjectAction } from "./use-project-action";

/** Hata türüne göre gösterim (Forms → Davet formu: hata ve uyarılar). */
export function inviteErrorTone(code: RuleCode | undefined): "field" | "warn" | "info" {
  if (code === "dogrulanmamis") return "warn";
  if (code === "zaten_uye" || code === "bekleyen_davet") return "info";
  return "field";
}

/**
 * Davet formu: tam e-posta adresi + rol. Hesap yok / geçersiz adres alanın altında
 * kırmızı; doğrulanmamış hesap sarı uyarı; zaten üye ve bekleyen davet gri bilgi.
 */
export function InviteForm({
  projectId,
  onSent,
  idPrefix = "davet",
}: {
  projectId: string;
  onSent?: (email: string) => void;
  idPrefix?: string;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("duzenleyici");
  const [sentTo, setSentTo] = useState("");
  const [dismissed, setDismissed] = useState(true);
  const { submit, busy, error } = useProjectAction(projectAction(projectId), {
    toastErrors: false,
    key: `davet-${projectId}`,
    onSuccess: () => {
      toast.success(`Davet gönderildi · ${sentTo}`);
      setEmail("");
      onSent?.(sentTo);
    },
  });

  const shown = dismissed ? undefined : error;
  const tone = inviteErrorTone(shown?.code);
  const errorId = `${idPrefix}-eposta-hata`;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    setSentTo(value);
    setDismissed(false);
    void submit({ intent: "invite", email: value, role });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-eposta`} className={FIELD_LABEL}>
            E-posta
          </label>
          <input
            id={`${idPrefix}-eposta`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="ad@ornek.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setDismissed(true);
            }}
            aria-invalid={shown && tone === "field" ? true : undefined}
            aria-describedby={shown ? errorId : undefined}
            className={FIELD_INPUT}
          />
        </div>
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5 md:w-[132px] md:flex-none">
            <label htmlFor={`${idPrefix}-rol`} className={FIELD_LABEL}>
              Rol
            </label>
            <RoleSelect id={`${idPrefix}-rol`} name="role" value={role} onChange={setRole} tall />
          </div>
          <Button
            type="submit"
            disabled={busy || !email.trim()}
            className="self-end max-md:h-11 md:h-10"
          >
            Davet gönder
          </Button>
        </div>
      </div>
      <div aria-live="polite" className="empty:hidden">
        {shown &&
          (tone === "field" ? (
            <FieldError id={errorId}>{shown.error}</FieldError>
          ) : (
            <p
              id={errorId}
              className={cn(
                "m-0 flex items-start gap-2.5 rounded-[10px] px-3 py-2.5 text-[13px]",
                tone === "warn" ? "bg-warn-soft text-warn" : "bg-hover text-muted-foreground",
              )}
            >
              {tone === "warn" ? (
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              ) : (
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              )}
              <span>{shown.error}</span>
            </p>
          ))}
      </div>
    </form>
  );
}

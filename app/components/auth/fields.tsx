import { CircleAlert, CircleCheck, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useId, useState } from "react";
import { useNavigation } from "react-router";
import { cn } from "cn";
import { Button } from "~/components/ui/button";

/** Tasarımdaki ölçüler: mobil 48, tablet 44, masaüstü 40 px yükseklik. */
export const AUTH_INPUT =
  "h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 aria-invalid:border-danger md:h-11 md:rounded-[10px] md:text-sm lg:h-10";

export const AUTH_BUTTON =
  "h-12 w-full rounded-xl text-base md:h-11 md:rounded-[10px] md:text-sm lg:h-[38px]";

export function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <span id={id} className="flex items-start gap-2 text-[13px] text-danger">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

type TextFieldProps = Omit<React.ComponentProps<"input">, "id"> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  /** Etiketin sağındaki ek (ör. "Şifremi unuttum" bağlantısı). */
  labelAside?: React.ReactNode;
  id?: string;
};

export function TextField({
  label,
  name,
  error,
  hint,
  labelAside,
  id,
  className,
  ...props
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? `${name}-${autoId}`;
  const errorId = `${inputId}-hata`;
  const hintId = `${inputId}-ipucu`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-[13px] font-medium">
          {label}
        </label>
        {labelAside}
      </div>
      <input
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(AUTH_INPUT, className)}
        {...props}
      />
      {hint && (
        <span id={hintId} className="text-[13px] text-muted-foreground">
          {hint}
        </span>
      )}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

/** Şifre alanı: göster/gizle düğmesiyle. */
export function PasswordField({
  label,
  name,
  error,
  hint,
  labelAside,
  id,
  className,
  ...props
}: TextFieldProps) {
  const [visible, setVisible] = useState(false);
  const autoId = useId();
  const inputId = id ?? `${name}-${autoId}`;
  const errorId = `${inputId}-hata`;
  const hintId = `${inputId}-ipucu`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-[13px] font-medium">
          {label}
        </label>
        {labelAside}
      </div>
      <div className="relative">
        <input
          id={inputId}
          name={name}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(AUTH_INPUT, "pr-12", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Şifreyi gizle" : "Şifreyi göster"}
          aria-pressed={visible}
          aria-controls={inputId}
          className="absolute top-1/2 right-1 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-primary/40 lg:size-8"
        >
          {visible ? (
            <EyeOff className="size-[18px]" aria-hidden="true" />
          ) : (
            <Eye className="size-[18px]" aria-hidden="true" />
          )}
        </button>
      </div>
      {hint && (
        <span id={hintId} className="text-[13px] text-muted-foreground">
          {hint}
        </span>
      )}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

/** Form düzeyinde hata ya da bilgi kutusu. */
export function FormMessage({
  tone = "error",
  children,
}: {
  tone?: "error" | "success" | "info";
  children?: React.ReactNode;
}) {
  if (!children) return null;
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[13px] leading-normal",
        tone === "error" && "bg-danger-soft text-danger",
        tone === "success" && "bg-primary-soft text-primary",
        tone === "info" && "bg-hover text-muted-foreground",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

/** Gönderim sırasında dönen simgeyle birincil düğme. */
export function SubmitButton({
  children,
  pendingText,
  intent,
  className,
  disabled,
}: {
  children: React.ReactNode;
  pendingText?: string;
  intent?: string;
  className?: string;
  disabled?: boolean;
}) {
  const navigation = useNavigation();
  const pending =
    navigation.state === "submitting" &&
    (intent === undefined || navigation.formData?.get("intent") === intent);
  return (
    <Button
      type="submit"
      name={intent ? "intent" : undefined}
      value={intent}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={cn(AUTH_BUTTON, className)}
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

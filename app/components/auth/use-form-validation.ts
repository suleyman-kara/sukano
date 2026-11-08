import { useState } from "react";
import { useNavigation, useSubmit } from "react-router";
import { TURNSTILE_FIELD } from "./turnstile";

type Errors = Partial<Record<string, string>>;
type Validation = { ok: true } | { ok: false; errors: Errors };

/**
 * İstemci tarafı doğrulama: gönderimden önce sunucuyla aynı kuralı çalıştırır,
 * hatada gönderimi durdurup ilk hatalı alana odaklanır. Sunucu hataları
 * (`serverErrors`) yeni bir istemci hatası yoksa gösterilir.
 *
 * `waitForTurnstile`: Turnstile jetonu henüz gelmediyse en çok 6 sn bekleyip
 * sonra gönderir (jeton yine boşsa sunucu Türkçe hata döner).
 */
export function useFormValidation(
  validate: (form: FormData) => Validation,
  serverErrors: Errors | undefined,
  { waitForTurnstile = false } = {},
) {
  const [clientErrors, setClientErrors] = useState<Errors | null>(null);
  const navigation = useNavigation();
  const submit = useSubmit();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(form, submitter);
    const result = validate(data);
    if (!result.ok) {
      event.preventDefault();
      setClientErrors(result.errors);
      const first = Object.keys(result.errors)[0];
      const input = first ? form.querySelector<HTMLElement>(`[name="${first}"]`) : null;
      input?.focus();
      return;
    }
    setClientErrors({});

    if (waitForTurnstile && !data.get(TURNSTILE_FIELD) && window.turnstile) {
      event.preventDefault();
      const started = Date.now();
      const timer = window.setInterval(() => {
        const token = new FormData(form).get(TURNSTILE_FIELD);
        if (token || Date.now() - started > 6000) {
          window.clearInterval(timer);
          void submit(new FormData(form, submitter), {
            method: "post",
            action: form.getAttribute("action") ?? undefined,
            replace: true,
          });
        }
      }, 200);
    }
  };

  const submitting = navigation.state === "submitting";
  const errors: Errors =
    clientErrors && Object.keys(clientErrors).length
      ? clientErrors
      : submitting
        ? {}
        : (serverErrors ?? {});

  return { errors, onSubmit };
}

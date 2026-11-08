import { useEffect, useRef } from "react";
import { Form } from "react-router";
import { validateRegisterForm } from "~/domain/auth/forms";
import { MIN_PASSWORD_LENGTH } from "~/domain/auth/rules";
import { AuthTabs, OrDivider } from "./auth-layout";
import { FormMessage, PasswordField, SubmitButton, TextField } from "./fields";
import { GoogleButton } from "./google-button";
import { Turnstile, TurnstileNotice, type TurnstileHandle } from "./turnstile";
import { useFormValidation } from "./use-form-validation";

export type RegisterActionData = {
  errors?: Partial<Record<"name" | "email" | "password", string>>;
  formError?: string;
  values?: { name: string; email: string };
};

type RegisterFormProps = {
  googleEnabled: boolean;
  turnstileSiteKey: string;
  next: string;
  actionData?: RegisterActionData;
};

/** Kayıt formu (tasarım: Auth "Kayıt ol", MRegister). */
export function RegisterForm({
  googleEnabled,
  turnstileSiteKey,
  next,
  actionData,
}: RegisterFormProps) {
  const turnstile = useRef<TurnstileHandle>(null);
  const { errors, onSubmit } = useFormValidation(
    (data) =>
      validateRegisterForm({
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        password: String(data.get("password") ?? ""),
      }),
    actionData?.errors,
    { waitForTurnstile: true },
  );

  // Turnstile jetonları tek kullanımlıktır: sunucu hata döndürünce yenile.
  useEffect(() => {
    if (actionData) turnstile.current?.reset();
  }, [actionData]);

  return (
    <div className="flex flex-1 flex-col gap-[18px] md:gap-5">
      <h1 className="sr-only">Kayıt ol</h1>
      <AuthTabs current="kayit" next={next} />

      {googleEnabled && (
        <>
          <GoogleButton label="Google ile kayıt ol" next={next} />
          <OrDivider />
        </>
      )}

      <Form method="post" noValidate onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <FormMessage>{actionData?.formError}</FormMessage>
        <input type="hidden" name="next" value={next} />
        <TextField
          label="Ad Soyad"
          name="name"
          id="ad"
          autoComplete="name"
          defaultValue={actionData?.values?.name}
          error={errors.name}
          required
        />
        <TextField
          label="E-posta"
          name="email"
          id="eposta"
          type="email"
          autoComplete="email"
          inputMode="email"
          defaultValue={actionData?.values?.email}
          error={errors.email}
          required
        />
        <PasswordField
          label="Şifre"
          name="password"
          id="sifre"
          autoComplete="new-password"
          hint={`En az ${MIN_PASSWORD_LENGTH} karakter.`}
          error={errors.password}
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        <Turnstile siteKey={turnstileSiteKey} ref={turnstile} />
        <SubmitButton pendingText="Hesap açılıyor…">Kayıt ol</SubmitButton>
        <TurnstileNotice />
      </Form>

      <p className="m-0 text-center text-[13px] text-muted-foreground">
        Kayıt olarak kullanım koşullarını kabul etmiş olursun.
      </p>
    </div>
  );
}

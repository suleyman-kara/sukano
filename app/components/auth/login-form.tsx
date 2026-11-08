import { Form, Link } from "react-router";
import { validateLoginForm } from "~/domain/auth/forms";
import { AuthTabs, OrDivider } from "./auth-layout";
import { FormMessage, PasswordField, SubmitButton, TextField } from "./fields";
import { GoogleButton } from "./google-button";
import { useFormValidation } from "./use-form-validation";

export type LoginActionData = {
  errors?: Partial<Record<"email" | "password", string>>;
  formError?: string;
  email?: string;
};

type LoginFormProps = {
  googleEnabled: boolean;
  next: string;
  actionData?: LoginActionData;
  /** Bilgi kutusu (ör. "Şifren güncellendi", Google hatası). */
  notice?: { tone: "error" | "success" | "info"; text: string } | null;
};

/** Giriş formu (tasarım: Auth/TAuth/MAuth "Giriş yap"). */
export function LoginForm({ googleEnabled, next, actionData, notice }: LoginFormProps) {
  const { errors, onSubmit } = useFormValidation(
    (data) =>
      validateLoginForm({
        email: String(data.get("email") ?? ""),
        password: String(data.get("password") ?? ""),
      }),
    actionData?.errors,
  );
  const nextQuery = next !== "/" ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="mb-1 md:mb-0 lg:sr-only">
        <h1 className="m-0 mb-1.5 text-[26px] font-bold tracking-[-0.02em]">Tekrar hoş geldin</h1>
        <p className="m-0 text-muted-foreground">Notların ve projelerin seni bekliyor.</p>
      </div>

      <AuthTabs current="giris" next={next} />

      {notice && <FormMessage tone={notice.tone}>{notice.text}</FormMessage>}

      {googleEnabled && (
        <>
          <GoogleButton label="Google ile devam et" next={next} />
          <OrDivider />
        </>
      )}

      <Form method="post" noValidate onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <FormMessage>{actionData?.formError}</FormMessage>
        <input type="hidden" name="next" value={next} />
        <TextField
          label="E-posta"
          name="email"
          id="eposta"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="ad@ornek.com"
          defaultValue={actionData?.email}
          error={errors.email}
          required
        />
        <PasswordField
          label="Şifre"
          name="password"
          id="sifre"
          autoComplete="current-password"
          error={errors.password}
          required
          labelAside={
            <Link
              to={`/sifremi-unuttum${nextQuery}`}
              className="-my-3 inline-flex min-h-11 items-center text-[13px] font-medium text-primary underline underline-offset-[3px] lg:my-0 lg:min-h-0"
            >
              Şifremi unuttum
            </Link>
          }
        />
        <SubmitButton intent="email" pendingText="Giriş yapılıyor…">
          Giriş yap
        </SubmitButton>
      </Form>

      <div className="flex-1 md:hidden" />
      <p className="m-0 text-center text-[13px] text-muted-foreground">
        Hesabın yok mu?{" "}
        <Link
          to={`/kayit${nextQuery}`}
          className="font-medium text-primary underline underline-offset-[3px]"
        >
          Kayıt ol
        </Link>
      </p>
    </div>
  );
}

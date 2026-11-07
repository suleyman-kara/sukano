import { CircleAlert } from "lucide-react";
import { data, Form, Link, redirect } from "react-router";
import { AuthHeading, BackToLogin } from "~/components/auth/auth-layout";
import { FormMessage, PasswordField, SubmitButton } from "~/components/auth/fields";
import { useFormValidation } from "~/components/auth/use-form-validation";
import { validateResetForm } from "~/domain/auth/forms";
import { MIN_PASSWORD_LENGTH } from "~/domain/auth/rules";
import { authFrom, callAuth, field, redirectWithCookies } from "~/lib/auth-api.server";
import type { Route } from "./+types/sifre-sifirla";

export const meta: Route.MetaFunction = () => [{ title: "Yeni şifre belirle · Sukano" }];

type ActionData = {
  errors?: { password?: string; confirm?: string };
  formError?: string;
};

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return { token: url.searchParams.get("token") ?? "" };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { auth } = authFrom(context);
  const form = await request.formData();
  const token = field(form, "token");
  const parsed = validateResetForm({
    password: field(form, "password"),
    confirm: field(form, "confirm"),
  });
  if (!parsed.ok) return data<ActionData>({ errors: parsed.errors }, { status: 400 });

  // Sıfırlamadan sonra yeni şifreyle oturum açmak için jetonun sahibi bulunur.
  const ctx = await auth.$context;
  const record = token
    ? await ctx.internalAdapter.findVerificationValue(`reset-password:${token}`)
    : null;
  const owner =
    record && record.expiresAt > new Date()
      ? await ctx.internalAdapter.findUserById(record.value)
      : null;
  if (!owner) {
    return data<ActionData>(
      { formError: "Bağlantı geçersiz ya da süresi dolmuş. Yeni bir sıfırlama bağlantısı iste." },
      { status: 400 },
    );
  }

  const reset = await callAuth(() =>
    auth.api.resetPassword({
      body: { newPassword: parsed.value.password, token },
      headers: request.headers,
      returnHeaders: true,
    }),
  );
  if (!reset.ok) return data<ActionData>({ formError: reset.message }, { status: 400 });

  const signIn = await callAuth(() =>
    auth.api.signInEmail({
      body: { email: owner.email, password: parsed.value.password, rememberMe: true },
      headers: request.headers,
      returnHeaders: true,
    }),
  );
  if (!signIn.ok) return redirect("/giris?durum=sifre-guncellendi");
  return redirectWithCookies("/", signIn.headers);
}

export default function SifreSifirla({ loaderData, actionData }: Route.ComponentProps) {
  const { errors, onSubmit } = useFormValidation(
    (form) =>
      validateResetForm({
        password: String(form.get("password") ?? ""),
        confirm: String(form.get("confirm") ?? ""),
      }),
    actionData?.errors,
  );

  if (!loaderData.token) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-[18px] pb-10 md:pb-0 lg:gap-5">
        <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
          <CircleAlert className="size-7" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <AuthHeading title="Bağlantı geçersiz">
          Bu sayfaya e-postadaki sıfırlama bağlantısıyla gelmelisin.{" "}
          <Link
            to="/sifremi-unuttum"
            className="font-medium text-primary underline underline-offset-[3px]"
          >
            Yeni bağlantı iste
          </Link>
        </AuthHeading>
        <BackToLogin />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      <AuthHeading title="Yeni şifre belirle">
        E-postandaki bağlantıdan geldin. Yeni şifreni iki kez yaz.
      </AuthHeading>
      <Form method="post" noValidate onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <FormMessage>
          {actionData?.formError && (
            <>
              {actionData.formError}{" "}
              <Link to="/sifremi-unuttum" className="font-medium underline underline-offset-[3px]">
                Yeni bağlantı iste
              </Link>
            </>
          )}
        </FormMessage>
        <input type="hidden" name="token" value={loaderData.token} />
        <PasswordField
          label="Yeni şifre"
          name="password"
          id="yeni-sifre"
          autoComplete="new-password"
          hint={`En az ${MIN_PASSWORD_LENGTH} karakter.`}
          error={errors.password}
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        <PasswordField
          label="Yeni şifre (tekrar)"
          name="confirm"
          id="yeni-sifre-tekrar"
          autoComplete="new-password"
          error={errors.confirm}
          required
        />
        <SubmitButton pendingText="Kaydediliyor…">Şifreyi kaydet ve giriş yap</SubmitButton>
      </Form>
      <BackToLogin />
    </div>
  );
}

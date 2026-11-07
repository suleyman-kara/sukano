import { and, eq } from "drizzle-orm";
import { useEffect, useRef } from "react";
import { data, Form, useFetcher } from "react-router";
import { toast } from "sonner";
import { cn } from "cn";
import { Avatar } from "~/components/avatar";
import { FieldError } from "~/components/auth/fields";
import {
  ChangeEmailDialog,
  ChangePasswordDialog,
  type SettingsActionData,
} from "~/components/settings/account-dialogs";
import { BlockerLinks, DeleteAccountDialog } from "~/components/settings/delete-account-dialog";
import { AppShell } from "~/components/shell/app-shell";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { createDb } from "~/db/client";
import { account, THEMES, userPreferences, type Theme } from "~/db/schema";
import { relativeAgo, sessionSummary } from "~/domain/auth/format";
import {
  validateChangeEmailForm,
  validateChangePasswordForm,
  validateNameForm,
  validateResetForm,
} from "~/domain/auth/forms";
import { accountDeletionBlockers, deleteAccount } from "~/lib/account.server";
import {
  assertSameOrigin,
  authFrom,
  callAuth,
  cookieHeaders,
  field,
  redirectWithCookies,
} from "~/lib/auth-api.server";
import { ProjectRuleError } from "~/lib/project-access.server";
import { requireUser } from "~/lib/session.server";
import { avatarColorFor } from "~/lib/shell.server";
import { useShellData } from "~/lib/shell";
import { setThemePreference, useTheme, type ThemePreference } from "~/lib/theme";
import type { Route } from "./+types/ayarlar";

export const meta: Route.MetaFunction = () => [{ title: "Ayarlar · Sukano" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireUser(request, context);
  const { env, auth } = authFrom(context);
  const db = createDb(env.DB);
  const [accounts, sessions, prefs, credential, deletionBlockers] = await Promise.all([
    auth.api.listUserAccounts({ headers: request.headers }),
    auth.api.listSessions({ headers: request.headers }),
    db
      .select({ theme: userPreferences.theme })
      .from(userPreferences)
      .where(eq(userPreferences.userId, user.id))
      .get(),
    db
      .select({ updatedAt: account.updatedAt })
      .from(account)
      .where(and(eq(account.userId, user.id), eq(account.providerId, "credential")))
      .get(),
    accountDeletionBlockers(env, user.id),
  ]);
  const url = new URL(request.url);
  return {
    user: {
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image ?? null,
      avatarColor: user.avatarColor ?? avatarColorFor(user.id),
    },
    googleLinked: accounts.some((a) => a.providerId === "google"),
    hasPassword: Boolean(credential),
    passwordChangedAt: credential?.updatedAt?.toISOString() ?? null,
    sessionCount: sessions.length,
    theme: prefs?.theme ?? "system",
    emailChanged: url.searchParams.get("durum") === "eposta-degisti",
    /** Tek yönetici olunan projeler: doluysa hesap silinemez (önce devir ya da silme). */
    deletionBlockers,
  };
}

function result(
  intent: string,
  ok: boolean,
  extra: Partial<SettingsActionData> = {},
  init?: ResponseInit,
) {
  return data<SettingsActionData>({ intent, ok, ...extra }, init);
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { user } = await requireUser(request, context);
  const { env, auth } = authFrom(context);
  const form = await request.formData();
  const intent = field(form, "intent");
  const headers = request.headers;

  switch (intent) {
    case "profile": {
      const parsed = validateNameForm({ name: field(form, "name") });
      if (!parsed.ok) return result(intent, false, { errors: parsed.errors }, { status: 400 });
      await auth.api.updateUser({ body: { name: parsed.value.name }, headers });
      return result(intent, true, { message: "Profil kaydedildi." });
    }

    case "theme": {
      const theme = field(form, "theme") as Theme;
      if (!THEMES.includes(theme)) return result(intent, false, {}, { status: 400 });
      await createDb(env.DB)
        .insert(userPreferences)
        .values({ userId: user.id, theme })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: { theme, updatedAt: new Date() },
        });
      return result(intent, true);
    }

    case "email": {
      const parsed = validateChangeEmailForm(
        { email: field(form, "email"), password: field(form, "password") },
        user.email,
      );
      if (!parsed.ok) return result(intent, false, { errors: parsed.errors }, { status: 400 });
      const check = await callAuth(() =>
        auth.api.verifyPassword({
          body: { password: parsed.value.password },
          headers,
          returnHeaders: true,
        }),
      );
      if (!check.ok) {
        return result(
          intent,
          false,
          { errors: { password: "Şifre hatalı." } },
          { status: check.status === 429 ? 429 : 400 },
        );
      }
      const change = await callAuth(() =>
        auth.api.changeEmail({
          body: { newEmail: parsed.value.email, callbackURL: "/ayarlar" },
          headers,
          returnHeaders: true,
        }),
      );
      if (!change.ok) return result(intent, false, { message: change.message }, { status: 400 });
      return result(intent, true, { sentTo: parsed.value.email });
    }

    case "password": {
      const parsed = validateChangePasswordForm({
        current: field(form, "current"),
        password: field(form, "password"),
        confirm: field(form, "confirm"),
      });
      if (!parsed.ok) return result(intent, false, { errors: parsed.errors }, { status: 400 });
      const change = await callAuth(() =>
        auth.api.changePassword({
          body: {
            currentPassword: parsed.value.current,
            newPassword: parsed.value.password,
            revokeOtherSessions: field(form, "revokeOthers") !== "",
          },
          headers,
          returnHeaders: true,
        }),
      );
      if (!change.ok) {
        const errors =
          change.code === "INVALID_PASSWORD"
            ? { current: change.message }
            : change.code.startsWith("PASSWORD_")
              ? { password: change.message }
              : undefined;
        return result(intent, false, errors ? { errors } : { message: change.message }, {
          status: 400,
        });
      }
      // Diğer oturumlar kapatıldıysa bu cihazın oturum çerezi yenilenir.
      return result(
        intent,
        true,
        { message: "Şifren değiştirildi." },
        { headers: cookieHeaders(change.headers) },
      );
    }

    case "set-password": {
      const parsed = validateResetForm({
        password: field(form, "password"),
        confirm: field(form, "confirm"),
      });
      if (!parsed.ok) return result(intent, false, { errors: parsed.errors }, { status: 400 });
      const set = await callAuth(() =>
        auth.api.setPassword({
          body: { newPassword: parsed.value.password },
          headers,
          returnHeaders: true,
        }),
      );
      if (!set.ok) return result(intent, false, { message: set.message }, { status: 400 });
      return result(intent, true, { message: "Şifren belirlendi." });
    }

    case "delete-account": {
      // Önce oturumu kapat (çerezleri temizleyen başlıklar), sonra hesabı sil.
      try {
        await deleteAccount(env, user.id, field(form, "email"), { dryRun: true });
      } catch (error) {
        if (error instanceof ProjectRuleError)
          return result(
            intent,
            false,
            error.code === "eposta_uyusmuyor"
              ? { errors: { email: error.message } }
              : { message: error.message },
            { status: 409 },
          );
        throw error;
      }
      const signOut = await callAuth(() => auth.api.signOut({ headers, returnHeaders: true }));
      await deleteAccount(env, user.id, field(form, "email"));
      return redirectWithCookies(
        "/giris?durum=hesap-silindi",
        signOut.ok ? signOut.headers : undefined,
      );
    }

    case "revoke-others": {
      await auth.api.revokeOtherSessions({ headers });
      return result(intent, true, { message: "Diğer cihazlardaki oturumlar kapatıldı." });
    }

    default:
      return result(intent, false, {}, { status: 400 });
  }
}

const SECTIONS = [
  { id: "profil", label: "Profil" },
  { id: "gorunum", label: "Görünüm" },
  { id: "bildirim", label: "Bildirimler" },
  { id: "hesap", label: "Hesap ve güvenlik" },
  { id: "tehlike", label: "Hesabı sil" },
] as const;

const PANEL =
  "flex scroll-mt-24 flex-col gap-4 rounded-[14px] border border-line bg-surface px-4 py-5 md:px-6";
const ROW =
  "flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-3 first:border-t-0";
const OUTLINE = "border-line bg-surface hover:bg-hover";

function Row({
  title,
  detail,
  children,
}: {
  title: string;
  detail: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={ROW}>
      <span className="flex min-w-[180px] flex-1 flex-col">
        <b className="font-medium">{title}</b>
        <small className="text-[13px] text-muted-foreground">{detail}</small>
      </span>
      {children}
    </div>
  );
}

/** Sunucuya giden eylemlerin sonuçlarını toast olarak bildirir. */
function useResultToast(data: SettingsActionData | undefined) {
  const last = useRef<SettingsActionData | undefined>(undefined);
  useEffect(() => {
    if (!data || data === last.current) return;
    last.current = data;
    if (data.ok && data.message) toast.success(data.message);
  }, [data]);
}

const THEME_CARDS: { value: ThemePreference; label: string; preview: React.ReactNode }[] = [
  {
    value: "light",
    label: "Açık",
    preview: (
      <>
        <span className="w-[30%] border-r border-[#E4E2DC] bg-white" />
        <span className="flex flex-1 gap-1.5 p-2">
          <span className="h-7 w-6 rounded bg-[#FBF0BF]" />
          <span className="h-7 w-6 rounded border border-[#E4E2DC] bg-white" />
        </span>
      </>
    ),
  },
  {
    value: "dark",
    label: "Koyu",
    preview: (
      <>
        <span className="w-[30%] border-r border-[#2F2F2C] bg-[#1E1E1C]" />
        <span className="flex flex-1 gap-1.5 bg-[#141413] p-2">
          <span className="h-7 w-6 rounded bg-[#45401F]" />
          <span className="h-7 w-6 rounded border border-[#2F2F2C] bg-[#1E1E1C]" />
        </span>
      </>
    ),
  },
  {
    value: "system",
    label: "Sistem",
    preview: (
      <>
        <span className="w-[30%] border-r border-[#E4E2DC] bg-white" />
        <span className="flex flex-1 justify-end gap-1.5 bg-[linear-gradient(90deg,#F7F6F2_50%,#141413_50%)] p-2">
          <span className="h-7 w-6 rounded bg-[#45401F]" />
          <span className="h-7 w-6 rounded border border-[#2F2F2C] bg-[#1E1E1C]" />
        </span>
      </>
    ),
  },
];

function ThemePicker() {
  const { preference } = useTheme();
  const fetcher = useFetcher({ key: "ayarlar-theme" });
  const choose = (value: ThemePreference) => {
    setThemePreference(value);
    void fetcher.submit({ intent: "theme", theme: value }, { method: "post" });
  };
  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="grid grid-cols-3 gap-[3px] rounded-xl bg-hover p-[3px] md:gap-3 md:bg-transparent md:p-0"
    >
      {THEME_CARDS.map(({ value, label, preview }) => {
        const on = preference === value;
        return (
          <label
            key={value}
            className={cn(
              "flex cursor-pointer flex-col gap-2 rounded-[9px] md:rounded-xl md:border md:border-line md:p-3",
              on
                ? "bg-surface shadow-[0_1px_2px_rgba(0,0,0,.08)] md:border-primary md:bg-primary-soft md:shadow-none"
                : "text-muted-foreground md:text-fg",
            )}
          >
            <span
              className="hidden h-16 overflow-hidden rounded-lg border border-line bg-[#F7F6F2] md:flex"
              aria-hidden="true"
            >
              {preview}
            </span>
            <span className="flex min-h-10 items-center justify-center gap-2 font-medium md:min-h-7 md:justify-start">
              <input
                type="radio"
                name="tema"
                value={value}
                checked={on}
                onChange={() => choose(value)}
                className="sr-only md:not-sr-only md:accent-primary"
              />
              {label}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function ProfilePanel({
  name,
  avatarColor,
  image,
}: {
  name: string;
  avatarColor: string;
  image: string | null;
}) {
  const fetcher = useFetcher<SettingsActionData>({ key: "ayarlar-profile" });
  useResultToast(fetcher.data);
  const error = fetcher.data?.ok === false ? fetcher.data.errors?.name : undefined;
  return (
    <section id="profil" className={PANEL} aria-labelledby="profil-baslik">
      <h2 id="profil-baslik" className="m-0 text-base font-semibold">
        Profil
      </h2>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} color={avatarColor} src={image} size={64} />
        <div className="flex gap-2">
          <Button variant="outline" className={OUTLINE} disabled title="Yakında">
            Fotoğraf yükle
          </Button>
        </div>
      </div>
      <fetcher.Form method="post" className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="profile" />
        <div className="flex max-w-[360px] flex-col gap-1.5">
          <label htmlFor="ayar-ad" className="text-[13px] font-medium">
            Ad Soyad
          </label>
          <input
            id="ayar-ad"
            name="name"
            defaultValue={name}
            autoComplete="name"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "ayar-ad-hata" : undefined}
            className="h-11 w-full rounded-[10px] border border-line bg-surface px-3 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 aria-invalid:border-danger lg:h-10"
          />
          <FieldError id="ayar-ad-hata">{error}</FieldError>
        </div>
        <div>
          <Button type="submit" disabled={fetcher.state !== "idle"}>
            Kaydet
          </Button>
        </div>
      </fetcher.Form>
    </section>
  );
}

export default function Ayarlar({ loaderData }: Route.ComponentProps) {
  const shell = useShellData();
  const { user, googleLinked, hasPassword, passwordChangedAt, sessionCount, emailChanged } =
    loaderData;
  const passwordFetcher = useFetcher<SettingsActionData>({ key: "ayarlar-password" });
  const setPasswordFetcher = useFetcher<SettingsActionData>({ key: "ayarlar-set-password" });
  const revokeFetcher = useFetcher<SettingsActionData>({ key: "ayarlar-revoke" });
  useResultToast(passwordFetcher.data);
  useResultToast(setPasswordFetcher.data);
  useResultToast(revokeFetcher.data);

  useEffect(() => {
    if (emailChanged) toast.success("E-posta adresin güncellendi.");
  }, [emailChanged]);

  return (
    <AppShell {...shell}>
      <section className="flex w-full max-w-[1000px] flex-col gap-5 px-4 pt-2 pb-12 md:px-7 md:pt-3 lg:px-8">
        <h1 className="m-0 text-[22px] font-bold tracking-[-0.01em] md:text-2xl">Ayarlar</h1>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
          <nav
            aria-label="Ayar bölümleri"
            className="-mx-1 hidden gap-0.5 overflow-x-auto md:flex lg:sticky lg:top-4 lg:w-[200px] lg:flex-none lg:flex-col"
          >
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-lg px-3 py-2 font-medium whitespace-nowrap text-muted-foreground hover:bg-hover hover:text-fg"
              >
                {s.label}
              </a>
            ))}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <ProfilePanel name={user.name} avatarColor={user.avatarColor} image={user.image} />

            <section id="gorunum" className={PANEL} aria-labelledby="gorunum-baslik">
              <h2 id="gorunum-baslik" className="m-0 text-base font-semibold">
                Görünüm
              </h2>
              <ThemePicker />
            </section>

            <section id="bildirim" className={PANEL} aria-labelledby="bildirim-baslik">
              <h2
                id="bildirim-baslik"
                className="m-0 flex items-center gap-2 text-base font-semibold"
              >
                Bildirimler
                <span className="rounded-full bg-hover px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Yakında
                </span>
              </h2>
              <p className="m-0 text-muted-foreground">
                Tarayıcı ve e-posta bildirimleri hatırlatıcılarla birlikte gelecek.
              </p>
              <div>
                {[
                  ["Hatırlatıcılar", "Not ve görev hatırlatıcıları zamanı gelince"],
                  ["Göreve atanma", "Biri seni bir göreve atadığında"],
                  ["Davetler", "Bir projeye davet edildiğinde"],
                  ["Davet e-postası", "Davetleri ayrıca e-posta ile al"],
                ].map(([title, detail]) => (
                  <Row key={title} title={title!} detail={detail}>
                    <Switch disabled defaultChecked aria-label={`${title} bildirimleri`} />
                  </Row>
                ))}
              </div>
            </section>

            <section id="hesap" className={PANEL} aria-labelledby="hesap-baslik">
              <h2 id="hesap-baslik" className="m-0 text-base font-semibold">
                Hesap ve güvenlik
              </h2>
              <div>
                <Row
                  title="E-posta"
                  detail={`${user.email} · ${user.emailVerified ? "doğrulandı" : "doğrulanmadı"}`}
                >
                  <ChangeEmailDialog currentEmail={user.email} hasPassword={hasPassword} />
                </Row>
                <Row
                  title="Şifre"
                  detail={
                    hasPassword
                      ? passwordChangedAt
                        ? `En son ${relativeAgo(new Date(passwordChangedAt))} değiştirildi`
                        : "Şifre belirlenmiş"
                      : "Hesabında şifre yok; Google ile giriş yapıyorsun"
                  }
                >
                  <ChangePasswordDialog hasPassword={hasPassword} />
                </Row>
                <Row title="Google hesabı" detail={googleLinked ? "Bağlı" : "Bağlı değil"} />
                <Row title="Oturumlar" detail={sessionSummary(sessionCount)}>
                  <revokeFetcher.Form method="post">
                    <input type="hidden" name="intent" value="revoke-others" />
                    <Button
                      type="submit"
                      variant="outline"
                      className={OUTLINE}
                      disabled={sessionCount <= 1 || revokeFetcher.state !== "idle"}
                    >
                      Diğer cihazlardan çık
                    </Button>
                  </revokeFetcher.Form>
                </Row>
                <Row
                  title="Çıkış yap"
                  detail="Bu cihazdaki oturumu kapatır; hesap menüsünde de bulunur"
                >
                  <Form method="post" action="/cikis" reloadDocument>
                    <Button type="submit" variant="outline" className={OUTLINE}>
                      Çıkış yap
                    </Button>
                  </Form>
                </Row>
              </div>
            </section>

            <section
              id="tehlike"
              className={cn(PANEL, "border-danger-soft")}
              aria-labelledby="tehlike-baslik"
            >
              <h2 id="tehlike-baslik" className="m-0 text-base font-semibold">
                Hesabı sil
              </h2>
              <p className="m-0 text-muted-foreground">
                Kişisel notların silinir. Proje notları projede kalır ve adın &ldquo;silinmiş
                kullanıcı&rdquo; olarak görünür.{" "}
                {loaderData.deletionBlockers.length > 0 ? (
                  <>
                    Tek yönetici olduğun projeleri önce devretmen ya da silmen gerekir:{" "}
                    <BlockerLinks blockers={loaderData.deletionBlockers} />.
                  </>
                ) : (
                  "Tek yönetici olduğun projeleri önce devretmen ya da silmen gerekir."
                )}
              </p>
              <div>
                <DeleteAccountDialog email={user.email} blockers={loaderData.deletionBlockers} />
              </div>
            </section>
          </div>
        </div>
        <p className="m-0 text-center text-xs text-muted-foreground">Sukano · sürüm 1.0</p>
      </section>
    </AppShell>
  );
}

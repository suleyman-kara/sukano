import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import { FormMessage, PasswordField, TextField } from "~/components/auth/fields";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  validateChangeEmailForm,
  validateChangePasswordForm,
  validateResetForm,
} from "~/domain/auth/forms";
import { MIN_PASSWORD_LENGTH } from "~/domain/auth/rules";

/** Ayarlar action'ının yanıtı (bkz. `routes/ayarlar.tsx`). */
export type SettingsActionData = {
  intent: string;
  ok: boolean;
  message?: string;
  errors?: Partial<Record<string, string>>;
  sentTo?: string;
};

const DIALOG = "gap-4 rounded-[14px] p-6 sm:max-w-[440px]";
const FOOTER = "mx-0 mb-0 rounded-none border-0 bg-transparent p-0 pt-1";
const INPUT = "md:h-10 md:rounded-[10px] lg:h-10";

function useDialogFetcher(intent: string) {
  const fetcher = useFetcher<SettingsActionData>({ key: `ayarlar-${intent}` });
  const result = fetcher.data?.intent === intent ? fetcher.data : undefined;
  return { fetcher, result, busy: fetcher.state !== "idle" };
}

/** "Değiştir": e-posta değiştirme (tasarım: Forms → E-posta değiştirme). */
export function ChangeEmailDialog({
  currentEmail,
  hasPassword,
}: {
  currentEmail: string;
  hasPassword: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { fetcher, result, busy } = useDialogFetcher("email");
  const [clientErrors, setClientErrors] = useState<Partial<Record<string, string>>>({});
  const errors = Object.keys(clientErrors).length ? clientErrors : (result?.errors ?? {});
  const sent = result?.ok ? result.sentTo : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setClientErrors({});
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="border-line bg-surface hover:bg-hover">
          Değiştir
        </Button>
      </DialogTrigger>
      <DialogContent className={DIALOG}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">E-posta adresini değiştir</DialogTitle>
          <DialogDescription className="sr-only">
            Yeni adrese bir doğrulama bağlantısı gönderilir.
          </DialogDescription>
        </DialogHeader>
        {sent ? (
          <>
            <p role="status" className="m-0 flex items-start gap-2 text-[13px] text-primary">
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                <b className="font-semibold">{sent}</b> adresine doğrulama bağlantısı gönderildi.
                Bağlantıya tıklayana kadar eski adresin geçerli kalır.
              </span>
            </p>
            <DialogFooter className={FOOTER}>
              <Button onClick={() => setOpen(false)}>Tamam</Button>
            </DialogFooter>
          </>
        ) : !hasPassword ? (
          <p className="m-0 text-muted-foreground">
            Hesabında şifre yok. E-posta adresini değiştirmek için önce aşağıdan bir şifre belirle.
          </p>
        ) : (
          <fetcher.Form
            method="post"
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              const data = new FormData(event.currentTarget);
              const check = validateChangeEmailForm(
                {
                  email: String(data.get("email") ?? ""),
                  password: String(data.get("password") ?? ""),
                },
                currentEmail,
              );
              if (!check.ok) {
                event.preventDefault();
                setClientErrors(check.errors);
              } else setClientErrors({});
            }}
          >
            <input type="hidden" name="intent" value="email" />
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">Şu anki adres</span>
              <div className="flex h-10 items-center rounded-[10px] border border-line bg-hover px-3.5 text-muted-foreground">
                {currentEmail}
              </div>
            </div>
            <TextField
              label="Yeni e-posta"
              name="email"
              type="email"
              autoComplete="email"
              error={errors.email}
              className={INPUT}
            />
            <PasswordField
              label="Şifren"
              name="password"
              autoComplete="current-password"
              error={errors.password}
              className={INPUT}
            />
            <FormMessage>{result && !result.ok ? result.message : undefined}</FormMessage>
            <p className="m-0 text-[13px] text-muted-foreground">
              Yeni adrese bir doğrulama bağlantısı gönderilir. Bağlantıya tıklayana kadar eski
              adresin geçerli kalır.
            </p>
            <DialogFooter className={FOOTER}>
              <Button
                type="button"
                variant="outline"
                className="border-line bg-surface hover:bg-hover"
                onClick={() => setOpen(false)}
              >
                Vazgeç
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Gönderiliyor…" : "Doğrulama gönder"}
              </Button>
            </DialogFooter>
          </fetcher.Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** "Şifreyi değiştir" ya da Google ile açılmış hesapta "Şifre belirle". */
export function ChangePasswordDialog({ hasPassword }: { hasPassword: boolean }) {
  const intent = hasPassword ? "password" : "set-password";
  const [open, setOpen] = useState(false);
  const { fetcher, result, busy } = useDialogFetcher(intent);
  const [clientErrors, setClientErrors] = useState<Partial<Record<string, string>>>({});
  const errors = Object.keys(clientErrors).length ? clientErrors : (result?.errors ?? {});

  // Başarılı kayıttan sonra pencere kapanır; sonuç Ayarlar'da toast ile bildirilir.
  const [handled, setHandled] = useState(result);
  if (result !== handled) {
    setHandled(result);
    if (result?.ok) setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setClientErrors({});
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="border-line bg-surface hover:bg-hover">
          {hasPassword ? "Şifreyi değiştir" : "Şifre belirle"}
        </Button>
      </DialogTrigger>
      <DialogContent className={DIALOG}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {hasPassword ? "Şifreyi değiştir" : "Şifre belirle"}
          </DialogTitle>
          <DialogDescription className={hasPassword ? "sr-only" : "text-muted-foreground"}>
            {hasPassword
              ? "Mevcut şifreni ve yeni şifreni yaz."
              : "Hesabında şifre yok. Bir şifre belirlersen e-posta ve şifreyle de giriş yapabilirsin."}
          </DialogDescription>
        </DialogHeader>
        <fetcher.Form
          method="post"
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            const data = new FormData(event.currentTarget);
            const password = String(data.get("password") ?? "");
            const confirm = String(data.get("confirm") ?? "");
            const check = hasPassword
              ? validateChangePasswordForm({
                  current: String(data.get("current") ?? ""),
                  password,
                  confirm,
                })
              : validateResetForm({ password, confirm });
            if (!check.ok) {
              event.preventDefault();
              setClientErrors(check.errors);
            } else setClientErrors({});
          }}
        >
          <input type="hidden" name="intent" value={intent} />
          {hasPassword && (
            <PasswordField
              label="Mevcut şifre"
              name="current"
              autoComplete="current-password"
              error={errors.current}
              className={INPUT}
            />
          )}
          <PasswordField
            label="Yeni şifre"
            name="password"
            autoComplete="new-password"
            hint={`En az ${MIN_PASSWORD_LENGTH} karakter.`}
            error={errors.password}
            className={INPUT}
          />
          <PasswordField
            label="Yeni şifre (tekrar)"
            name="confirm"
            autoComplete="new-password"
            error={errors.confirm}
            className={INPUT}
          />
          {hasPassword && (
            <div className="flex items-center gap-2.5 text-sm">
              <Checkbox id="oturumlari-kapat" name="revokeOthers" value="1" defaultChecked />
              <label htmlFor="oturumlari-kapat">Diğer cihazlardaki oturumları kapat</label>
            </div>
          )}
          <FormMessage>{result && !result.ok ? result.message : undefined}</FormMessage>
          <DialogFooter className={FOOTER}>
            <Button
              type="button"
              variant="outline"
              className="border-line bg-surface hover:bg-hover"
              onClick={() => setOpen(false)}
            >
              Vazgeç
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Kaydediliyor…" : "Şifreyi kaydet"}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

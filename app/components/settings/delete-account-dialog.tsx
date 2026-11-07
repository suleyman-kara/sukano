import { TriangleAlert, UserX } from "lucide-react";
import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { FieldError } from "~/components/auth/fields";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import type { SettingsActionData } from "./account-dialogs";

export type DeletionBlocker = { id: string; name: string };

const normalize = (s: string) => s.trim().toLocaleLowerCase("tr-TR");

/** Tek yönetici olunan projeler: bağlantılı, virgülle ayrılmış. */
export function BlockerLinks({ blockers }: { blockers: DeletionBlocker[] }) {
  return (
    <>
      {blockers.map((b, i) => (
        <span key={b.id}>
          {i > 0 && ", "}
          <Link to={`/proje/${b.id}/ayarlar`} className="font-semibold text-fg underline">
            {b.name}
          </Link>
        </span>
      ))}
    </>
  );
}

/**
 * "Hesabın silinsin mi?" (Dialogs2 → Hesap silme). Onay için hesabın e-posta adresi
 * yazılır; tek yönetici olunan proje varsa silme engellidir ve projeler listelenir.
 */
export function DeleteAccountDialog({
  email,
  blockers,
}: {
  email: string;
  blockers: DeletionBlocker[];
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const fetcher = useFetcher<SettingsActionData>({ key: "ayarlar-delete-account" });
  const result = fetcher.data?.intent === "delete-account" ? fetcher.data : undefined;
  const busy = fetcher.state !== "idle";
  const blocked = blockers.length > 0;
  const matches = normalize(typed) === normalize(email) && typed.trim() !== "";
  const error = result && !result.ok ? (result.errors?.email ?? result.message) : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTyped("");
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="border-danger bg-surface text-danger hover:bg-danger-soft hover:text-danger"
        >
          Hesabımı sil
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-4 rounded-2xl border border-line bg-surface p-6 text-fg shadow-elevated ring-0 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-[20px] max-sm:rounded-b-none sm:max-w-[420px] [&>[data-slot=dialog-close]]:top-5 [&>[data-slot=dialog-close]]:right-5">
        <fetcher.Form method="post" action="/ayarlar" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="delete-account" />
          <div className="flex items-center gap-3 pr-8">
            <span
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger"
              aria-hidden="true"
            >
              <UserX className="size-5" />
            </span>
            <DialogTitle className="m-0 text-lg font-semibold">Hesabın silinsin mi?</DialogTitle>
          </div>
          <DialogDescription className="m-0 text-muted-foreground">
            Kişisel notların ekleri ve sürümleriyle silinir. Proje notları projelerde kalır; adın
            &ldquo;silinmiş kullanıcı&rdquo; olarak görünür. Bu işlem geri alınamaz.
          </DialogDescription>
          {blocked ? (
            <p
              role="alert"
              className="m-0 flex items-start gap-2.5 rounded-[10px] bg-warn-soft px-3 py-2.5 text-[13px] text-warn"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Tek yönetici olduğun projeler var: <BlockerLinks blockers={blockers} />. Önce başka
                bir üyeyi yönetici yap ya da projeyi sil.
              </span>
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="hesap-sil-eposta" className="text-[13px] font-medium">
                Onaylamak için e-posta adresini yaz
              </label>
              <input
                id="hesap-sil-eposta"
                name="email"
                type="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={email}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "hesap-sil-hata" : undefined}
                className="h-11 w-full rounded-[10px] border border-line bg-surface px-3 outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 aria-invalid:border-danger md:h-10"
              />
              <FieldError id="hesap-sil-hata">{error}</FieldError>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1 max-sm:[&>*]:h-12 max-sm:[&>*]:flex-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              disabled={blocked || !matches || busy}
              className="bg-danger text-white hover:bg-danger/90 dark:text-[#141413]"
            >
              Hesabımı sil
            </Button>
          </div>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { FieldError } from "~/components/auth/fields";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import type { ProjectColor } from "~/db/schema";
import {
  MAX_PROJECT_DESCRIPTION_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
} from "~/domain/projects/validation";
import { ProjectColorPicker } from "./color-picker";
import { DIALOG_FOOTER, FIELD_INPUT, FIELD_LABEL, SHEET_DIALOG } from "./dialog-styles";
import { useProjectAction } from "./use-project-action";

/**
 * "Yeni proje" (Dialogs → Yeni proje, MNewProject): ad, renk, isteğe bağlı açıklama.
 * Oluşturulunca proje sayfası açılır; açan kişi yönetici olur.
 */
export function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={SHEET_DIALOG} showCloseButton>
        {open && <NewProjectForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function NewProjectForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [color, setColor] = useState<ProjectColor>("mavi");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [id] = useState(() => crypto.randomUUID());
  const { submit, busy, error } = useProjectAction("/api/projeler", {
    toastErrors: false,
    onSuccess: () => {
      toast.success("Proje oluşturuldu");
      onDone();
      navigate(`/proje/${id}`);
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Proje adı gerekli");
      return;
    }
    void submit({ intent: "create", id, name: name.trim(), color, description });
  };

  const shownError = nameError ?? error?.error;
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <DialogTitle className="m-0 text-lg font-semibold">Yeni proje</DialogTitle>
      <DialogDescription className="sr-only">
        Proje adı, rengi ve isteğe bağlı açıklama. Projeyi açan kişi yönetici olur.
      </DialogDescription>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="yeni-proje-ad" className={FIELD_LABEL}>
          Proje adı
        </label>
        <input
          id="yeni-proje-ad"
          name="name"
          autoComplete="off"
          maxLength={MAX_PROJECT_NAME_LENGTH}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(undefined);
          }}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={shownError ? "yeni-proje-ad-hata" : undefined}
          className={FIELD_INPUT}
        />
        <FieldError id="yeni-proje-ad-hata">{shownError}</FieldError>
      </div>
      <ProjectColorPicker value={color} onChange={setColor} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="yeni-proje-aciklama" className={FIELD_LABEL}>
          Açıklama <span className="font-normal text-muted-foreground">(isteğe bağlı)</span>
        </label>
        <input
          id="yeni-proje-aciklama"
          name="description"
          autoComplete="off"
          maxLength={MAX_PROJECT_DESCRIPTION_LENGTH}
          placeholder="Projenin amacı bir cümleyle"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={FIELD_INPUT}
        />
      </div>
      <p className="m-0 text-[13px] text-muted-foreground">
        Projeyi açan kişi yönetici olur. Üyeleri proje ayarlarından davet edebilirsin.
      </p>
      <div className={DIALOG_FOOTER}>
        <Button type="button" variant="outline" onClick={onDone}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={busy}>
          Projeyi oluştur
        </Button>
      </div>
    </form>
  );
}

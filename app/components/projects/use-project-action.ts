import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { toast } from "sonner";
import type { RuleCode } from "~/domain/projects/permissions";

/** `/api/projeler*` ve `/api/davetler` yanıtı. */
export type ProjectActionResult =
  | { ok: true; id?: string; invitationId?: string; projectId?: string }
  | { ok: false; error: string; code?: RuleCode };

export const projectAction = (projectId: string) =>
  `/api/projeler/${encodeURIComponent(projectId)}`;

type Options = {
  /** Başarılı yanıttan sonra (bir kez). */
  onSuccess?: (data: Extract<ProjectActionResult, { ok: true }>) => void;
  /** Hata toast olarak gösterilsin mi? (Formlar hatayı alanın altında gösterir.) */
  toastErrors?: boolean;
  key?: string;
};

/**
 * Proje eylemi gönderen fetcher. Sayfa değişmez; yanıttan sonra loader'lar (kabuk
 * dahil) yeniden doğrulanır. Hata metni sunucudan aynen gelir (`MESSAGES`).
 */
export function useProjectAction(action: string, options: Options = {}) {
  const fetcher = useFetcher<ProjectActionResult>(options.key ? { key: options.key } : undefined);
  const handled = useRef<unknown>(null);
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });

  useEffect(() => {
    const data = fetcher.data;
    if (fetcher.state !== "idle" || !data || handled.current === data) return;
    handled.current = data;
    if (data.ok) opts.current.onSuccess?.(data);
    else if (opts.current.toastErrors !== false) toast.error(data.error);
  }, [fetcher.state, fetcher.data]);

  const submit = (fields: Record<string, string>) =>
    fetcher.submit(fields, { method: "post", action });

  const error = fetcher.state === "idle" && fetcher.data?.ok === false ? fetcher.data : undefined;
  return { fetcher, submit, busy: fetcher.state !== "idle", error };
}

/**
 * Sayfayı terk ettiren eylemler (ayrılma, silme, geri getirme, davet yanıtı) için:
 * fetcher yerine doğrudan istek. Fetcher'ın yeniden doğrulaması bulunulan sayfayı
 * (artık erişilemeyen proje → 404) ya da satırı söküp yanıtı kaybettirebilir; burada
 * yanıt beklenir, sonra çağıran gezinir ve `refresh` kabuğu yeniden yükler.
 */
export function useProjectRequest() {
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const send = async (action: string, fields: Record<string, string>) => {
    setBusy(true);
    try {
      const res = await fetch(action, {
        method: "POST",
        body: new URLSearchParams(fields),
        headers: { Accept: "application/json" },
      });
      const data = (await res.json().catch(() => null)) as ProjectActionResult | null;
      const result: ProjectActionResult = data ?? { ok: false, error: "Bir şeyler ters gitti." };
      if (!result.ok) toast.error(result.error);
      return result;
    } catch {
      toast.error("Bağlantı kurulamadı. Tekrar dene.");
      return { ok: false, error: "Bağlantı kurulamadı." } as ProjectActionResult;
    } finally {
      setBusy(false);
    }
  };
  return { send, busy, refresh: () => revalidator.revalidate() };
}

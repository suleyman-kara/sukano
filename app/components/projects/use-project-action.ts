import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
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

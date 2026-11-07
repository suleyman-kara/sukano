import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { ProjectRole } from "~/db/schema";
import { roleLabel } from "~/domain/projects/permissions";
import type { ChannelEvent } from "~/domain/realtime/grid-events";
import { projectChannelOutcome, type Person } from "~/domain/realtime/live-ui";
import { useLiveConfig } from "./live-context";

type GuardProject = { id: string; name: string };

/**
 * Proje sayfasında kanal olaylarından bu kişiyi ilgilendirenler (PLAN §5):
 *
 * - `proje-silindi` (başkası sildi): Notlarım'a yönlendirilir, toast söyler.
 * - `uyelik` (bu kişi): sunucuya sorulur; erişim kalktıysa (çıkarıldın) Notlarım'a
 *   yönlendirilir, rol değiştiyse toast yeni rolü söyler (sayfa zaten yeniden doğrulanır).
 *
 * Açık not alt rotada olduğu için yönlendirme onu da kapatır (oda `close` ile bekleyeni
 * yazdırır). `useLiveGrid(…, { onEvent })` ile bağlanır.
 */
export function useProjectChannelGuard(
  project: GuardProject,
  people: readonly Person[],
  fetchImpl: typeof fetch = (...args) => fetch(...args),
) {
  const navigate = useNavigate();
  const { me } = useLiveConfig();
  const latest = useRef({ project, people, fetchImpl });
  useEffect(() => {
    latest.current = { project, people, fetchImpl };
  });
  const handled = useRef(false);

  return useCallback(
    (event: ChannelEvent) => {
      const { project: p, people: list, fetchImpl: doFetch } = latest.current;
      const outcome = projectChannelOutcome(event, {
        me: me?.id ?? null,
        projectName: p.name,
        people: list,
      });
      if (!outcome || handled.current) return;
      if (outcome.kind === "deleted") {
        handled.current = true;
        toast(outcome.title, { description: outcome.description, id: `proje-silindi:${p.id}` });
        void navigate("/", { replace: true });
        return;
      }
      void doFetch(`/api/projeler/${encodeURIComponent(p.id)}`, {
        headers: { accept: "application/json" },
      })
        .then(async (res) => {
          if (res.status === 404 || res.status === 403) {
            handled.current = true;
            toast("Projeden çıkarıldın", {
              description: `${p.name} projesine artık erişimin yok. Notlarım'a döndün.`,
              id: `uyelik:${p.id}`,
            });
            void navigate("/", { replace: true });
            return;
          }
          if (!res.ok) return;
          const data = (await res.json()) as { myRole?: ProjectRole };
          if (!data.myRole) return;
          toast("Rolün değişti", {
            description: `${p.name} projesinde artık ${roleLabel(data.myRole).toLocaleLowerCase("tr-TR")} rolündesin.`,
            id: `uyelik:${p.id}`,
          });
        })
        .catch(() => {});
    },
    [me?.id, navigate],
  );
}

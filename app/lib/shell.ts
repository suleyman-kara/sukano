import { useRouteLoaderData } from "react-router";
import type { ShellData } from "~/components/shell/types";

/**
 * Kabuk verisi yokken (kabuksuz sayfalar, testler) kullanılan boş veri. Uygulama
 * rotaları oturum ister; bkz. `app/root.tsx` middleware.
 */
export const emptyShell: ShellData = {
  user: { name: "Misafir", email: "", avatarColor: "#5F5D57", avatarUrl: null },
  projects: [],
  deletedProjectCount: 0,
  pendingInviteCount: 0,
  unreadNotificationCount: 0,
};

/** Kök loader'ın (`app/root.tsx`) ürettiği kabuk verisi. */
export function useShellData(): ShellData {
  const data = useRouteLoaderData<{ shell: ShellData }>("root");
  return data?.shell ?? emptyShell;
}

import { useRouteLoaderData } from "react-router";
import type { ShellData } from "~/components/shell/types";

/** Oturum yokken kabuğun gösterdiği boş veri (Aşama 1'de `/giris` yönlendirmesi gelecek). */
export const emptyShell: ShellData = {
  user: { name: "Misafir", email: "", avatarColor: "#5F5D57", avatarUrl: null },
  projects: [],
  pendingInviteCount: 0,
  unreadNotificationCount: 0,
};

/** Kök loader'ın (`app/root.tsx`) ürettiği kabuk verisi. */
export function useShellData(): ShellData {
  const data = useRouteLoaderData<{ shell: ShellData }>("root");
  return data?.shell ?? emptyShell;
}

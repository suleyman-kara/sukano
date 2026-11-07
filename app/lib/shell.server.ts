import { and, count, eq, gt, isNull } from "drizzle-orm";
import type { RouterContextProvider } from "react-router";
import type { ShellData } from "~/components/shell/types";
import { createDb } from "~/db/client";
import { invitations, notifications } from "~/db/schema";
import { getCloudflare } from "./context";
import { getSession } from "./session.server";
import { projectsService } from "./projects.server";
import { emptyShell } from "./shell";

import { avatarColorFor } from "./avatar";

export { avatarColorFor };

/**
 * Kabuk verisi: oturum varsa kullanıcı, üyesi olduğu (silinmemiş) projeler
 * (kişisel sırasıyla, rolüyle), silinmiş proje sayısı (yönetici olunanlar), bekleyen
 * davet ve okunmamış bildirim sayıları. Oturum yoksa boş kabuk.
 */
export async function loadShellData(
  request: Request,
  context: Readonly<RouterContextProvider>,
): Promise<ShellData> {
  const session = await getSession(request, context);
  if (!session) return emptyShell;

  const { user } = session;
  const { env } = getCloudflare(context);
  const db = createDb(env.DB);
  const now = new Date();

  const [sidebar, [invites], [unread]] = await Promise.all([
    projectsService(env, user.id).sidebar(),
    db
      .select({ n: count() })
      .from(invitations)
      .where(
        and(
          eq(invitations.email, user.email.toLowerCase()),
          eq(invitations.status, "beklemede"),
          gt(invitations.expiresAt, now),
        ),
      ),
    db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
  ]);

  return {
    user: {
      name: user.name,
      email: user.email,
      avatarColor: user.avatarColor ?? avatarColorFor(user.id),
      avatarUrl: user.image ?? null,
    },
    projects: sidebar.projects.map(({ id, name, color, emoji, role }) => ({
      id,
      name,
      color,
      emoji,
      role,
    })),
    deletedProjectCount: sidebar.deletedCount,
    pendingInviteCount: invites?.n ?? 0,
    unreadNotificationCount: unread?.n ?? 0,
  };
}

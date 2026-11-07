import { and, asc, count, eq, gt, isNull, sql } from "drizzle-orm";
import type { RouterContextProvider } from "react-router";
import type { ShellData } from "~/components/shell/types";
import { createDb } from "~/db/client";
import { invitations, notifications, projectMembers, projects, userPreferences } from "~/db/schema";
import { getCloudflare } from "./context";
import { getSession } from "./session.server";
import { emptyShell } from "./shell";

/** Beyaz metinle ≥ 4,5:1 avatar renkleri (tasarımdaki örnek kullanıcılar). */
const AVATAR_COLORS = ["#597895", "#B25D49", "#4976B4", "#7A5FB8", "#398264", "#8A6420"];

export function avatarColorFor(userId: string): string {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

/**
 * Kabuk verisi: oturum varsa kullanıcı, üyesi olduğu (silinmemiş) projeler
 * (kişisel sırasıyla), bekleyen davet ve okunmamış bildirim sayıları. Oturum yoksa
 * boş kabuk.
 */
export async function loadShellData(
  request: Request,
  context: Readonly<RouterContextProvider>,
): Promise<ShellData> {
  const session = await getSession(request, context);
  if (!session) return emptyShell;

  const { user } = session;
  const db = createDb(getCloudflare(context).env.DB);
  const now = new Date();

  const [projectRows, prefs, [invites], [unread]] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, color: projects.color })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(and(eq(projectMembers.userId, user.id), isNull(projects.deletedAt)))
      .orderBy(asc(sql`${projects.name} collate nocase`)),
    db
      .select({ projectOrder: userPreferences.projectOrder })
      .from(userPreferences)
      .where(eq(userPreferences.userId, user.id))
      .get(),
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

  // Kişisel sıradaki projeler önce (o sırayla), kalanlar ada göre.
  const order = new Map((prefs?.projectOrder ?? []).map((id, i) => [id, i]));
  const sorted = [...projectRows].sort(
    (a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity),
  );

  return {
    user: {
      name: user.name,
      email: user.email,
      avatarColor: user.avatarColor ?? avatarColorFor(user.id),
      avatarUrl: user.image ?? null,
    },
    projects: sorted,
    pendingInviteCount: invites?.n ?? 0,
    unreadNotificationCount: unread?.n ?? 0,
  };
}

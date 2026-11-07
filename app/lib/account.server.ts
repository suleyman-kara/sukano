/**
 * Hesap silme (PLAN §2, tasarım: Settings, Dialogs2 → Hesap silme).
 *
 * - Tek yönetici olunan (silinmemiş) projeler varsa engellenir: önce devir ya da silme.
 * - Onay için e-posta adresi yazılır.
 * - Kişisel notlar ekleri (R2), görevleri ve sürümleriyle silinir.
 * - Proje notları kalır; oluşturan/son düzenleyen `null` olur → "Silinmiş kullanıcı".
 * - Üyelikler, görev atamaları, oturumlar, bildirimler zincirleme silinir; adrese
 *   bekleyen davetler geri çekilir.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createDb } from "~/db/client";
import { invitations, notes, projectMembers, projects, user } from "~/db/schema";
import {
  checkAccountDeletion,
  soleManagerProjects,
  type Membership,
} from "~/domain/projects/permissions";
import { deleteNotes } from "./notes.server";
import { ProjectRuleError } from "./project-access.server";

type Env = { DB: D1Database; FILES?: R2Bucket };

/** Silinmiş kullanıcının proje notlarında görünen adı. */
export const DELETED_USER_LABEL = "Silinmiş kullanıcı";

/** Kullanıcının tek yönetici olduğu silinmemiş projeler (Ayarlar → Hesabı sil). */
export async function accountDeletionBlockers(env: Env, userId: string) {
  const db = createDb(env.DB);
  const mine = await db
    .select({ projectId: projects.id, projectName: projects.name, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projectMembers.userId, userId), isNull(projects.deletedAt)));
  const managed = mine.filter((m) => m.role === "yonetici").map((m) => m.projectId);
  const managers = managed.length
    ? await db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(and(inArray(projectMembers.projectId, managed), eq(projectMembers.role, "yonetici")))
    : [];
  const memberships: Membership[] = mine.map((m) => ({
    ...m,
    managerCount: managers.filter((x) => x.projectId === m.projectId).length,
  }));
  return soleManagerProjects(memberships);
}

/**
 * Hesabı siler; kural ihlalinde `ProjectRuleError` (`tek_yonetici`, `eposta_uyusmuyor`).
 * `dryRun`: yalnızca kuralları denetler (oturumu kapatmadan önce).
 */
export async function deleteAccount(
  env: Env,
  userId: string,
  typedEmail: string,
  { dryRun = false } = {},
) {
  const db = createDb(env.DB);
  const me = await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).get();
  if (!me) return;
  const check = checkAccountDeletion({
    email: me.email,
    typedEmail,
    blockers: await accountDeletionBlockers(env, userId),
  });
  if (!check.ok) throw new ProjectRuleError(check.code, check.message);
  if (dryRun) return;
  const personal = await db
    .select({ id: notes.id })
    .from(notes)
    .where(eq(notes.ownerUserId, userId));
  await deleteNotes(
    db,
    personal.map((n) => n.id),
    env.FILES,
  );
  const now = new Date();
  await db.batch([
    db
      .update(invitations)
      .set({ status: "geri_cekildi", respondedAt: now, updatedAt: now })
      .where(
        and(eq(invitations.email, me.email.toLowerCase()), eq(invitations.status, "beklemede")),
      ),
    db.delete(user).where(eq(user.id, userId)),
  ]);
}

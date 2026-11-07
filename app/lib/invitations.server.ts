/**
 * Gelen davetler (Davetler sayfası): bekleyen ve geçmiş davetler, kabul ve ret.
 * Davet e-posta adresine gönderilir; yalnızca o adresteki (doğrulanmış) hesap
 * yanıtlayabilir. 14 gün sonra geçersiz olur; cron `suresi_doldu` olarak işaretler.
 */
import { and, desc, eq, lte } from "drizzle-orm";
import { createDb } from "~/db/client";
import {
  invitations,
  projectMembers,
  projects,
  user,
  type InvitationStatus,
  type ProjectColor,
  type ProjectRole,
} from "~/db/schema";
import { inviteExpiryLabel } from "~/domain/projects/lifecycle";
import { checkRespond, invitationStatus } from "~/domain/projects/permissions";
import type { InviteIntent } from "~/domain/projects/validation";
import { runBatch } from "./note-store.server";
import { InvitationNotFoundError, ProjectRuleError } from "./project-access.server";
import { avatarColorFor } from "./shell.server";

export type IncomingInvite = {
  id: string;
  project: { id: string; name: string; color: ProjectColor; emoji: string | null };
  role: ProjectRole;
  invitedBy: { name: string; avatarColor: string } | null;
  createdAt: string;
  expiresAt: string;
  /** "13 gün sonra geçersiz" (yalnızca bekleyenlerde anlamlı). */
  expiryLabel: string;
  status: InvitationStatus;
  respondedAt: string | null;
  /** Kabul edilmiş ve hâlâ üyesi olunan, silinmemiş proje: "Projeye git". */
  canOpenProject: boolean;
};

export type InvitesPageData = { pending: IncomingInvite[]; history: IncomingInvite[] };

const HISTORY_LIMIT = 50;

/** Oturumdaki kullanıcıya gelen davetler. */
export function invitationsService(
  env: { DB: D1Database },
  userId: string,
  clock: () => Date = () => new Date(),
) {
  const db = createDb(env.DB);

  async function myEmail() {
    const me = await db
      .select({ email: user.email, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, userId))
      .get();
    if (!me) throw new InvitationNotFoundError();
    return me;
  }

  /** Daveti ve projesini getirir; başkasının daveti ya da olmayan davet 404. */
  async function own(id: string) {
    const me = await myEmail();
    const row = await db
      .select({ inv: invitations, project: projects })
      .from(invitations)
      .innerJoin(projects, eq(projects.id, invitations.projectId))
      .where(eq(invitations.id, id))
      .get();
    if (!row || row.inv.email !== me.email.toLowerCase()) throw new InvitationNotFoundError();
    const check = checkRespond(row.inv, me.email, clock());
    if (!check.ok) {
      if (check.code === "davet_yok") throw new InvitationNotFoundError();
      throw new ProjectRuleError(check.code, check.message);
    }
    if (row.project.deletedAt)
      throw new ProjectRuleError("gecersiz_davet", "Bu proje silindi; davet artık geçerli değil.");
    return row;
  }

  return {
    /** Davetler sayfası: bekleyenler (en yeni önce) ve geçmiş. Silinmiş projeler gizlenir. */
    async list(): Promise<InvitesPageData> {
      const me = await myEmail();
      const now = clock();
      const rows = await db
        .select({
          inv: invitations,
          project: projects,
          inviterName: user.name,
          inviterColor: user.avatarColor,
          inviterId: user.id,
        })
        .from(invitations)
        .innerJoin(projects, eq(projects.id, invitations.projectId))
        .leftJoin(user, eq(user.id, invitations.invitedBy))
        .where(eq(invitations.email, me.email.toLowerCase()))
        .orderBy(desc(invitations.createdAt));
      const memberOf = new Set(
        (
          await db
            .select({ projectId: projectMembers.projectId })
            .from(projectMembers)
            .where(eq(projectMembers.userId, userId))
        ).map((m) => m.projectId),
      );
      const out: InvitesPageData = { pending: [], history: [] };
      for (const r of rows) {
        if (r.project.deletedAt) continue;
        const status = invitationStatus(r.inv, now);
        const item: IncomingInvite = {
          id: r.inv.id,
          project: {
            id: r.project.id,
            name: r.project.name,
            color: r.project.color,
            emoji: r.project.emoji,
          },
          role: r.inv.role,
          invitedBy:
            r.inviterId && r.inviterName
              ? {
                  name: r.inviterName,
                  avatarColor: r.inviterColor ?? avatarColorFor(r.inviterId),
                }
              : null,
          createdAt: r.inv.createdAt.toISOString(),
          expiresAt: r.inv.expiresAt.toISOString(),
          expiryLabel: inviteExpiryLabel(r.inv.expiresAt, now),
          status,
          respondedAt: r.inv.respondedAt?.toISOString() ?? null,
          canOpenProject: status === "kabul_edildi" && memberOf.has(r.project.id),
        };
        if (status === "beklemede") {
          // Doğrulanmamış hesap davet alamaz (PLAN §2).
          if (me.emailVerified) out.pending.push(item);
        } else if (out.history.length < HISTORY_LIMIT) out.history.push(item);
      }
      return out;
    },

    /** Kabul: davetteki rolle üye olur. Döner: projenin kimliği ("Projeye git"). */
    async accept(id: string): Promise<{ projectId: string }> {
      const { inv } = await own(id);
      const now = clock();
      await runBatch(db, [
        db
          .update(invitations)
          .set({ status: "kabul_edildi", respondedAt: now, updatedAt: now })
          .where(eq(invitations.id, id)),
        db
          .insert(projectMembers)
          .values({
            projectId: inv.projectId,
            userId,
            role: inv.role,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing(),
      ]);
      return { projectId: inv.projectId };
    },

    async decline(id: string) {
      await own(id);
      const now = clock();
      await db
        .update(invitations)
        .set({ status: "reddedildi", respondedAt: now, updatedAt: now })
        .where(eq(invitations.id, id));
    },

    /** `POST /api/davetler` */
    async run(intent: InviteIntent): Promise<{ projectId?: string } | void> {
      if (intent.intent === "accept") return this.accept(intent.id);
      return this.decline(intent.id);
    },
  };
}

/** Cron: süresi dolan bekleyen davetleri `suresi_doldu` yapar; işaretlenen sayıyı döner. */
export async function expirePendingInvitations(env: { DB: D1Database }, now: Date) {
  const db = createDb(env.DB);
  const rows = await db
    .update(invitations)
    .set({ status: "suresi_doldu", updatedAt: now })
    .where(and(eq(invitations.status, "beklemede"), lte(invitations.expiresAt, now)))
    .returning({ id: invitations.id });
  return rows.length;
}

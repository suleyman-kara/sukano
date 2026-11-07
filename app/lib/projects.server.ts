/**
 * Projeler: oluşturma, düzenleme, kişiye özel sıra, üyelik (rol verme, çıkarma,
 * ayrılma), davet gönderme/geri çekme, silme (7 gün bekleme) ve geri getirme; ayrıca
 * arayüz sayfalarının loader verisi (proje sayfası, ayarlar, silinmiş projeler, sol
 * menü). Her işlem `memberRole` + rol × eylem matrisinden geçer (PLAN §2, §4).
 *
 * Hatalar: üye değil / proje yok → `ProjectNotFoundError` (404), rol yetmiyor →
 * `ForbiddenError` (403), kural ihlali → `ProjectRuleError` (409, `code`).
 */
import { and, asc, count, eq, gt, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { createDb, type Database } from "~/db/client";
import {
  invitations,
  notes,
  notifications,
  projectMembers,
  projects,
  taskAssignees,
  tasks,
  user,
  userPreferences,
  type ProjectColor,
  type ProjectRole,
} from "~/db/schema";
import type { NoteCardData, NoteView } from "~/domain/notes/optimistic";
import {
  isPurgeDue,
  PROJECT_RETENTION_MS,
  purgeDaysLeft,
  purgeLabel,
} from "~/domain/projects/lifecycle";
import { orderProjects, sortMembers } from "~/domain/projects/members";
import {
  can,
  checkInvite,
  checkLeave,
  checkRemoveMember,
  checkRoleChange,
  managerCount,
  roleLabel,
  type RuleResult,
} from "~/domain/projects/permissions";
import type { ProjectFields, ProjectIntent, ProjectsIntent } from "~/domain/projects/validation";
import { sendInvitationEmail } from "./email.server";
import { runBatch, type Batch } from "./note-store.server";
import { deleteNotes, scopedNotes } from "./notes.server";
import {
  assertCan,
  ForbiddenError,
  memberRole,
  ProjectNotFoundError,
  ProjectRuleError,
} from "./project-access.server";
import { avatarColorFor } from "./avatar";

type Env = Cloudflare.Env;

export type ProjectSummary = {
  id: string;
  name: string;
  color: ProjectColor;
  emoji: string | null;
  description: string | null;
};

export type ProjectMember = {
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  avatarUrl: string | null;
  role: ProjectRole;
  isMe: boolean;
};

/** Arayüzün düğmeleri gizlemek/kilitlemek için kullandığı izinler (sunucu yine denetler). */
export type ProjectPermissions = {
  /** Not ekleme, düzenleme, görev işaretleme (yönetici, düzenleyici). */
  canWrite: boolean;
  /** Ayarlar, davet, rol, üye çıkarma, silme (yönetici). */
  canManage: boolean;
};

export type ProjectPageData = {
  project: ProjectSummary;
  myRole: ProjectRole;
  permissions: ProjectPermissions;
  /** Sıra: sen, sonra rol, sonra ad (kişi seçici de bu sırayı kullanır). */
  members: ProjectMember[];
  notes: NoteCardData[];
};

export type PendingInvite = {
  id: string;
  email: string;
  role: ProjectRole;
  /** Davet edilen hesabın adı (hesap varsa). */
  inviteeName: string | null;
  invitedByName: string | null;
  createdAt: string;
  expiresAt: string;
};

export type ProjectSettingsData = {
  project: ProjectSummary;
  myRole: ProjectRole;
  permissions: ProjectPermissions;
  members: ProjectMember[];
  managerCount: number;
  /** Kullanıcı projenin son yöneticisi mi? (Ayrılamaz, kendini indiremez.) */
  isLastManager: boolean;
  /** Yalnızca yöneticiye dolu. */
  pendingInvites: PendingInvite[];
  noteCount: number;
};

export type SidebarProject = {
  id: string;
  name: string;
  color: ProjectColor;
  emoji: string | null;
  role: ProjectRole;
  /** Etkin (arşivde ve çöpte olmayan) not sayısı. */
  noteCount: number;
};

export type DeletedProject = {
  id: string;
  name: string;
  color: ProjectColor;
  emoji: string | null;
  deletedAt: string;
  deletedBy: { id: string; name: string } | null;
  deletedByMe: boolean;
  /** Kalıcı silinme zamanı ve kalan gün ("5 gün kaldı", "yarın silinecek"). */
  purgeAt: string;
  daysLeft: number;
  purgeLabel: string;
  noteCount: number;
  memberCount: number;
};

const summary = (p: typeof projects.$inferSelect): ProjectSummary => ({
  id: p.id,
  name: p.name,
  color: p.color,
  emoji: p.emoji,
  description: p.description,
});

const permissionsOf = (role: ProjectRole): ProjectPermissions => ({
  canWrite: can(role, "note.create"),
  canManage: can(role, "project.manageMembers"),
});

/** Kural ihlalini hataya çevirir: yetki eksikliği 403, diğer ihlaller 409. */
function ruleError(result: Extract<RuleResult, { ok: false }>) {
  return result.code === "yetki_yok"
    ? new ForbiddenError(result.message)
    : new ProjectRuleError(result.code, result.message);
}

function enforce(result: RuleResult) {
  if (!result.ok) throw ruleError(result);
}

async function membersOf(db: Database, projectId: string) {
  return db
    .select({
      userId: projectMembers.userId,
      role: projectMembers.role,
      name: user.name,
      email: user.email,
      avatarColor: user.avatarColor,
      image: user.image,
    })
    .from(projectMembers)
    .innerJoin(user, eq(user.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId));
}

async function noteCounts(db: Database, projectIds: string[], activeOnly = true) {
  const out = new Map<string, number>();
  if (projectIds.length === 0) return out;
  const rows = await db
    .select({ projectId: notes.projectId, n: count() })
    .from(notes)
    .where(
      and(
        inArray(notes.projectId, projectIds),
        ...(activeOnly ? [isNull(notes.trashedAt), isNull(notes.archivedAt)] : []),
      ),
    )
    .groupBy(notes.projectId);
  for (const r of rows) if (r.projectId) out.set(r.projectId, r.n);
  return out;
}

/** Bildirim satırı ekleme adımı. */
function notificationOp(
  db: Database,
  row: {
    userId: string;
    type: "davet" | "rol_degisti" | "projeden_cikarildi" | "proje_silindi";
    projectId: string;
    actorId: string;
    data: Record<string, unknown>;
    now: Date;
  },
) {
  return db.insert(notifications).values({
    userId: row.userId,
    type: row.type,
    projectId: row.projectId,
    actorId: row.actorId,
    data: row.data,
    createdAt: row.now,
    updatedAt: row.now,
  });
}

/** Kişinin projedeki notlarda görev atamalarını kaldıran adım (ayrılma/çıkarılma). */
function removeAssignmentsOp(db: Database, projectId: string, userId: string) {
  return db
    .delete(taskAssignees)
    .where(
      and(
        eq(taskAssignees.userId, userId),
        inArray(
          taskAssignees.taskId,
          db
            .select({ id: tasks.id })
            .from(tasks)
            .innerJoin(notes, eq(notes.id, tasks.noteId))
            .where(eq(notes.projectId, projectId)),
        ),
      ),
    );
}

/** Oturumdaki kullanıcının proje işlemleri. */
export function projectsService(env: Env, userId: string, clock: () => Date = () => new Date()) {
  const db = createDb(env.DB);

  const toMember = (m: Awaited<ReturnType<typeof membersOf>>[number]): ProjectMember => ({
    userId: m.userId,
    name: m.name,
    email: m.email,
    avatarColor: m.avatarColor ?? avatarColorFor(m.userId),
    avatarUrl: m.image ?? null,
    role: m.role,
    isMe: m.userId === userId,
  });

  async function memberList(projectId: string) {
    return sortMembers((await membersOf(db, projectId)).map(toMember), userId);
  }

  return {
    /* -------------------------------------------------------------- */
    /* Oluşturma, düzenleme, sıra                                      */
    /* -------------------------------------------------------------- */

    /** Proje açar; açan yönetici olur. Kişisel sıranın sonuna eklenir. */
    async create(input: ProjectFields & { id?: string }): Promise<{ id: string }> {
      const id = input.id ?? crypto.randomUUID();
      const exists = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, id))
        .get();
      if (exists) throw new ProjectNotFoundError();
      const now = clock();
      const prefs = await db
        .select({ projectOrder: userPreferences.projectOrder })
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .get();
      const order = [...(prefs?.projectOrder ?? []).filter((p) => p !== id), id];
      await runBatch(db, [
        db.insert(projects).values({
          id,
          name: input.name,
          color: input.color,
          emoji: input.emoji,
          description: input.description,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        }),
        db
          .insert(projectMembers)
          .values({ projectId: id, userId, role: "yonetici", createdAt: now, updatedAt: now }),
        db
          .insert(userPreferences)
          .values({ userId, projectOrder: order })
          .onConflictDoUpdate({
            target: userPreferences.userId,
            set: { projectOrder: order, updatedAt: now },
          }),
      ]);
      return { id };
    },

    /** Ad, renk, simge, açıklama (yönetici). */
    async update(projectId: string, patch: Partial<ProjectFields>) {
      const { role } = await memberRole(db, userId, projectId);
      assertCan(role, "project.edit");
      await db
        .update(projects)
        .set({ ...patch, updatedAt: clock() })
        .where(eq(projects.id, projectId));
    },

    /** Sol menüdeki kişiye özel sıra (yalnızca üyesi olunan projeler saklanır). */
    async reorder(order: string[]) {
      const mine = new Set(
        (
          await db
            .select({ id: projectMembers.projectId })
            .from(projectMembers)
            .where(eq(projectMembers.userId, userId))
        ).map((r) => r.id),
      );
      const clean = [...new Set(order)].filter((id) => mine.has(id));
      const now = clock();
      await db
        .insert(userPreferences)
        .values({ userId, projectOrder: clean })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: { projectOrder: clean, updatedAt: now },
        });
    },

    /* -------------------------------------------------------------- */
    /* Silme ve geri getirme                                           */
    /* -------------------------------------------------------------- */

    /**
     * Projeyi siler (yönetici; son yönetici de silebilir). 7 gün "silinmiş" bekler,
     * üyelere bildirim gider. Silinmiş projeye kimse erişemez; yöneticiler geri getirebilir.
     */
    async softDelete(projectId: string) {
      const { project, role } = await memberRole(db, userId, projectId);
      assertCan(role, "project.delete");
      const now = clock();
      const members = await membersOf(db, projectId);
      await runBatch(db, [
        db
          .update(projects)
          .set({ deletedAt: now, deletedBy: userId, updatedAt: now })
          .where(eq(projects.id, projectId)),
        ...members
          .filter((m) => m.userId !== userId)
          .map((m) =>
            notificationOp(db, {
              userId: m.userId,
              type: "proje_silindi",
              projectId,
              actorId: userId,
              data: { projectName: project.name },
              now,
            }),
          ),
      ]);
    },

    /** "Projeyi geri getir": silinmiş projeyi 7 gün içinde geri getirir (yönetici). */
    async restore(projectId: string) {
      const { project, role } = await memberRole(db, userId, projectId, { includeDeleted: true });
      assertCan(role, "project.restore");
      if (!project.deletedAt) return;
      if (isPurgeDue(project.deletedAt, clock())) throw new ProjectNotFoundError();
      await db
        .update(projects)
        .set({ deletedAt: null, deletedBy: null, updatedAt: clock() })
        .where(eq(projects.id, projectId));
    },

    /* -------------------------------------------------------------- */
    /* Üyelik                                                          */
    /* -------------------------------------------------------------- */

    /** Rol verme (yönetici). Son yönetici kendini indiremez. Hedefe bildirim gider. */
    async setRole(projectId: string, targetId: string, newRole: ProjectRole) {
      const { project } = await memberRole(db, userId, projectId);
      const members = await membersOf(db, projectId);
      enforce(checkRoleChange(members, userId, targetId, newRole));
      const current = members.find((m) => m.userId === targetId)!;
      if (current.role === newRole) return;
      const now = clock();
      await runBatch(db, [
        db
          .update(projectMembers)
          .set({ role: newRole, updatedAt: now })
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, targetId))),
        ...(targetId !== userId
          ? [
              notificationOp(db, {
                userId: targetId,
                type: "rol_degisti",
                projectId,
                actorId: userId,
                data: { projectName: project.name, role: newRole },
                now,
              }),
            ]
          : []),
      ]);
    },

    /**
     * Üye çıkarma (yönetici). Notlar projede kalır; kişinin görev atamaları kaldırılır;
     * oluşturan/son düzenleyen bilgisi adıyla kalır. Kişiye bildirim gider.
     */
    async removeMember(projectId: string, targetId: string) {
      const { project } = await memberRole(db, userId, projectId);
      const members = await membersOf(db, projectId);
      enforce(checkRemoveMember(members, userId, targetId));
      const now = clock();
      await runBatch(db, [
        removeAssignmentsOp(db, projectId, targetId),
        db
          .delete(projectMembers)
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, targetId))),
        notificationOp(db, {
          userId: targetId,
          type: "projeden_cikarildi",
          projectId,
          actorId: userId,
          data: { projectName: project.name },
          now,
        }),
      ]);
    },

    /** Projeden ayrılma. Son yönetici ayrılamaz. Görev atamaları kaldırılır. */
    async leave(projectId: string) {
      await memberRole(db, userId, projectId);
      enforce(checkLeave(await membersOf(db, projectId), userId));
      await runBatch(db, [
        removeAssignmentsOp(db, projectId, userId),
        db
          .delete(projectMembers)
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))),
      ]);
    },

    /* -------------------------------------------------------------- */
    /* Davet                                                           */
    /* -------------------------------------------------------------- */

    /**
     * Davet gönderir (yönetici). Kayıtlı ve doğrulanmış hesap, üye değil, geçerli
     * bekleyen daveti yok olmalı. Uygulama içi bildirim + e-posta. Süresi geçmiş
     * bekleyen davet `suresi_doldu` olur, yenisi yazılır.
     */
    async invite(
      projectId: string,
      email: string,
      inviteRole: ProjectRole,
    ): Promise<{ invitationId: string }> {
      const { project, role } = await memberRole(db, userId, projectId);
      const now = clock();
      const normalized = email.trim().toLowerCase();
      const account = normalized
        ? await db
            .select({ id: user.id, name: user.name, emailVerified: user.emailVerified })
            .from(user)
            .where(eq(user.email, normalized))
            .get()
        : undefined;
      const isMember = account
        ? Boolean(
            await db
              .select({ userId: projectMembers.userId })
              .from(projectMembers)
              .where(
                and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, account.id)),
              )
              .get(),
          )
        : false;
      const pending = await db
        .select({ id: invitations.id, expiresAt: invitations.expiresAt })
        .from(invitations)
        .where(
          and(
            eq(invitations.projectId, projectId),
            eq(invitations.email, normalized),
            eq(invitations.status, "beklemede"),
          ),
        )
        .get();
      const check = checkInvite({
        actorRole: role,
        email,
        account: account ?? null,
        isMember,
        pendingInvite: pending ?? null,
        now,
      });
      if (!check.ok) throw ruleError(check);
      const invitationId = crypto.randomUUID();
      const ops: Batch = [];
      if (pending) {
        ops.push(
          db
            .update(invitations)
            .set({ status: "suresi_doldu", updatedAt: now })
            .where(eq(invitations.id, pending.id)),
        );
      }
      ops.push(
        db.insert(invitations).values({
          id: invitationId,
          projectId,
          email: check.email,
          role: inviteRole,
          invitedBy: userId,
          expiresAt: check.expiresAt,
          createdAt: now,
          updatedAt: now,
        }),
        notificationOp(db, {
          userId: account!.id,
          type: "davet",
          projectId,
          actorId: userId,
          data: { projectName: project.name, role: inviteRole, invitationId },
          now,
        }),
      );
      await runBatch(db, ops);
      const inviter = await db
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, userId))
        .get();
      try {
        await sendInvitationEmail(env, {
          to: check.email,
          name: account!.name,
          inviterName: inviter?.name ?? "Bir proje yöneticisi",
          projectName: project.name,
          roleLabel: roleLabel(inviteRole).toLocaleLowerCase("tr"),
          url: new URL("/davetler", env.BETTER_AUTH_URL || "http://localhost:5173").toString(),
        });
      } catch (error) {
        // Davet uygulama içinde geçerlidir; e-posta hatası daveti geri almaz.
        console.error("[davet] e-posta gönderilemedi:", error);
      }
      return { invitationId };
    },

    /** Bekleyen daveti geri çeker (yönetici). */
    async revokeInvite(projectId: string, invitationId: string) {
      const { role } = await memberRole(db, userId, projectId);
      assertCan(role, "project.manageMembers");
      const now = clock();
      const res = await db
        .update(invitations)
        .set({ status: "geri_cekildi", respondedAt: now, updatedAt: now })
        .where(
          and(
            eq(invitations.id, invitationId),
            eq(invitations.projectId, projectId),
            eq(invitations.status, "beklemede"),
          ),
        )
        .returning({ id: invitations.id });
      if (res.length === 0)
        throw new ProjectRuleError("gecersiz_davet", "Bu davet artık geçerli değil.");
    },

    /* -------------------------------------------------------------- */
    /* Loader verileri                                                 */
    /* -------------------------------------------------------------- */

    /** Proje sayfası: proje, rolüm, izinler, üyeler ve görünümdeki notlar. */
    async page(projectId: string, view: NoteView = "notlar"): Promise<ProjectPageData> {
      const { project, role } = await memberRole(db, userId, projectId);
      const notesSvc = scopedNotes(env, userId, { kind: "project", projectId, role }, clock);
      return {
        project: summary(project),
        myRole: role,
        permissions: permissionsOf(role),
        members: await memberList(projectId),
        notes: await notesSvc.list(view),
      };
    },

    /** Üye listesi (kişi seçici; sen önce). */
    async members(projectId: string): Promise<ProjectMember[]> {
      await memberRole(db, userId, projectId);
      return memberList(projectId);
    },

    /** Proje ayarları: üyeler, roller, bekleyen davetler (yöneticiye). */
    async settings(projectId: string): Promise<ProjectSettingsData> {
      const { project, role } = await memberRole(db, userId, projectId);
      const members = await memberList(projectId);
      const managers = managerCount(members);
      const canManage = can(role, "project.manageMembers");
      const now = clock();
      const pendingRows = canManage
        ? await db
            .select({
              id: invitations.id,
              email: invitations.email,
              role: invitations.role,
              createdAt: invitations.createdAt,
              expiresAt: invitations.expiresAt,
              invitedByName: user.name,
            })
            .from(invitations)
            .leftJoin(user, eq(user.id, invitations.invitedBy))
            .where(
              and(
                eq(invitations.projectId, projectId),
                eq(invitations.status, "beklemede"),
                gt(invitations.expiresAt, now),
              ),
            )
            .orderBy(asc(invitations.createdAt))
        : [];
      const emails = pendingRows.map((r) => r.email);
      const invitees = emails.length
        ? await db
            .select({ email: user.email, name: user.name })
            .from(user)
            .where(inArray(user.email, emails))
        : [];
      const counts = await noteCounts(db, [projectId], false);
      return {
        project: summary(project),
        myRole: role,
        permissions: permissionsOf(role),
        members,
        managerCount: managers,
        isLastManager: role === "yonetici" && managers === 1,
        pendingInvites: pendingRows.map((r) => ({
          id: r.id,
          email: r.email,
          role: r.role,
          inviteeName: invitees.find((i) => i.email === r.email)?.name ?? null,
          invitedByName: r.invitedByName,
          createdAt: r.createdAt.toISOString(),
          expiresAt: r.expiresAt.toISOString(),
        })),
        noteCount: counts.get(projectId) ?? 0,
      };
    },

    /** Sol menü: üyesi olunan silinmemiş projeler (kişisel sırayla) + silinmiş proje sayısı. */
    async sidebar(): Promise<{ projects: SidebarProject[]; deletedCount: number }> {
      const [rows, prefs] = await Promise.all([
        db
          .select({
            id: projects.id,
            name: projects.name,
            color: projects.color,
            emoji: projects.emoji,
            role: projectMembers.role,
            deletedAt: projects.deletedAt,
          })
          .from(projectMembers)
          .innerJoin(projects, eq(projects.id, projectMembers.projectId))
          .where(eq(projectMembers.userId, userId)),
        db
          .select({ projectOrder: userPreferences.projectOrder })
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId))
          .get(),
      ]);
      const active = rows.filter((r) => !r.deletedAt);
      const counts = await noteCounts(
        db,
        active.map((r) => r.id),
      );
      const list = orderProjects(active, prefs?.projectOrder ?? []).map(
        ({ deletedAt: _d, ...r }) => ({ ...r, noteCount: counts.get(r.id) ?? 0 }),
      );
      const deletedCount = rows.filter((r) => r.deletedAt && r.role === "yonetici").length;
      return { projects: list, deletedCount };
    },

    /** Silinmiş projeler (yalnızca yönetici olunanlar), en son silinen önce. */
    async deleted(): Promise<DeletedProject[]> {
      const now = clock();
      const rows = await db
        .select({ project: projects, deletedByName: user.name })
        .from(projectMembers)
        .innerJoin(projects, eq(projects.id, projectMembers.projectId))
        .leftJoin(user, eq(user.id, projects.deletedBy))
        .where(
          and(
            eq(projectMembers.userId, userId),
            eq(projectMembers.role, "yonetici"),
            isNotNull(projects.deletedAt),
          ),
        )
        .orderBy(sql`${projects.deletedAt} desc`);
      const ids = rows.map((r) => r.project.id);
      const counts = await noteCounts(db, ids, false);
      const memberCounts = new Map<string, number>();
      if (ids.length) {
        for (const r of await db
          .select({ projectId: projectMembers.projectId, n: count() })
          .from(projectMembers)
          .where(inArray(projectMembers.projectId, ids))
          .groupBy(projectMembers.projectId))
          memberCounts.set(r.projectId, r.n);
      }
      return rows
        .filter((r) => !isPurgeDue(r.project.deletedAt!, now))
        .map(({ project: p, deletedByName }) => {
          const days = purgeDaysLeft(p.deletedAt!, now);
          return {
            id: p.id,
            name: p.name,
            color: p.color,
            emoji: p.emoji,
            deletedAt: p.deletedAt!.toISOString(),
            deletedBy:
              p.deletedBy && deletedByName ? { id: p.deletedBy, name: deletedByName } : null,
            deletedByMe: p.deletedBy === userId,
            purgeAt: new Date(p.deletedAt!.getTime() + PROJECT_RETENTION_MS).toISOString(),
            daysLeft: days,
            purgeLabel: purgeLabel(days),
            noteCount: counts.get(p.id) ?? 0,
            memberCount: memberCounts.get(p.id) ?? 0,
          };
        });
    },

    /* -------------------------------------------------------------- */
    /* Form eylemleri                                                  */
    /* -------------------------------------------------------------- */

    /** `POST /api/projeler` */
    async runCollection(intent: ProjectsIntent): Promise<{ id?: string } | void> {
      if (intent.intent === "create") {
        const { intent: _i, ...fields } = intent;
        return this.create(fields);
      }
      return this.reorder(intent.order);
    },

    /** `POST /api/projeler/:id` */
    async run(projectId: string, intent: ProjectIntent): Promise<{ invitationId?: string } | void> {
      switch (intent.intent) {
        case "update": {
          const { intent: _i, ...patch } = intent;
          return this.update(projectId, patch);
        }
        case "delete":
          return this.softDelete(projectId);
        case "restore":
          return this.restore(projectId);
        case "leave":
          return this.leave(projectId);
        case "invite":
          return this.invite(projectId, intent.email, intent.role);
        case "revoke-invite":
          return this.revokeInvite(projectId, intent.invitationId);
        case "set-role":
          return this.setRole(projectId, intent.userId, intent.role);
        case "remove-member":
          return this.removeMember(projectId, intent.userId);
      }
    },
  };
}

export type ProjectsService = ReturnType<typeof projectsService>;

/**
 * Cron: 7 günden uzun süredir silinmiş projeleri kalıcı siler — notlar (ekler R2'den),
 * görevler, sürümler, üyelikler ve davetler. Silinen proje sayısını döner.
 */
export async function purgeDeletedProjectsOlderThanRetention(
  env: { DB: D1Database; FILES?: R2Bucket },
  now: Date,
): Promise<number> {
  const db = createDb(env.DB);
  const cutoff = new Date(now.getTime() - PROJECT_RETENTION_MS);
  const due = await db
    .select({ id: projects.id })
    .from(projects)
    .where(lte(projects.deletedAt, cutoff));
  for (const { id } of due) {
    const noteRows = await db.select({ id: notes.id }).from(notes).where(eq(notes.projectId, id));
    await deleteNotes(
      db,
      noteRows.map((n) => n.id),
      env.FILES,
    );
    await db.batch([
      db.delete(invitations).where(eq(invitations.projectId, id)),
      db.delete(projectMembers).where(eq(projectMembers.projectId, id)),
      db.delete(projects).where(eq(projects.id, id)),
    ]);
  }
  return due.length;
}

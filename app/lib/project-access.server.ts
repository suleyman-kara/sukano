/**
 * Proje üyeliği ve rol denetimi: her proje ve proje notu isteği buradan geçer
 * (PLAN §6 Güvenlik). Üye olmayan için proje "yok"tur (404; varlığı sızmaz),
 * üye ama rolü yetmiyorsa 403.
 */
import { and, eq } from "drizzle-orm";
import type { Database } from "~/db/client";
import { projectMembers, projects, type ProjectRole } from "~/db/schema";
import { can, MESSAGES, type ProjectAction, type RuleCode } from "~/domain/projects/permissions";

export class ProjectNotFoundError extends Error {
  constructor() {
    super("Proje bulunamadı");
  }
}

export class InvitationNotFoundError extends Error {
  constructor() {
    super("Davet bulunamadı");
  }
}

/** Üye ama rolü bu işleme yetmiyor (rota 403 döner). */
export class ForbiddenError extends Error {
  constructor(message: string = MESSAGES.yetkiYok) {
    super(message);
  }
}

/** Proje kuralı ihlali (son yönetici, davet edilebilirlik …); rota 409 + `code` döner. */
export class ProjectRuleError extends Error {
  constructor(
    readonly code: RuleCode,
    message: string,
  ) {
    super(message);
  }
}

export type ProjectRow = typeof projects.$inferSelect;

/**
 * Kullanıcının projedeki rolü. Üye değilse ya da proje silinmişse (ve
 * `includeDeleted` verilmemişse) `ProjectNotFoundError`.
 */
export async function memberRole(
  db: Database,
  userId: string,
  projectId: string,
  { includeDeleted = false } = {},
): Promise<{ project: ProjectRow; role: ProjectRole }> {
  const row = await db
    .select({ project: projects, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .get();
  if (!row || (row.project.deletedAt && !includeDeleted)) throw new ProjectNotFoundError();
  return row;
}

/** Rol bu eylemi yapamıyorsa `ForbiddenError`. */
export function assertCan(role: ProjectRole, action: ProjectAction, message?: string) {
  if (!can(role, action)) throw new ForbiddenError(message);
}

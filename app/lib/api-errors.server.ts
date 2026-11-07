/**
 * API rotalarının ortak hata eşlemesi. Beklenen hatalar `{ ok: false, error, code? }`
 * gövdeli yanıta çevrilir; diğerleri fırlatılır (500).
 *
 * | Hata                                   | Durum |
 * | -------------------------------------- | ----- |
 * | `NoteNotFoundError`                    | 404   |
 * | `ProjectNotFoundError`, `InvitationNotFoundError` | 404 |
 * | `ForbiddenError`                       | 403   |
 * | `NoteConflictError`, `TaskOpError`     | 409   |
 * | `ProjectRuleError` (`code` ile)        | 409   |
 */
import { data } from "react-router";
import { TaskOpError } from "~/domain/tasks/ops";
import type { RuleCode } from "~/domain/projects/permissions";
import { NoteConflictError } from "./note-store.server";
import { NoteNotFoundError } from "./notes.server";
import {
  ForbiddenError,
  InvitationNotFoundError,
  ProjectNotFoundError,
  ProjectRuleError,
} from "./project-access.server";

export type ApiFailure = { ok: false; error: string; code?: RuleCode };

export const fail = (error: string, status: number, code?: RuleCode) =>
  data<ApiFailure>({ ok: false, error, ...(code ? { code } : {}) }, { status });

/** Beklenen hatayı yanıta çevirir; beklenmeyeni yeniden fırlatır. */
export function apiError(error: unknown) {
  if (error instanceof NoteNotFoundError) return fail("Not bulunamadı", 404);
  if (error instanceof ProjectNotFoundError || error instanceof InvitationNotFoundError)
    return fail(error.message, 404);
  if (error instanceof ForbiddenError) return fail(error.message, 403);
  if (error instanceof ProjectRuleError) return fail(error.message, 409, error.code);
  if (error instanceof NoteConflictError || error instanceof TaskOpError)
    return fail(error.message, 409);
  throw error;
}

/** Loader'larda: beklenen hata durum koduyla fırlatılır (gövdesiz). */
export function loaderError(error: unknown): never {
  if (error instanceof NoteNotFoundError || error instanceof ProjectNotFoundError)
    throw data(null, { status: 404 });
  if (error instanceof ForbiddenError) throw data(null, { status: 403 });
  throw error;
}

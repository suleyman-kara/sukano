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

/** Beklenen hata: durum kodu ve gövde. Beklenmeyen hatada null. */
export type ExpectedFailure = { status: number; error: string; code?: RuleCode };

/**
 * Hatayı durum koduna eşler (yanıt üretmeden). Durable Object RPC'si gibi hata sınıfının
 * korunmadığı sınırlarda sonuç nesnesi olarak taşınır.
 */
export function expectedFailure(error: unknown): ExpectedFailure | null {
  if (error instanceof NoteNotFoundError) return { status: 404, error: "Not bulunamadı" };
  if (error instanceof ProjectNotFoundError || error instanceof InvitationNotFoundError)
    return { status: 404, error: error.message };
  if (error instanceof ForbiddenError) return { status: 403, error: error.message };
  if (error instanceof ProjectRuleError)
    return { status: 409, error: error.message, code: error.code };
  if (error instanceof NoteConflictError || error instanceof TaskOpError)
    return { status: 409, error: error.message };
  return null;
}

/** Beklenen hatayı yanıta çevirir; beklenmeyeni yeniden fırlatır. */
export function apiError(error: unknown) {
  const f = expectedFailure(error);
  if (!f) throw error;
  return fail(f.error, f.status, f.code);
}

/** Loader'larda: beklenen hata durum koduyla fırlatılır (gövdesiz). */
export function loaderError(error: unknown): never {
  if (error instanceof NoteNotFoundError || error instanceof ProjectNotFoundError)
    throw data(null, { status: 404 });
  if (error instanceof ForbiddenError) throw data(null, { status: 403 });
  throw error;
}

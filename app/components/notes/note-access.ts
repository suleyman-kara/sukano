import type { Assignable } from "~/components/tasks/person-picker";
import type { ProjectColor, ProjectRole } from "~/db/schema";

/** Açık notun projesi (kişisel notta yok). */
export type NoteProject = { id: string; name: string; color: ProjectColor };

/** "Taşı veya kopyala…" / "Kopyala…" hedefi: üyesi olunan proje ve oradaki rol. */
export type MoveTarget = NoteProject & { role: ProjectRole };

/** Notun alanı ve kullanıcının oradaki yetkisi (sunucu her istekte yine denetler). */
export type NoteAccessInfo =
  | { kind: "personal" }
  | { kind: "project"; project: NoteProject; role: ProjectRole; members: Assignable[] };

export const PERSONAL_ACCESS: NoteAccessInfo = { kind: "personal" };

/** Not düzenlenebilir mi (kişisel not ya da yönetici / düzenleyici)? */
export const canWriteNote = (access: NoteAccessInfo) =>
  access.kind === "personal" || access.role !== "goruntuleyici";

/** Hedef projeye not eklenebilir mi (görüntüleyici ekleyemez)? */
export const canAddTo = (target: MoveTarget) => target.role !== "goruntuleyici";

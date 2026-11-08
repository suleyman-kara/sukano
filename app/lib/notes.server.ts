/**
 * Not D1 sorguları, alan ("scope") bazında: kişisel alan (`owner_user_id`) ya da
 * proje (`project_id`). Aynı makine iki alanda da çalışır (PLAN §1: projede her şey
 * ortak — sıralama, sabitleme, renk, arşiv, çöp).
 *
 * - Alan dışındaki ya da olmayan not `NoteNotFoundError` (rota 404).
 * - Proje alanında her işlem rol × eylem matrisinden geçer (`can`); rol yetmiyorsa
 *   `ForbiddenError` (rota 403). Proje üyeliği alan kurulurken denetlenir
 *   (`note-access.server.ts`).
 */
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import { createDb, type Database } from "~/db/client";
import {
  attachments,
  noteVersions,
  notes,
  projectMembers,
  projects,
  reminders,
  taskAssignees,
  tasks,
  user,
  type NoteColor,
  type ProjectColor,
  type ProjectRole,
} from "~/db/schema";
import { htmlToText } from "~/domain/notes/html";
import {
  CARD_TASK_LIMIT,
  type CardTask,
  type NoteCardData,
  type NoteView,
} from "~/domain/notes/optimistic";
import { planMove, topPosition } from "~/domain/notes/ordering";
import { matchesQuery, normalizeTr, queryTerms } from "~/domain/notes/search";
import type { NoteIntent } from "~/domain/notes/validation";
import { can, type ProjectAction } from "~/domain/projects/permissions";
import { ATTACHMENT_BLOCK_MESSAGE, todoSnapshot, type TodoSnapshot } from "~/domain/tasks/convert";
import { treeOrder, type Task } from "~/domain/tasks/model";
import {
  loadTasks,
  NoteConflictError,
  runBatch,
  taskWriteOps,
  versionWriteOps,
  type Batch,
} from "./note-store.server";
import {
  copyAttachments,
  noteAttachments,
  toInfo,
  type AttachmentInfo,
} from "./attachment-store.server";
import { avatarColorFor } from "./avatar";
import { ForbiddenError } from "./project-access.server";

export { NoteConflictError };

/** Notun alanı. Proje alanında rol, üyelik denetimiyle birlikte belirlenir. */
export type NoteScope =
  { kind: "personal" } | { kind: "project"; projectId: string; role: ProjectRole };

export const PERSONAL: NoteScope = { kind: "personal" };

/** Alanın sütun filtresi. */
export function scopeFilter(scope: NoteScope, userId: string): SQL {
  return scope.kind === "personal"
    ? eq(notes.ownerUserId, userId)
    : eq(notes.projectId, scope.projectId);
}

/** Yeni notun alan sütunları. */
export function scopeColumns(scope: NoteScope, userId: string) {
  return scope.kind === "personal"
    ? { ownerUserId: userId, projectId: null }
    : { ownerUserId: null, projectId: scope.projectId };
}

/** Proje alanında rol bu eylemi yapamıyorsa `ForbiddenError`; kişisel alanda her şey serbest. */
export function assertScope(scope: NoteScope, action: ProjectAction) {
  if (scope.kind === "project" && !can(scope.role, action)) throw new ForbiddenError();
}

/** Proje notunda oluşturan / son düzenleyen. Kişi silinmişse `null` ("Silinmiş kullanıcı"). */
export type NotePerson = { id: string; name: string; avatarColor: string | null };

export class NoteNotFoundError extends Error {
  constructor() {
    super("Not bulunamadı");
  }
}

export { CARD_TASK_LIMIT };
/** "Kopyasını oluştur" geri alınabilir süre (sn); bu süreden sonra `discard` reddedilir. */
const DISCARD_WINDOW_MS = 2 * 60 * 1000;
const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const SEARCH_LIMIT = 100;

export type VersionSnapshot = { html: string; text: string };

export type DetailTask = { id: string; title: string; done: boolean; depth: number };

export type NoteDetail = {
  id: string;
  kind: "text" | "todo";
  title: string;
  color: NoteColor;
  pinned: boolean;
  bodyHtml: string;
  /** Üst seviye görevler (Aşama 1 salt okunur görünüm). */
  tasks: DetailTask[];
  /** Yapılacaklar notunun tüm görev ağacı (düz liste, ağaç sırasında); metin notunda boş. */
  todoTasks: Task[];
  /** Ek sayısı (eki olan metin notu yapılacaklara dönüştürülemez). */
  attachmentCount: number;
  /** Metin notunun ekleri, eklenme sırasıyla (yapılacaklarda boş). */
  attachments?: AttachmentInfo[];
  /** Proje kimliği (kişisel notta null). */
  projectId: string | null;
  /** Oluşturan ve son düzenleyen; kişi silinmişse null → "Silinmiş kullanıcı". */
  createdBy: NotePerson | null;
  updatedBy: NotePerson | null;
  /** Görev kimliği → atanan kullanıcı kimlikleri (yalnızca proje notunda dolu). */
  assignees: Record<string, string[]>;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  trashedAt: string | null;
};

export type VersionListItem = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  authorName: string | null;
  authorColor: string | null;
  current: boolean;
};

export type VersionPreview = {
  id: string;
  title: string;
  html: string;
  updatedAt: string;
  /** Yapılacaklar sürümünde görev ağacı (önizleme için). */
  tasks?: Task[];
};

export type SearchResult = {
  id: string;
  kind: "text" | "todo";
  color: NoteColor;
  title: string;
  /** Eşleşmenin bulunduğu metin (gövde ya da görev başlığı). */
  text: string;
  /** Eşleşme bir görev başlığındaysa true. */
  inTask: boolean;
  archived: boolean;
  /** Kaynak: kişisel alan ya da proje (birleşik aramada; alan aramasında da dolu). */
  source: SearchSource;
};

export type SearchSource =
  { kind: "personal" } | { kind: "project"; projectId: string; name: string; color: ProjectColor };

export const bodyTextOf = (title: string, html: string) =>
  [title.trim(), htmlToText(html)].filter(Boolean).join("\n");

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function viewFilter(view: NoteView): SQL {
  switch (view) {
    case "notlar":
      return and(isNull(notes.trashedAt), isNull(notes.archivedAt))!;
    case "arsiv":
      return and(isNull(notes.trashedAt), isNotNull(notes.archivedAt))!;
    case "cop":
      return isNotNull(notes.trashedAt);
  }
}

/** Kişisel not işlemleri; `userId` oturumdaki kullanıcıdır. */
export function personalNotes(
  env: { DB: D1Database; FILES?: R2Bucket },
  userId: string,
  clock: () => Date = () => new Date(),
) {
  return scopedNotes(env, userId, PERSONAL, clock);
}

/**
 * Bir alandaki not işlemleri. Proje alanı için `scope` üyelik denetiminden sonra
 * kurulmalıdır (`noteAccess(...).forProject/forNote`).
 */
export function scopedNotes(
  env: { DB: D1Database; FILES?: R2Bucket },
  userId: string,
  scope: NoteScope,
  clock: () => Date = () => new Date(),
) {
  const db = createDb(env.DB);
  const inScope = scopeFilter(scope, userId);
  const mine = (id: string) => and(eq(notes.id, id), inScope)!;
  const need = (action: ProjectAction) => assertScope(scope, action);

  async function owned(id: string) {
    const row = await db.select().from(notes).where(mine(id)).get();
    if (!row) throw new NoteNotFoundError();
    return row;
  }

  async function person(id: string | null): Promise<NotePerson | null> {
    if (!id) return null;
    const u = await db
      .select({ id: user.id, name: user.name, avatarColor: user.avatarColor })
      .from(user)
      .where(eq(user.id, id))
      .get();
    return u ?? null;
  }

  async function versionRow(id: string, versionId: string) {
    await owned(id);
    const v = await db
      .select()
      .from(noteVersions)
      .where(and(eq(noteVersions.id, versionId), eq(noteVersions.noteId, id)))
      .get();
    if (!v) throw new NoteNotFoundError();
    return v;
  }

  async function attachmentCount(id: string) {
    const r = await db
      .select({ n: count() })
      .from(attachments)
      .where(eq(attachments.noteId, id))
      .get();
    return r?.n ?? 0;
  }

  async function allPositions(): Promise<number[]> {
    const rows = await db
      .select({ position: notes.position })
      .from(notes)
      .where(and(inScope, isNull(notes.trashedAt), isNull(notes.archivedAt)));
    return rows.map((r) => r.position);
  }

  /** Not içeriği değiştiğinde sürüm penceresine göre sürüm yazma adımları. */
  function versionOps(
    noteId: string,
    kind: "text" | "todo",
    title: string,
    snapshot: VersionSnapshot | TodoSnapshot,
    now: Date,
    forceNew = false,
  ): Promise<Batch> {
    return versionWriteOps(db, userId, noteId, kind, title, snapshot, now, forceNew);
  }

  async function cardTasks(noteIds: string[]) {
    const byNote = new Map<string, { tasks: CardTask[]; total: number }>();
    if (noteIds.length === 0) return byNote;
    const rows = await db
      .select({
        id: tasks.id,
        noteId: tasks.noteId,
        title: tasks.title,
        completedAt: tasks.completedAt,
      })
      .from(tasks)
      .where(and(inArray(tasks.noteId, noteIds), isNull(tasks.parentId)))
      .orderBy(asc(tasks.noteId), asc(tasks.position));
    for (const r of rows) {
      const entry = byNote.get(r.noteId) ?? { tasks: [], total: 0 };
      entry.total++;
      if (!r.completedAt && entry.tasks.length < CARD_TASK_LIMIT) {
        entry.tasks.push({ id: r.id, title: r.title, done: false });
      }
      byNote.set(r.noteId, entry);
    }
    if (scope.kind === "project") await attachCardAssignees([...byNote.values()]);
    return byNote;
  }

  /** Proje notu kartlarında görünen görevlere atananların ad ve rengi. */
  async function attachCardAssignees(entries: { tasks: CardTask[] }[]) {
    const shown = entries.flatMap((e) => e.tasks);
    const ids = shown.flatMap((t) => (t.id ? [t.id] : []));
    if (ids.length === 0) return;
    const rows = await db
      .select({
        taskId: taskAssignees.taskId,
        id: user.id,
        name: user.name,
        color: user.avatarColor,
      })
      .from(taskAssignees)
      .innerJoin(user, eq(user.id, taskAssignees.userId))
      .where(inArray(taskAssignees.taskId, ids))
      .orderBy(asc(taskAssignees.createdAt), asc(taskAssignees.userId));
    const byTask = new Map<string, { id: string; name: string; color: string }[]>();
    for (const r of rows) {
      const list = byTask.get(r.taskId) ?? [];
      list.push({ id: r.id, name: r.name, color: r.color ?? avatarColorFor(r.id) });
      byTask.set(r.taskId, list);
    }
    for (const t of shown) {
      const people = t.id ? byTask.get(t.id) : undefined;
      if (people) t.assignees = people;
    }
  }

  /** Kart ekleri: not başına ilk görsel (kapak) ve ek sayısı. */
  async function cardAttachments(ids: string[]) {
    const out = new Map<string, { cover: { id: string; name: string } | null; count: number }>();
    for (let i = 0; i < ids.length; i += 50) {
      const rows = await db
        .select({
          id: attachments.id,
          noteId: attachments.noteId,
          name: attachments.name,
          contentType: attachments.contentType,
        })
        .from(attachments)
        .where(inArray(attachments.noteId, ids.slice(i, i + 50)))
        .orderBy(asc(attachments.createdAt), asc(attachments.id));
      for (const r of rows) {
        const e = out.get(r.noteId) ?? { cover: null, count: 0 };
        e.count++;
        if (!e.cover && r.contentType.startsWith("image/")) e.cover = { id: r.id, name: r.name };
        out.set(r.noteId, e);
      }
    }
    return out;
  }

  return {
    /** Görünümdeki notlar (Notlar: konuma göre; Arşiv: konuma göre; Çöp: en son atılan önce). */
    async list(view: NoteView): Promise<NoteCardData[]> {
      need("note.read");
      const rows = await db
        .select({
          id: notes.id,
          kind: notes.kind,
          title: notes.title,
          color: notes.color,
          pinned: notes.pinned,
          position: notes.position,
          bodyHtml: notes.bodyHtml,
          updatedAt: notes.updatedAt,
          archivedAt: notes.archivedAt,
          trashedAt: notes.trashedAt,
        })
        .from(notes)
        .where(and(inScope, viewFilter(view)))
        .orderBy(
          ...(view === "cop" ? [desc(notes.trashedAt)] : []),
          asc(notes.position),
          asc(notes.createdAt),
        );
      const taskMap = await cardTasks(rows.filter((r) => r.kind === "todo").map((r) => r.id));
      const fileMap = await cardAttachments(rows.filter((r) => r.kind === "text").map((r) => r.id));
      return rows.map((r) => {
        const t = taskMap.get(r.id);
        const f = fileMap.get(r.id);
        return {
          id: r.id,
          kind: r.kind,
          title: r.title,
          color: r.color,
          pinned: r.pinned,
          position: r.position,
          preview: htmlToText(r.bodyHtml),
          tasks: t?.tasks ?? [],
          moreTasks: t ? t.total - t.tasks.length : 0,
          ...(f ? { cover: f.cover, attachmentCount: f.count } : {}),
          updatedAt: r.updatedAt.toISOString(),
          archivedAt: iso(r.archivedAt),
          trashedAt: iso(r.trashedAt),
        };
      });
    },

    async get(id: string): Promise<NoteDetail> {
      need("note.read");
      const row = await owned(id);
      const todoTasks = row.kind === "todo" ? treeOrder(await loadTasks(db, id)) : [];
      const assignees = row.projectId && row.kind === "todo" ? await loadAssignees(db, id) : {};
      const files = row.kind === "text" ? (await noteAttachments(db, id)).map(toInfo) : [];
      // Aşama 1: yapılacaklar notunun üst seviye görevleri salt okunur gösterilir.
      const detailTasks: DetailTask[] = todoTasks
        .filter((t) => t.parentId === null)
        .map((t) => ({ id: t.id, title: t.title, done: t.completedAt !== null, depth: 0 }));
      return {
        id: row.id,
        kind: row.kind,
        title: row.title,
        color: row.color,
        pinned: row.pinned,
        bodyHtml: row.bodyHtml ?? "",
        tasks: detailTasks,
        todoTasks,
        attachmentCount: files.length,
        attachments: files,
        projectId: row.projectId,
        createdBy: await person(row.createdBy),
        updatedBy: await person(row.updatedBy),
        assignees,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        archivedAt: iso(row.archivedAt),
        trashedAt: iso(row.trashedAt),
      };
    },

    async create(input: {
      id: string;
      title: string;
      bodyHtml: string;
      color: NoteColor;
      pinned: boolean;
    }) {
      need("note.create");
      const now = clock();
      const exists = await db
        .select({ id: notes.id })
        .from(notes)
        .where(eq(notes.id, input.id))
        .get();
      if (exists) throw new NoteNotFoundError();
      const position = topPosition(await allPositions());
      const text = htmlToText(input.bodyHtml);
      const ops: Batch = [
        db.insert(notes).values({
          id: input.id,
          kind: "text",
          ...scopeColumns(scope, userId),
          title: input.title,
          color: input.color,
          pinned: input.pinned,
          position,
          createdBy: userId,
          updatedBy: userId,
          bodyHtml: input.bodyHtml,
          bodyText: bodyTextOf(input.title, input.bodyHtml),
          createdAt: now,
          updatedAt: now,
        }),
      ];
      if (input.title.trim() || text) {
        ops.push(
          db.insert(noteVersions).values({
            noteId: input.id,
            kind: "text",
            title: input.title,
            snapshot: { html: input.bodyHtml, text } satisfies VersionSnapshot,
            authorId: userId,
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
      await runBatch(db, ops);
    },

    /** Başlık ve/veya gövdeyi günceller; içerik değiştiyse sürüm penceresi uygulanır. */
    async update(id: string, patch: { title?: string; bodyHtml?: string }) {
      need("note.edit");
      const row = await owned(id);
      const title = patch.title ?? row.title;
      const bodyHtml =
        row.kind === "text" ? (patch.bodyHtml ?? row.bodyHtml ?? "") : (row.bodyHtml ?? "");
      if (title === row.title && bodyHtml === (row.bodyHtml ?? "")) return;
      const now = clock();
      const ops: Batch = [
        db
          .update(notes)
          .set({
            title,
            bodyHtml: row.kind === "text" ? bodyHtml : row.bodyHtml,
            bodyText: bodyTextOf(title, bodyHtml),
            updatedBy: userId,
            updatedAt: now,
          })
          .where(mine(id)),
      ];
      if (row.kind === "text") {
        ops.push(
          ...(await versionOps(
            id,
            row.kind,
            title,
            { html: bodyHtml, text: htmlToText(bodyHtml) },
            now,
          )),
        );
      } else {
        ops.push(
          ...(await versionOps(id, row.kind, title, todoSnapshot(await loadTasks(db, id)), now)),
        );
      }
      await runBatch(db, ops);
    },

    async setColor(id: string, color: NoteColor) {
      need("note.organize");
      await owned(id);
      await db.update(notes).set({ color, updatedBy: userId }).where(mine(id));
    },

    async setPinned(id: string, pinned: boolean) {
      need("note.organize");
      await owned(id);
      await db.update(notes).set({ pinned, updatedBy: userId }).where(mine(id));
    },

    async archive(id: string) {
      need("note.organize");
      const row = await owned(id);
      if (row.trashedAt) throw new NoteNotFoundError();
      await db.update(notes).set({ archivedAt: clock(), pinned: false }).where(mine(id));
    },

    async unarchive(id: string) {
      need("note.organize");
      await owned(id);
      await db.update(notes).set({ archivedAt: null }).where(mine(id));
    },

    async trash(id: string) {
      need("note.trash");
      await owned(id);
      await db.update(notes).set({ trashedAt: clock() }).where(mine(id));
    },

    async restore(id: string) {
      need("note.trash");
      await owned(id);
      await db.update(notes).set({ trashedAt: null }).where(mine(id));
    },

    /** Yalnızca çöpteki not kalıcı silinir. */
    async deletePermanently(id: string) {
      need("note.deletePermanently");
      const row = await owned(id);
      if (!row.trashedAt) throw new NoteNotFoundError();
      await deleteNotes(db, [id], env.FILES);
    },

    /** Az önce oluşturulan kopyayı geri alır (toast "Geri al"). */
    async discard(id: string) {
      need("note.organize");
      const row = await owned(id);
      if (clock().getTime() - row.createdAt.getTime() > DISCARD_WINDOW_MS)
        throw new NoteNotFoundError();
      await deleteNotes(db, [id], env.FILES);
    },

    /** Alanın çöpünü boşaltır; silinen not sayısını döner. */
    async emptyTrash(): Promise<number> {
      need("note.deletePermanently");
      const rows = await db
        .select({ id: notes.id })
        .from(notes)
        .where(and(inScope, isNotNull(notes.trashedAt)));
      await deleteNotes(
        db,
        rows.map((r) => r.id),
        env.FILES,
      );
      return rows.length;
    },

    /** Aynı alanda kopya: en üste, sabitlenmemiş; görevler kopyalanır, sürümler kopyalanmaz. */
    async duplicate(id: string, newId: string) {
      need("note.organize");
      const row = await owned(id);
      await copyNote(db, row, newId, scope, userId, clock(), env.FILES);
    },

    /** Notu kendi bölümünde (sabitlenmiş / diğerleri) `toIndex` sırasına taşır. */
    async move(id: string, pinned: boolean, toIndex: number) {
      need("note.organize");
      const row = await owned(id);
      if (row.trashedAt || row.pinned !== pinned) throw new NoteNotFoundError();
      const archived = row.archivedAt !== null;
      const section = await db
        .select({ id: notes.id, position: notes.position })
        .from(notes)
        .where(
          and(
            inScope,
            eq(notes.pinned, pinned),
            isNull(notes.trashedAt),
            archived ? isNotNull(notes.archivedAt) : isNull(notes.archivedAt),
          ),
        )
        .orderBy(asc(notes.position), asc(notes.createdAt));
      const { updates } = planMove(section, id, toIndex);
      await runBatch(
        db,
        updates.map((u) => db.update(notes).set({ position: u.position }).where(mine(u.id))),
      );
    },

    /** Alandaki notlarda (başlık, metin, görev başlıkları) Türkçe duyarsız arama (çöp hariç). */
    async search(query: string): Promise<SearchResult[]> {
      need("note.read");
      const sources = new Map<string, SearchSource>();
      if (scope.kind === "project") {
        const p = await db
          .select({ name: projects.name, color: projects.color })
          .from(projects)
          .where(eq(projects.id, scope.projectId))
          .get();
        if (p) sources.set(scope.projectId, { kind: "project", projectId: scope.projectId, ...p });
      }
      return searchNotes(db, inScope, query, sources);
    },

    async listVersions(id: string): Promise<VersionListItem[]> {
      need("note.read");
      await owned(id);
      const rows = await db
        .select({
          id: noteVersions.id,
          title: noteVersions.title,
          createdAt: noteVersions.createdAt,
          updatedAt: noteVersions.updatedAt,
          authorName: user.name,
          authorColor: user.avatarColor,
        })
        .from(noteVersions)
        .leftJoin(user, eq(user.id, noteVersions.authorId))
        .where(eq(noteVersions.noteId, id))
        .orderBy(desc(noteVersions.createdAt), desc(noteVersions.id));
      return rows.map((r, i) => ({
        id: r.id,
        title: r.title,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        authorName: r.authorName,
        authorColor: r.authorColor,
        current: i === 0,
      }));
    },

    async getVersion(id: string, versionId: string): Promise<VersionPreview> {
      need("note.read");
      const v = await versionRow(id, versionId);
      const snap = v.snapshot as Partial<VersionSnapshot & TodoSnapshot> | null;
      return {
        id: v.id,
        title: v.title,
        html: snap?.html ?? "",
        updatedAt: v.updatedAt.toISOString(),
        ...(v.kind === "todo" ? { tasks: snap?.tasks ?? [] } : {}),
      };
    },

    /**
     * Sürümü geri yükler; geri yükleme her zaman yeni bir sürüm olarak kaydedilir.
     * Yapılacaklar sürümünde görev ağacı aynen geri yazılır; sürümün türü notun
     * türünden farklıysa not o türe döner.
     */
    async restoreVersion(id: string, versionId: string) {
      need("version.restore");
      const row = await owned(id);
      const v = await versionRow(id, versionId);
      const now = clock();
      const current = row.kind === "todo" ? await loadTasks(db, id) : [];
      const ops: Batch = [];
      if (v.kind === "todo") {
        if (row.kind === "text" && (await attachmentCount(id)) > 0) {
          throw new NoteConflictError(ATTACHMENT_BLOCK_MESSAGE);
        }
        const restored = (v.snapshot as Partial<TodoSnapshot> | null)?.tasks ?? [];
        ops.push(
          db
            .update(notes)
            .set({
              kind: "todo",
              title: v.title,
              bodyHtml: null,
              bodyJson: null,
              bodyText: bodyTextOf(v.title, ""),
              updatedBy: userId,
              updatedAt: now,
            })
            .where(mine(id)),
          ...taskWriteOps(db, id, current, restored, userId, now),
          ...(await versionOps(id, "todo", v.title, todoSnapshot(restored), now, true)),
        );
      } else {
        const html = (v.snapshot as Partial<VersionSnapshot> | null)?.html ?? "";
        ops.push(
          db
            .update(notes)
            .set({
              kind: "text",
              title: v.title,
              bodyHtml: html,
              bodyText: bodyTextOf(v.title, html),
              updatedBy: userId,
              updatedAt: now,
            })
            .where(mine(id)),
          ...taskWriteOps(db, id, current, [], userId, now),
          ...(await versionOps(id, "text", v.title, { html, text: htmlToText(html) }, now, true)),
        );
      }
      await runBatch(db, ops);
    },

    /** Form eylemini çalıştırır. */
    async run(intent: ScopedNoteIntent): Promise<{ deleted?: number } | void> {
      switch (intent.intent) {
        case "create":
          return this.create(intent);
        case "update":
          return this.update(intent.id, intent);
        case "color":
          return this.setColor(intent.id, intent.color);
        case "pin":
          return this.setPinned(intent.id, intent.pinned);
        case "archive":
          return this.archive(intent.id);
        case "unarchive":
          return this.unarchive(intent.id);
        case "trash":
          return this.trash(intent.id);
        case "restore":
          return this.restore(intent.id);
        case "delete":
          return this.deletePermanently(intent.id);
        case "discard":
          return this.discard(intent.id);
        case "empty-trash":
          return { deleted: await this.emptyTrash() };
        case "duplicate":
          return this.duplicate(intent.id, intent.newId);
        case "move":
          return this.move(intent.id, intent.pinned, intent.toIndex);
        case "restore-version":
          return this.restoreVersion(intent.id, intent.versionId);
      }
    },
  };
}

export type PersonalNotes = ReturnType<typeof personalNotes>;
export type ScopedNotes = ReturnType<typeof scopedNotes>;

/** Alan içi not eylemleri (görev, taşıma ve kopyalama eylemleri ayrı modüllerde). */
export type ScopedNoteIntent = Exclude<
  NoteIntent,
  { intent: "create-todo" | "convert" | "move-to-project" | "undo-move" | "copy-to" }
>;

/** Notun görevlerine atananlar: görev kimliği → kullanıcı kimlikleri. */
export async function loadAssignees(
  db: Database,
  noteId: string,
): Promise<Record<string, string[]>> {
  const rows = await db
    .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId })
    .from(taskAssignees)
    .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
    .where(eq(tasks.noteId, noteId))
    .orderBy(asc(taskAssignees.createdAt), asc(taskAssignees.userId));
  const out: Record<string, string[]> = {};
  for (const r of rows) (out[r.taskId] ??= []).push(r.userId);
  return out;
}

type NoteRow = typeof notes.$inferSelect;

/**
 * Notu `target` alanına yeni not olarak kopyalar: en üste, sabitlenmemiş; görev ağacı
 * kopyalanır, sürüm geçmişi kopyalanmaz (metin notunda ilk sürüm yazılır). Atamalar
 * yalnızca hedef proje alanındaysa ve atanan hedef projenin üyesiyse taşınır
 * (kişisel alanda atama yoktur). Metin notunun ekleri R2'de yeni anahtarlara kopyalanır
 * (`files` verilirse).
 */
export async function copyNote(
  db: Database,
  row: NoteRow,
  newId: string,
  target: NoteScope,
  userId: string,
  now: Date,
  files?: R2Bucket,
) {
  const exists = await db.select({ id: notes.id }).from(notes).where(eq(notes.id, newId)).get();
  if (exists) throw new NoteNotFoundError();
  const positions = await db
    .select({ position: notes.position })
    .from(notes)
    .where(and(scopeFilter(target, userId), isNull(notes.trashedAt), isNull(notes.archivedAt)));
  const ops: Batch = [
    db.insert(notes).values({
      id: newId,
      kind: row.kind,
      ...scopeColumns(target, userId),
      title: row.title,
      color: row.color,
      pinned: false,
      position: topPosition(positions.map((p) => p.position)),
      createdBy: userId,
      updatedBy: userId,
      bodyHtml: row.bodyHtml,
      bodyJson: row.bodyJson,
      bodyText: row.bodyText,
      createdAt: now,
      updatedAt: now,
    }),
  ];
  if (row.kind === "todo") {
    const all = await db.select().from(tasks).where(eq(tasks.noteId, row.id));
    const ids = new Map(all.map((t) => [t.id, crypto.randomUUID()]));
    const byId = new Map(all.map((t) => [t.id, t]));
    const depth = (t: (typeof all)[number]): number => {
      let d = 0;
      for (let p = t.parentId; p; p = byId.get(p)?.parentId ?? null) d++;
      return d;
    };
    for (const t of [...all].sort((a, b) => depth(a) - depth(b))) {
      ops.push(
        db.insert(tasks).values({
          ...t,
          id: ids.get(t.id)!,
          noteId: newId,
          parentId: t.parentId ? ids.get(t.parentId)! : null,
          createdBy: userId,
          updatedBy: userId,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    if (target.kind === "project" && row.projectId && all.length) {
      const members = new Set(
        (
          await db
            .select({ userId: projectMembers.userId })
            .from(projectMembers)
            .where(eq(projectMembers.projectId, target.projectId))
        ).map((m) => m.userId),
      );
      const assigned = await loadAssignees(db, row.id);
      for (const [taskId, users] of Object.entries(assigned)) {
        for (const u of users.filter((x) => members.has(x))) {
          ops.push(
            db
              .insert(taskAssignees)
              .values({ taskId: ids.get(taskId)!, userId: u, assignedBy: userId, createdAt: now }),
          );
        }
      }
    }
  } else if (row.title.trim() || row.bodyText) {
    ops.push(
      db.insert(noteVersions).values({
        noteId: newId,
        kind: row.kind,
        title: row.title,
        snapshot: {
          html: row.bodyHtml ?? "",
          text: htmlToText(row.bodyHtml),
        } satisfies VersionSnapshot,
        authorId: userId,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }
  await runBatch(db, ops);
  if (files && row.kind === "text") await copyAttachments(db, files, row.id, newId, userId, now);
}

/**
 * Arama çekirdeği: `where` ile sınırlanan (çöp hariç) notlarda başlık, metin ve görev
 * başlıklarında Türkçe duyarsız eşleşme. `sources`: proje kimliği → kaynak bilgisi.
 */
async function searchNotes(
  db: Database,
  where: SQL,
  query: string,
  sources: ReadonlyMap<string, SearchSource>,
): Promise<SearchResult[]> {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const rows = await db
    .select({
      id: notes.id,
      kind: notes.kind,
      color: notes.color,
      title: notes.title,
      bodyHtml: notes.bodyHtml,
      archivedAt: notes.archivedAt,
      projectId: notes.projectId,
    })
    .from(notes)
    .where(and(where, isNull(notes.trashedAt)))
    .orderBy(desc(notes.updatedAt));
  const todoIds = rows.filter((r) => r.kind === "todo").map((r) => r.id);
  const taskRows: { noteId: string; title: string }[] = [];
  for (let i = 0; i < todoIds.length; i += 50) {
    taskRows.push(
      ...(await db
        .select({ noteId: tasks.noteId, title: tasks.title })
        .from(tasks)
        .where(inArray(tasks.noteId, todoIds.slice(i, i + 50)))
        .orderBy(asc(tasks.position))),
    );
  }
  const results: SearchResult[] = [];
  for (const r of rows) {
    const body = htmlToText(r.bodyHtml);
    const taskTitles = taskRows.filter((t) => t.noteId === r.id).map((t) => t.title);
    const all = [r.title, body, ...taskTitles].join("\n");
    if (!matchesQuery(all, query)) continue;
    const hits = (s: string) => terms.some((t) => normalizeTr(s).includes(t));
    const task = !hits(body) ? taskTitles.find(hits) : undefined;
    const source: SearchSource = r.projectId
      ? (sources.get(r.projectId) ?? {
          kind: "project",
          projectId: r.projectId,
          name: "",
          color: "yesil",
        })
      : { kind: "personal" };
    results.push({
      id: r.id,
      kind: r.kind,
      color: r.color,
      title: r.title,
      text: task ?? body,
      inTask: task !== undefined,
      archived: r.archivedAt !== null,
      source,
    });
    if (results.length >= SEARCH_LIMIT) break;
  }
  return results;
}

/**
 * Birleşik arama (PLAN §3): kişisel alan + üyesi olunan tüm (silinmemiş) projeler tek
 * listede; her sonuçta kaynak (`source`) belirtilir.
 */
export async function searchAccessible(
  env: { DB: D1Database },
  userId: string,
  query: string,
): Promise<SearchResult[]> {
  const db = createDb(env.DB);
  const mine = await db
    .select({ id: projects.id, name: projects.name, color: projects.color })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projectMembers.userId, userId), isNull(projects.deletedAt)));
  const sources = new Map<string, SearchSource>(
    mine.map((p) => [p.id, { kind: "project", projectId: p.id, name: p.name, color: p.color }]),
  );
  const where = mine.length
    ? or(
        eq(notes.ownerUserId, userId),
        inArray(
          notes.projectId,
          mine.map((p) => p.id),
        ),
      )!
    : eq(notes.ownerUserId, userId);
  return searchNotes(db, where, query, sources);
}

/**
 * Notları kalıcı siler: R2 ekleri, sürümler, görev atamaları, görevler, hatırlatıcılar
 * ve notun kendisi. (Bağlı kayıtlar FK ile zincirleme de silinir; açıkça silmek D1
 * yapılandırmasından bağımsız kalmak içindir.)
 */
export async function deleteNotes(db: Database, ids: string[], files?: R2Bucket) {
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    if (files) {
      const keys = await db
        .select({ key: attachments.r2Key })
        .from(attachments)
        .where(inArray(attachments.noteId, chunk));
      if (keys.length) await files.delete(keys.map((k) => k.key));
    }
    await db.batch([
      db
        .delete(taskAssignees)
        .where(
          inArray(
            taskAssignees.taskId,
            db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.noteId, chunk)),
          ),
        ),
      db.delete(reminders).where(inArray(reminders.noteId, chunk)),
      db.delete(noteVersions).where(inArray(noteVersions.noteId, chunk)),
      db.delete(attachments).where(inArray(attachments.noteId, chunk)),
      db.delete(tasks).where(inArray(tasks.noteId, chunk)),
      db.delete(notes).where(inArray(notes.id, chunk)),
    ]);
  }
}

/**
 * Cron: 7 günden uzun süredir çöpte duran notları — kişisel ve proje notları — ekleri,
 * görevleri ve sürümleriyle kalıcı siler. Silinen not sayısını döner.
 */
export async function purgeExpiredTrash(
  env: { DB: D1Database; FILES?: R2Bucket },
  now: Date,
  { onDeleted }: PurgeHooks = {},
) {
  const db = createDb(env.DB);
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_MS);
  const rows = await db.select({ id: notes.id }).from(notes).where(lte(notes.trashedAt, cutoff));
  const ids = rows.map((r) => r.id);
  await deleteNotes(db, ids, env.FILES);
  if (ids.length) await onDeleted?.(ids);
  return rows.length;
}

/** Kalıcı silme sonrası (ör. not odalarının deposunu boşaltmak için). */
export type PurgeHooks = { onDeleted?: (noteIds: string[]) => Promise<void> };

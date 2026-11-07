/**
 * Sukano veri modeli (D1 / SQLite, Drizzle ORM). Bkz. docs/PLAN.md §6.
 *
 * Kurallar:
 * - Kimlikler metin (UUID, `crypto.randomUUID()`); Better Auth da metin kimlik üretir.
 * - Zaman damgaları milisaniye cinsinden tamsayı (`timestamp_ms` → `Date`).
 * - Takvim tarihleri `YYYY-MM-DD`, saatler `HH:MM` metin (saat dilimsiz; görev tarihi bir gündür).
 * - Sütun adları snake_case, TypeScript alanları camelCase.
 * - Better Auth tabloları (`user`, `session`, `account`, `verification`)
 *   `npx @better-auth/cli generate` (sqlite) çıktısıyla aynı alan adlarını kullanır;
 *   tek ek alan `user.avatarColor` (auth.server.ts içinde `additionalFields`).
 */
import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/* ------------------------------------------------------------------ */
/* Ortak yardımcılar ve sabitler                                       */
/* ------------------------------------------------------------------ */

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull();

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .default(nowMs)
    .$onUpdate(() => new Date())
    .notNull();

const timestamps = () => ({ createdAt: createdAt(), updatedAt: updatedAt() });

/** Proje renkleri (7 koyu ton; `--p-*` belirteçleri). */
export const PROJECT_COLORS = [
  "turuncu",
  "mavi",
  "yesil",
  "pembe",
  "mor",
  "sari",
  "grimavi",
] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

/** Not renkleri (9 pastel + varsayılan; `--n-*` belirteçleri). */
export const NOTE_COLORS = [
  "default",
  "sari",
  "turuncu",
  "pembe",
  "mor",
  "mavi",
  "turkuaz",
  "yesil",
  "kahve",
  "gri",
] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const PROJECT_ROLES = ["yonetici", "duzenleyici", "goruntuleyici"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const INVITATION_STATUSES = [
  "beklemede",
  "kabul_edildi",
  "reddedildi",
  "geri_cekildi",
  "suresi_doldu",
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const NOTE_KINDS = ["text", "todo"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const REMINDER_TARGETS = ["note", "task"] as const;
export type ReminderTarget = (typeof REMINDER_TARGETS)[number];

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const NOTIFICATION_TYPES = [
  "davet",
  "rol_degisti",
  "projeden_cikarildi",
  "proje_silindi",
  "goreve_atandi",
  "hatirlatici",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** `CHECK (kolon IN (...))` kısıtı üretir; enum değerleri D1 tarafında da korunur. */
const inList = (column: AnySQLiteColumn, values: readonly string[]) =>
  sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(", "))})`;

/* ------------------------------------------------------------------ */
/* Better Auth                                                         */
/* ------------------------------------------------------------------ */

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  /** Baş harfli avatar zemin rengi (beyaz metinle ≥ 4,5:1). Boşsa kimlikten türetilir. */
  avatarColor: text("avatar_color"),
  ...timestamps(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    ...timestamps(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_userId_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps(),
  },
  (t) => [index("account_userId_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    ...timestamps(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ------------------------------------------------------------------ */
/* Kullanıcı tercihleri                                                */
/* ------------------------------------------------------------------ */

export type NotificationPrefs = {
  /** Tarayıcı push kanalları; her biri ayrı kapatılabilir. */
  push: { hatirlatici: boolean; goreveAtandi: boolean; davet: boolean };
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  push: { hatirlatici: true, goreveAtandi: true, davet: true },
};

export const userPreferences = sqliteTable(
  "user_preferences",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    theme: text("theme", { enum: THEMES }).default("system").notNull(),
    reduceMotion: integer("reduce_motion", { mode: "boolean" }).default(false).notNull(),
    /** Sol paneldeki kişiye özel proje sırası: proje kimlikleri dizisi. */
    projectOrder: text("project_order", { mode: "json" })
      .$type<string[]>()
      .default(sql`'[]'`)
      .notNull(),
    notificationPrefs: text("notification_prefs", { mode: "json" })
      .$type<NotificationPrefs>()
      .$defaultFn(() => DEFAULT_NOTIFICATION_PREFS)
      .notNull(),
    /** IANA saat dilimi (tarayıcıdan); hatırlatıcı saatleri için. */
    timeZone: text("time_zone").default("Europe/Istanbul").notNull(),
    ...timestamps(),
  },
  (t) => [check("user_preferences_theme_check", inList(t.theme, THEMES))],
);

/* ------------------------------------------------------------------ */
/* Projeler, üyelik, davet                                             */
/* ------------------------------------------------------------------ */

export const projects = sqliteTable(
  "projects",
  {
    id: id(),
    name: text("name").notNull(),
    color: text("color", { enum: PROJECT_COLORS }).default("yesil").notNull(),
    /** İsteğe bağlı simge (emoji); boşsa baş harf gösterilir. */
    emoji: text("emoji"),
    description: text("description"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    /** Dolu ise proje "silinmiş"tir; 7 gün sonra cron kalıcı siler. */
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    index("projects_deleted_at_idx").on(t.deletedAt),
    check("projects_color_check", inList(t.color, PROJECT_COLORS)),
  ],
);

export const projectMembers = sqliteTable(
  "project_members",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: PROJECT_ROLES }).notNull(),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("project_members_user_idx").on(t.userId),
    check("project_members_role_check", inList(t.role, PROJECT_ROLES)),
  ],
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Davet edilen adres (küçük harfe çevrilmiş). Kayıtlı kullanıcı olmalı. */
    email: text("email").notNull(),
    role: text("role", { enum: PROJECT_ROLES }).notNull(),
    status: text("status", { enum: INVITATION_STATUSES }).default("beklemede").notNull(),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    respondedAt: integer("responded_at", { mode: "timestamp_ms" }),
    ...timestamps(),
  },
  (t) => [
    index("invitations_email_status_idx").on(t.email, t.status),
    index("invitations_project_status_idx").on(t.projectId, t.status),
    index("invitations_expires_at_idx").on(t.expiresAt),
    /** Aynı projeye aynı adrese en çok bir bekleyen davet. */
    uniqueIndex("invitations_pending_unique")
      .on(t.projectId, t.email)
      .where(sql`${t.status} = 'beklemede'`),
    check("invitations_role_check", inList(t.role, PROJECT_ROLES)),
    check("invitations_status_check", inList(t.status, INVITATION_STATUSES)),
  ],
);

/* ------------------------------------------------------------------ */
/* Notlar ve görevler                                                  */
/* ------------------------------------------------------------------ */

export const notes = sqliteTable(
  "notes",
  {
    id: id(),
    kind: text("kind", { enum: NOTE_KINDS }).notNull(),
    /** Kişisel not ise sahibi; proje notunda null. */
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
    /** Proje notu ise proje; kişisel notta null. */
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").default("").notNull(),
    color: text("color", { enum: NOTE_COLORS }).default("default").notNull(),
    pinned: integer("pinned", { mode: "boolean" }).default(false).notNull(),
    /** Alan içindeki sıra (küçük önce). Araya ekleme için kesirli (REAL). */
    position: real("position").default(0).notNull(),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    /** Dolu ise çöpte; 7 gün sonra cron kalıcı siler. */
    trashedAt: integer("trashed_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    /** Metin notu gövdesinin kopyası (arama ve kart için). Canlı Yjs belgesi DO'da. */
    bodyHtml: text("body_html"),
    bodyJson: text("body_json", { mode: "json" }).$type<unknown>(),
    /** Arama için düz metin kopyası (başlık + gövde). */
    bodyText: text("body_text").default("").notNull(),
    ...timestamps(),
  },
  (t) => [
    index("notes_owner_list_idx").on(t.ownerUserId, t.trashedAt, t.archivedAt, t.position),
    index("notes_project_list_idx").on(t.projectId, t.trashedAt, t.archivedAt, t.position),
    index("notes_trashed_at_idx").on(t.trashedAt),
    check("notes_kind_check", inList(t.kind, NOTE_KINDS)),
    check("notes_color_check", inList(t.color, NOTE_COLORS)),
    /** Not ya kişisel ya da proje notudur; ikisi birden ya da hiçbiri olamaz. */
    check("notes_scope_check", sql`(${t.ownerUserId} is null) <> (${t.projectId} is null)`),
  ],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: id(),
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    /** Üst görev; null ise üst seviye. Sınırsız derinlik. */
    parentId: text("parent_id").references((): AnySQLiteColumn => tasks.id, {
      onDelete: "cascade",
    }),
    position: real("position").default(0).notNull(),
    title: text("title").default("").notNull(),
    /** Hafif biçimlendirmeli açıklama (HTML). */
    description: text("description"),
    startDate: text("start_date"),
    dueDate: text("due_date"),
    /** İsteğe bağlı saat (`HH:MM`); yalnızca bitiş tarihi varken anlamlı. */
    dueTime: text("due_time"),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    completedBy: text("completed_by").references(() => user.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    index("tasks_note_parent_position_idx").on(t.noteId, t.parentId, t.position),
    index("tasks_parent_idx").on(t.parentId),
    index("tasks_due_date_idx").on(t.dueDate),
  ],
);

export const taskAssignees = sqliteTable(
  "task_assignees",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    assignedBy: text("assigned_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.userId] }),
    index("task_assignees_user_idx").on(t.userId),
  ],
);

/* ------------------------------------------------------------------ */
/* Hatırlatıcılar, ekler, sürümler                                     */
/* ------------------------------------------------------------------ */

export const reminders = sqliteTable(
  "reminders",
  {
    id: id(),
    /** Hedef türü: not düzeyi ya da görev. FK yok (çok biçimli); temizlik uygulamada. */
    targetType: text("target_type", { enum: REMINDER_TARGETS }).notNull(),
    targetId: text("target_id").notNull(),
    /** Notun kimliği (görev hatırlatıcısında görevin notu); silme zincirlemesi ve sorgu için. */
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    at: integer("at", { mode: "timestamp_ms" }).notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    ...timestamps(),
  },
  (t) => [
    /** Cron: gönderilmemiş ve zamanı gelmiş hatırlatıcılar. */
    index("reminders_due_idx").on(t.sentAt, t.at),
    uniqueIndex("reminders_target_unique").on(t.targetType, t.targetId),
    index("reminders_note_idx").on(t.noteId),
    check("reminders_target_type_check", inList(t.targetType, REMINDER_TARGETS)),
  ],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: id(),
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    /** R2 (`FILES`) nesne anahtarı. */
    r2Key: text("r2_key").notNull().unique(),
    name: text("name").notNull(),
    size: integer("size").notNull(),
    contentType: text("content_type").notNull(),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [index("attachments_note_idx").on(t.noteId)],
);

export const noteVersions = sqliteTable(
  "note_versions",
  {
    id: id(),
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: NOTE_KINDS }).notNull(),
    title: text("title").default("").notNull(),
    /** Anlık görüntü: metin notunda gövde (HTML/JSON), yapılacaklarda görev ağacı. */
    snapshot: text("snapshot", { mode: "json" }).$type<unknown>().notNull(),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [index("note_versions_note_created_idx").on(t.noteId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Bildirimler                                                         */
/* ------------------------------------------------------------------ */

export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type", { enum: NOTIFICATION_TYPES }).notNull(),
    /** Türüne göre ek veri (proje adı, not kimliği, rol …). */
    data: text("data", { mode: "json" })
      .$type<Record<string, unknown>>()
      .default(sql`'{}'`)
      .notNull(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    noteId: text("note_id").references(() => notes.id, { onDelete: "set null" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    ...timestamps(),
  },
  (t) => [
    index("notifications_user_read_idx").on(t.userId, t.readAt),
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    check("notifications_type_check", inList(t.type, NOTIFICATION_TYPES)),
  ],
);

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    ...timestamps(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

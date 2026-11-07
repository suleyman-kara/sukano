/**
 * Tohum verisini veritabanına yazar. Veri dışarıdan verilir; tek kaynak test
 * fikstürleridir (`tests/fixtures/hesaplar.ts`, `tests/fixtures/ornek-veri.ts`),
 * uçtan uca testler beklenen içeriği aynı yerden okur. Buradaki tipler o
 * dosyalardaki şekillerle yapısal olarak uyumludur (uygulama kodu testlere bağımlı
 * olmasın diye içe aktarılmaz).
 *
 * Kullanım:
 * - Geliştirme: `npm run db:seed` (bkz. `scripts/seed.ts`).
 * - Workers testleri (migration'lar uygulandıktan sonra):
 *     await seedDatabase(env.DB, { hesaplar, projeler: ornekProjeler,
 *       kisiselAlanlar: ornekKisiselAlanlar });
 *
 * Kimlikler kararlıdır: kullanıcı `user-<anahtar>`, proje ve not kimlikleri
 * fikstürdeki `id`, görevler `<notId>-g<sıra>[-<sıra>…]` (1'den başlar).
 * Varsayılan olarak önce önceki tohum kayıtları silinir; tohum dışı kayıtlara
 * dokunulmaz.
 */
import { hashPassword } from "better-auth/crypto";
import { inArray, or } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { createDb } from "./client";
import {
  account,
  invitations,
  notes,
  projectMembers,
  projects,
  taskAssignees,
  tasks,
  user,
  userPreferences,
  type NoteColor,
  type ProjectColor,
  type ProjectRole,
} from "./schema";

/* Girdi şekilleri (tests/fixtures ile aynı alan adları). */

export type SeedHesap = {
  anahtar: string;
  ad: string;
  eposta: string;
  sifre: string;
  avatarRengi: string;
  epostaDogrulandi: boolean;
};

export type SeedGorev = {
  baslik: string;
  tamamlandi?: boolean;
  tamamlayan?: string;
  aciklama?: string;
  baslangic?: string;
  bitis?: string;
  saat?: string;
  atananlar?: readonly string[];
  altGorevler?: readonly SeedGorev[];
};

type SeedNotOrtak = {
  id: string;
  baslik: string;
  renk: NoteColor;
  sabitlendi?: boolean;
  arsivlendi?: boolean;
  copte?: boolean;
  olusturan: string;
  sonDuzenleyen?: string;
};

export type SeedNot =
  | (SeedNotOrtak & { tur: "text"; metin: string })
  | (SeedNotOrtak & { tur: "todo"; gorevler: readonly SeedGorev[] });

export type SeedProje = {
  id: string;
  ad: string;
  renk: ProjectColor;
  aciklama?: string;
  olusturan: string;
  uyeler: readonly { kisi: string; rol: ProjectRole }[];
  bekleyenDavetler: readonly { eposta: string; rol: ProjectRole; davetEden: string }[];
  notlar: readonly SeedNot[];
};

export type SeedKisiselAlan = { sahip: string; notlar: readonly SeedNot[] };

export type SeedData = {
  /** Anahtar → hesap (ör. `{ suleyman: {...}, ayse: {...} }`). */
  hesaplar: Readonly<Record<string, SeedHesap>>;
  projeler: readonly SeedProje[];
  kisiselAlanlar: readonly SeedKisiselAlan[];
};

/** Tohum kullanıcısının kimliği: `user-suleyman` … */
export const seedUserId = (anahtar: string) => `user-${anahtar}`;

/** Görev kimliği: `seedTaskId("lansman-hazirligi", 2, 1)` → `lansman-hazirligi-g2-1`. */
export const seedTaskId = (noteId: string, ...path: number[]) => `${noteId}-g${path.join("-")}`;

export type SeedOptions = {
  /** Önce önceki tohum kayıtlarını sil (varsayılan: true). */
  reset?: boolean;
};

export type SeedSummary = {
  users: number;
  projects: number;
  notes: number;
  tasks: number;
};

const DAY = 24 * 60 * 60 * 1000;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const textToHtml = (text: string) =>
  text
    .split("\n")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

/** Önceki tohum kayıtlarını siler; bağlı kayıtlar zincirleme silinir. */
export async function clearSeed(d1: D1Database, data: SeedData): Promise<void> {
  const { hesaplar, projeler } = data;
  const db = createDb(d1);
  const keys = Object.keys(hesaplar);
  await db.batch([
    db.delete(projects).where(
      inArray(
        projects.id,
        projeler.map((p) => p.id),
      ),
    ),
    db.delete(user).where(
      or(
        inArray(user.id, keys.map(seedUserId)),
        inArray(
          user.email,
          keys.map((k) => hesaplar[k].eposta),
        ),
      ),
    ),
  ]);
}

export async function seedDatabase(
  d1: D1Database,
  data: SeedData,
  options: SeedOptions = {},
): Promise<SeedSummary> {
  const { hesaplar, projeler, kisiselAlanlar } = data;
  if (options.reset ?? true) await clearSeed(d1, data);

  const db = createDb(d1);
  const now = new Date();
  const ops: BatchItem<"sqlite">[] = [];
  const summary: SeedSummary = { users: 0, projects: 0, notes: 0, tasks: 0 };

  // Kullanıcılar ve şifreli (credential) hesaplar. Şifreler aynıysa bir kez hash'lenir.
  const hashes = new Map<string, string>();
  for (const hesap of Object.values(hesaplar)) {
    if (!hashes.has(hesap.sifre)) hashes.set(hesap.sifre, await hashPassword(hesap.sifre));
    const id = seedUserId(hesap.anahtar);
    ops.push(
      db.insert(user).values({
        id,
        name: hesap.ad,
        email: hesap.eposta,
        emailVerified: hesap.epostaDogrulandi,
        avatarColor: hesap.avatarRengi,
      }),
      db.insert(account).values({
        id: `account-${hesap.anahtar}`,
        userId: id,
        accountId: id,
        providerId: "credential",
        password: hashes.get(hesap.sifre)!,
      }),
    );
    summary.users++;
  }

  const addTasks = (
    noteId: string,
    owner: string,
    list: readonly SeedGorev[],
    parentId: string | null,
    path: number[],
  ) => {
    list.forEach((g, i) => {
      const taskPath = [...path, i + 1];
      const id = seedTaskId(noteId, ...taskPath);
      const done = g.tamamlandi ?? false;
      ops.push(
        db.insert(tasks).values({
          id,
          noteId,
          parentId,
          position: i,
          title: g.baslik,
          description: g.aciklama ? textToHtml(g.aciklama) : null,
          startDate: g.baslangic ?? null,
          dueDate: g.bitis ?? null,
          dueTime: g.saat ?? null,
          completedAt: done ? now : null,
          completedBy: done ? (g.tamamlayan ? seedUserId(g.tamamlayan) : owner) : null,
          createdBy: owner,
          updatedBy: owner,
        }),
      );
      summary.tasks++;
      for (const kisi of g.atananlar ?? []) {
        ops.push(
          db
            .insert(taskAssignees)
            .values({ taskId: id, userId: seedUserId(kisi), assignedBy: owner }),
        );
      }
      if (g.altGorevler) addTasks(noteId, owner, g.altGorevler, id, taskPath);
    });
  };

  const addNote = (
    n: SeedNot,
    position: number,
    scope: { ownerUserId: string } | { projectId: string },
  ) => {
    const createdBy = seedUserId(n.olusturan);
    const text = n.tur === "text" ? n.metin : "";
    ops.push(
      db.insert(notes).values({
        id: n.id,
        kind: n.tur,
        ownerUserId: "ownerUserId" in scope ? scope.ownerUserId : null,
        projectId: "projectId" in scope ? scope.projectId : null,
        title: n.baslik,
        color: n.renk,
        pinned: n.sabitlendi ?? false,
        position,
        archivedAt: n.arsivlendi ? now : null,
        trashedAt: n.copte ? now : null,
        createdBy,
        updatedBy: n.sonDuzenleyen ? seedUserId(n.sonDuzenleyen) : createdBy,
        bodyHtml: n.tur === "text" ? textToHtml(n.metin) : null,
        bodyText: [n.baslik, text].filter(Boolean).join("\n"),
      }),
    );
    summary.notes++;
    if (n.tur === "todo") addTasks(n.id, createdBy, n.gorevler, null, []);
  };

  // Projeler, üyeler, bekleyen davetler, proje notları.
  for (const p of projeler) {
    ops.push(
      db.insert(projects).values({
        id: p.id,
        name: p.ad,
        color: p.renk,
        description: p.aciklama ?? null,
        createdBy: seedUserId(p.olusturan),
      }),
    );
    summary.projects++;
    for (const uye of p.uyeler) {
      ops.push(
        db
          .insert(projectMembers)
          .values({ projectId: p.id, userId: seedUserId(uye.kisi), role: uye.rol }),
      );
    }
    for (const davet of p.bekleyenDavetler) {
      ops.push(
        db.insert(invitations).values({
          id: `invite-${p.id}-${davet.eposta}`,
          projectId: p.id,
          email: davet.eposta.toLowerCase(),
          role: davet.rol,
          invitedBy: seedUserId(davet.davetEden),
          expiresAt: new Date(now.getTime() + 14 * DAY),
        }),
      );
    }
    p.notlar.forEach((n, i) => addNote(n, i, { projectId: p.id }));
  }

  // Kişisel notlar ve proje sırası (fikstürdeki sıra).
  for (const alan of kisiselAlanlar) {
    const ownerUserId = seedUserId(alan.sahip);
    alan.notlar.forEach((n, i) => addNote(n, i, { ownerUserId }));
  }
  for (const anahtar of Object.keys(hesaplar)) {
    const projectOrder = projeler
      .filter((p) => p.uyeler.some((u) => u.kisi === anahtar))
      .map((p) => p.id);
    ops.push(db.insert(userPreferences).values({ userId: seedUserId(anahtar), projectOrder }));
  }

  const [first, ...rest] = ops;
  if (first) await db.batch([first, ...rest]);
  return summary;
}

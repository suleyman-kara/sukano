/**
 * Cron işleri (`wrangler.jsonc` → `triggers.crons: ["* * * * *"]`, dakikada bir).
 * Her iş birbirinden bağımsız çalışır; biri hata verirse diğerleri sürer.
 */
import { purgeExpiredTrash } from "~/lib/notes.server";
import { expirePendingInvitations } from "~/lib/invitations.server";
import { purgeDeletedProjectsOlderThanRetention } from "~/lib/projects.server";
import { purgeNoteRooms } from "~/lib/realtime.server";
import { runReminderJob } from "~/lib/reminders.server";

type Job = (env: Env, now: Date) => Promise<void>;

/**
 * Zamanı gelmiş, gönderilmemiş hatırlatıcıları tam bir kez alır, alıcılara bildirim yazar
 * (not → sahibi ya da proje üyeleri, görev → atananlar ya da kuran); ardından dağıtılmamış
 * tüm bildirimleri (canlı zil + Web Push) dağıtır.
 */
export async function sendDueReminders(env: Env, now: Date): Promise<void> {
  await runReminderJob(env, now);
}

/**
 * 7 günden uzun süredir çöpte duran notları (kişisel ve proje) kalıcı siler (R2 ekleri dahil);
 * not odalarının (NoteRoom) deposu da boşaltılır.
 */
export async function purgeTrashedNotes(env: Env, now: Date): Promise<void> {
  await purgeExpiredTrash(env, now, { onDeleted: (ids) => purgeNoteRooms(env, ids) });
}

/**
 * 7 günden uzun süredir silinmiş durumdaki projeleri notları, ekleri ve sürümleriyle kalıcı
 * siler; notların odaları da boşaltılır.
 */
export async function purgeDeletedProjects(env: Env, now: Date): Promise<void> {
  await purgeDeletedProjectsOlderThanRetention(env, now, {
    onDeleted: (ids) => purgeNoteRooms(env, ids),
  });
}

/** Süresi dolan bekleyen davetleri `suresi_doldu` olarak işaretler. */
export async function expireInvitations(env: Env, now: Date): Promise<void> {
  await expirePendingInvitations(env, now);
}

export const jobs: Record<string, Job> = {
  sendDueReminders,
  purgeTrashedNotes,
  purgeDeletedProjects,
  expireInvitations,
};

export async function runScheduled(controller: ScheduledController, env: Env): Promise<void> {
  const now = new Date(controller.scheduledTime);
  const results = await Promise.allSettled(Object.values(jobs).map((job) => job(env, now)));
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`[cron] ${Object.keys(jobs)[i]} başarısız:`, result.reason);
    }
  });
}

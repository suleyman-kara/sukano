/**
 * Cron işleri (`wrangler.jsonc` → `triggers.crons: ["* * * * *"]`, dakikada bir).
 * Her iş birbirinden bağımsız çalışır; biri hata verirse diğerleri sürer.
 */

type Job = (env: Env, now: Date) => Promise<void>;

/** Zamanı gelmiş, gönderilmemiş hatırlatıcıları gönderir (uygulama içi + push). */
export async function sendDueReminders(_env: Env, _now: Date): Promise<void> {
  // TODO(Aşama 5): reminders.sent_at IS NULL AND at <= now; alıcı kuralı
  // (not → proje üyeleri / sahibi, görev → atananlar ya da kuran), bildirim + Web Push,
  // sent_at = now.
}

/** 7 günden uzun süredir çöpte duran notları kalıcı siler (R2 ekleri dahil). */
export async function purgeTrashedNotes(_env: Env, _now: Date): Promise<void> {
  // TODO(Aşama 1): notes.trashed_at <= now - 7 gün; ekleri FILES'tan sil, notu sil.
}

/** 7 günden uzun süredir silinmiş durumdaki projeleri kalıcı siler. */
export async function purgeDeletedProjects(_env: Env, _now: Date): Promise<void> {
  // TODO(Aşama 3): projects.deleted_at <= now - 7 gün; notlar, ekler (R2), sürümler.
}

/** Süresi dolan bekleyen davetleri `suresi_doldu` olarak işaretler. */
export async function expireInvitations(_env: Env, _now: Date): Promise<void> {
  // TODO(Aşama 3): invitations.status = 'beklemede' AND expires_at <= now.
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

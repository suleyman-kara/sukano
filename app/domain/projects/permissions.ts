/**
 * Proje yetki kuralları (PLAN §2, §4). Saf mantık: sunucu her istekte bu modülle
 * karar verir, arayüz aynı kurallarla düğmeleri gizler/kilitler.
 *
 * - {@link can}: rol × eylem matrisi.
 * - Son yönetici kuralları: kendini indiremez, ayrılamaz (ama projeyi silebilir).
 * - Davet edilebilirlik: hesap yok / doğrulanmamış / zaten üye / bekleyen davet.
 * - Hesap silme: tek yönetici olunan projeler engeldir; onay için e-posta yazılır.
 *
 * Kural fonksiyonları `{ ok: true }` ya da `{ ok: false, code, message }` döner;
 * `message` arayüzde aynen gösterilecek Türkçe metindir (tasarım: Forms, Dialogs2).
 */
import { PROJECT_ROLES, type InvitationStatus, type ProjectRole } from "~/db/schema";
import { isValidEmail, normalizeEmail } from "~/domain/auth/rules";

export const PROJECT_ACTIONS = [
  /** Notları ve üye listesini görmek, aramak, sürüm geçmişini görmek. */
  "note.read",
  "note.create",
  /** Başlık/gövde düzenleme, dönüştürme, görev ekleme/düzenleme. */
  "note.edit",
  /** Sabitleme, renk, sıralama, arşiv, kopyasını oluşturma. */
  "note.organize",
  /** Çöpe atma ve çöpten geri yükleme. */
  "note.trash",
  /** Kalıcı silme ve çöpü boşaltma. */
  "note.deletePermanently",
  /** Proje notunu kişisel alana ya da başka projeye kopyalama ("Kopyala…"). */
  "note.copyOut",
  /** Kişisel notu bu projeye taşıma ya da kopyalama (hedef projedeki rol). */
  "note.moveIn",
  "task.check",
  "task.assign",
  "version.restore",
  /** Ad, renk, simge, açıklama. */
  "project.edit",
  "project.invite",
  /** Rol verme, üye çıkarma, davet geri çekme. */
  "project.manageMembers",
  "project.delete",
  "project.restore",
  "project.leave",
] as const;
export type ProjectAction = (typeof PROJECT_ACTIONS)[number];

const ALL: readonly ProjectRole[] = PROJECT_ROLES;
const WRITERS: readonly ProjectRole[] = ["yonetici", "duzenleyici"];
const MANAGERS: readonly ProjectRole[] = ["yonetici"];

const MATRIX: Record<ProjectAction, readonly ProjectRole[]> = {
  "note.read": ALL,
  "note.create": WRITERS,
  "note.edit": WRITERS,
  "note.organize": WRITERS,
  "note.trash": WRITERS,
  "note.deletePermanently": WRITERS,
  "note.copyOut": WRITERS,
  "note.moveIn": WRITERS,
  "task.check": WRITERS,
  "task.assign": WRITERS,
  "version.restore": WRITERS,
  "project.edit": MANAGERS,
  "project.invite": MANAGERS,
  "project.manageMembers": MANAGERS,
  "project.delete": MANAGERS,
  "project.restore": MANAGERS,
  "project.leave": ALL,
};

/** Rol bu eylemi yapabilir mi? `null`: üye değil. */
export function can(role: ProjectRole | null | undefined, action: ProjectAction): boolean {
  return role ? MATRIX[action].includes(role) : false;
}

const ROLE_LABELS: Record<ProjectRole, string> = {
  yonetici: "Yönetici",
  duzenleyici: "Düzenleyici",
  goruntuleyici: "Görüntüleyici",
};

/** Çipteki rol adı ("Yönetici"); cümle içinde `.toLocaleLowerCase("tr")`. */
export const roleLabel = (role: ProjectRole) => ROLE_LABELS[role];

/** Rol açıklamaları (proje ayarları, davet formu). */
export const ROLE_DESCRIPTIONS: Record<ProjectRole, string> = {
  yonetici: "Notlarda tam yetki, davet, rol verme, üye çıkarma, proje silme.",
  duzenleyici: "Notlarda tam yetki.",
  goruntuleyici: "Okur ve arar; not ekleyemez, görev işaretleyemez.",
};

/* ------------------------------------------------------------------ */
/* Üyelik kuralları                                                     */
/* ------------------------------------------------------------------ */

export type Member = { userId: string; role: ProjectRole };

export type RuleCode =
  | "yetki_yok"
  | "uye_yok"
  | "son_yonetici"
  | "kendini_cikaramaz"
  | "gecersiz_eposta"
  | "hesap_yok"
  | "dogrulanmamis"
  | "zaten_uye"
  | "bekleyen_davet"
  | "davet_yok"
  | "suresi_doldu"
  | "gecersiz_davet"
  | "eposta_uyusmuyor"
  | "tek_yonetici";

export type RuleResult = { ok: true } | { ok: false; code: RuleCode; message: string };

const deny = (code: RuleCode, message: string) => ({ ok: false as const, code, message });
const OK = { ok: true } as const;

export const MESSAGES = {
  yetkiYok: "Bu işlem için yetkin yok.",
  uyeYok: "Bu kişi projenin üyesi değil.",
  sonYoneticiIndirme:
    "Projenin son yöneticisi sensin; kendini indiremezsin. Önce başka bir üyeyi yönetici yap.",
  sonYoneticiAyrilma:
    "Projenin son yöneticisi sensin; bu yüzden ayrılamazsın. Önce Proje ayarlarında başka bir üyeyi yönetici yap ya da projeyi sil.",
  kendiniCikaramaz: "Kendini projeden çıkaramazsın; ayrılmak için Projeden ayrıl'ı kullan.",
  davetYetkisi: "Yalnızca yöneticiler davet gönderebilir.",
  gecersizEposta: "Geçerli bir e-posta adresi yaz.",
  hesapYok: "Bu adresle bir Sukano hesabı yok. Davet edebilmen için önce hesap açması gerekiyor.",
  davetYok: "Davet bulunamadı.",
  suresiDoldu: "Bu davetin süresi doldu.",
  gecersizDavet: "Bu davet artık geçerli değil.",
  epostaUyusmuyor: "Yazdığın e-posta adresi hesabınla eşleşmiyor.",
} as const;

export const managerCount = (members: readonly Member[]) =>
  members.filter((m) => m.role === "yonetici").length;

const roleOf = (members: readonly Member[], userId: string) =>
  members.find((m) => m.userId === userId)?.role ?? null;

/** Kişi projenin tek yöneticisi mi? */
export function isLastManager(members: readonly Member[], userId: string): boolean {
  return roleOf(members, userId) === "yonetici" && managerCount(members) === 1;
}

/** Rol değişikliği: yalnızca yönetici; son yönetici yöneticilikten çıkamaz. */
export function checkRoleChange(
  members: readonly Member[],
  actorId: string,
  targetId: string,
  role: ProjectRole,
): RuleResult {
  if (!can(roleOf(members, actorId), "project.manageMembers"))
    return deny("yetki_yok", MESSAGES.yetkiYok);
  if (!roleOf(members, targetId)) return deny("uye_yok", MESSAGES.uyeYok);
  if (role !== "yonetici" && isLastManager(members, targetId))
    return deny("son_yonetici", MESSAGES.sonYoneticiIndirme);
  return OK;
}

/** Ayrılma: üye olmalı; son yönetici ayrılamaz. */
export function checkLeave(members: readonly Member[], userId: string): RuleResult {
  if (!roleOf(members, userId)) return deny("uye_yok", MESSAGES.uyeYok);
  if (isLastManager(members, userId)) return deny("son_yonetici", MESSAGES.sonYoneticiAyrilma);
  return OK;
}

/** Üye çıkarma: yalnızca yönetici, kendini değil (o ayrılmadır). */
export function checkRemoveMember(
  members: readonly Member[],
  actorId: string,
  targetId: string,
): RuleResult {
  if (!can(roleOf(members, actorId), "project.manageMembers"))
    return deny("yetki_yok", MESSAGES.yetkiYok);
  if (actorId === targetId) return deny("kendini_cikaramaz", MESSAGES.kendiniCikaramaz);
  if (!roleOf(members, targetId)) return deny("uye_yok", MESSAGES.uyeYok);
  return OK;
}

/* ------------------------------------------------------------------ */
/* Davet                                                                */
/* ------------------------------------------------------------------ */

export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type InviteCheckInput = {
  actorRole: ProjectRole | null;
  /** Formda yazılan adres (normalize edilmemiş olabilir). */
  email: string;
  /** Bu adresteki hesap; yoksa null. */
  account: { name: string; emailVerified: boolean } | null;
  isMember: boolean;
  /** Projede bu adrese "beklemede" durumlu davet (süresi geçmiş olabilir). */
  pendingInvite: { expiresAt: Date } | null;
  now: Date;
};

export type InviteCheck =
  { ok: true; email: string; expiresAt: Date } | { ok: false; code: RuleCode; message: string };

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * Davet gönderilebilir mi? Sıra: yetki → adres → hesap → doğrulama → üyelik →
 * bekleyen davet. Süresi geçmiş bekleyen davet engel değildir (sunucu onu
 * `suresi_doldu` yapıp yenisini yazar).
 */
export function checkInvite(input: InviteCheckInput): InviteCheck {
  if (!can(input.actorRole, "project.invite")) return deny("yetki_yok", MESSAGES.davetYetkisi);
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) return deny("gecersiz_eposta", MESSAGES.gecersizEposta);
  const { account } = input;
  if (!account) return deny("hesap_yok", MESSAGES.hesapYok);
  if (!account.emailVerified)
    return deny(
      "dogrulanmamis",
      `${firstName(account.name)} henüz e-postasını doğrulamadı. Doğrulayınca davet edilebilir.`,
    );
  if (input.isMember) return deny("zaten_uye", `${account.name} zaten bu projenin üyesi.`);
  if (input.pendingInvite && input.pendingInvite.expiresAt.getTime() > input.now.getTime())
    return deny("bekleyen_davet", `${account.name} için bekleyen bir davet zaten var.`);
  return { ok: true, email, expiresAt: new Date(input.now.getTime() + INVITE_TTL_MS) };
}

type InviteLike = { email: string; status: InvitationStatus; expiresAt: Date };

/** Etkin durum: süresi geçmiş "beklemede" davet "suresi_doldu" sayılır. */
export function invitationStatus(inv: Omit<InviteLike, "email">, now: Date): InvitationStatus {
  if (inv.status === "beklemede" && inv.expiresAt.getTime() <= now.getTime()) return "suresi_doldu";
  return inv.status;
}

/** Davet yanıtı (kabul/ret): yalnızca davet edilen, yalnızca geçerli davet. */
export function checkRespond(inv: InviteLike, userEmail: string, now: Date): RuleResult {
  if (normalizeEmail(inv.email) !== normalizeEmail(userEmail))
    return deny("davet_yok", MESSAGES.davetYok);
  const status = invitationStatus(inv, now);
  if (status === "suresi_doldu") return deny("suresi_doldu", MESSAGES.suresiDoldu);
  if (status !== "beklemede") return deny("gecersiz_davet", MESSAGES.gecersizDavet);
  return OK;
}

/* ------------------------------------------------------------------ */
/* Hesap silme                                                          */
/* ------------------------------------------------------------------ */

export type Membership = {
  projectId: string;
  projectName: string;
  role: ProjectRole;
  /** Projedeki toplam yönetici sayısı. */
  managerCount: number;
};

/** Kullanıcının tek yönetici olduğu projeler (hesap silme engeli). */
export function soleManagerProjects(memberships: readonly Membership[]) {
  return memberships
    .filter((m) => m.role === "yonetici" && m.managerCount === 1)
    .map((m) => ({ id: m.projectId, name: m.projectName }));
}

/** Hesap silinebilir mi? Önce tek yönetici engeli, sonra yazılan e-posta. */
export function checkAccountDeletion(input: {
  email: string;
  typedEmail: string;
  blockers: readonly { id: string; name: string }[];
}): RuleResult {
  if (input.blockers.length > 0)
    return deny(
      "tek_yonetici",
      `Tek yönetici olduğun projeleri önce devretmen ya da silmen gerekir: ${input.blockers
        .map((b) => b.name)
        .join(", ")}.`,
    );
  if (normalizeEmail(input.typedEmail) !== normalizeEmail(input.email))
    return deny("eposta_uyusmuyor", MESSAGES.epostaUyusmuyor);
  return OK;
}

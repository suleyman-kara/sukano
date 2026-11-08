import { describe, expect, it } from "vitest";
import {
  can,
  checkAccountDeletion,
  checkInvite,
  checkLeave,
  checkRemoveMember,
  checkRespond,
  checkRoleChange,
  invitationStatus,
  INVITE_TTL_MS,
  isLastManager,
  managerCount,
  PROJECT_ACTIONS,
  roleLabel,
  soleManagerProjects,
  type Member,
  type ProjectAction,
} from "~/domain/projects/permissions";
import type { ProjectRole } from "~/db/schema";

const DAY = 86_400_000;
const NOW = new Date("2026-11-07T10:00:00Z");

const members: Member[] = [
  { userId: "suleyman", role: "yonetici" },
  { userId: "ayse", role: "yonetici" },
  { userId: "mehmet", role: "duzenleyici" },
  { userId: "can", role: "goruntuleyici" },
];
const tekYonetici: Member[] = [
  { userId: "suleyman", role: "yonetici" },
  { userId: "ayse", role: "duzenleyici" },
];

describe("rol × eylem matrisi (PLAN §2)", () => {
  const notEylemleri: ProjectAction[] = [
    "note.create",
    "note.edit",
    "note.organize",
    "note.trash",
    "note.deletePermanently",
    "note.copyOut",
    "note.moveIn",
    "task.check",
    "task.assign",
    "version.restore",
  ];
  const yonetim: ProjectAction[] = [
    "project.edit",
    "project.invite",
    "project.manageMembers",
    "project.delete",
    "project.restore",
  ];

  it("yönetici her eylemi yapabilir", () => {
    for (const a of PROJECT_ACTIONS) expect(can("yonetici", a), a).toBe(true);
  });

  it("düzenleyici notlarda yönetici ile aynıdır ama projeyi yönetemez", () => {
    for (const a of notEylemleri) expect(can("duzenleyici", a), a).toBe(true);
    expect(can("duzenleyici", "note.read")).toBe(true);
    for (const a of yonetim) expect(can("duzenleyici", a), a).toBe(false);
  });

  it("görüntüleyici yalnızca okur ve arar; kendisine atanmış görevi bile işaretleyemez", () => {
    expect(can("goruntuleyici", "note.read")).toBe(true);
    for (const a of [...notEylemleri, ...yonetim]) expect(can("goruntuleyici", a), a).toBe(false);
  });

  it("üye olmayan hiçbir şey yapamaz, okuyamaz bile", () => {
    for (const a of PROJECT_ACTIONS) expect(can(null, a), a).toBe(false);
  });

  it("herkes projeden ayrılmayı deneyebilir (son yönetici kuralı ayrıca denetlenir)", () => {
    for (const r of ["yonetici", "duzenleyici", "goruntuleyici"] as ProjectRole[]) {
      expect(can(r, "project.leave")).toBe(true);
    }
  });

  it("rol adları çipte büyük harfle başlar", () => {
    expect(roleLabel("yonetici")).toBe("Yönetici");
    expect(roleLabel("duzenleyici")).toBe("Düzenleyici");
    expect(roleLabel("goruntuleyici")).toBe("Görüntüleyici");
  });
});

describe("son yönetici kuralı", () => {
  it("yönetici sayısı ve son yönetici tespiti", () => {
    expect(managerCount(members)).toBe(2);
    expect(isLastManager(members, "suleyman")).toBe(false);
    expect(isLastManager(tekYonetici, "suleyman")).toBe(true);
    expect(isLastManager(tekYonetici, "ayse")).toBe(false);
  });

  it("son yönetici kendini indiremez", () => {
    const r = checkRoleChange(tekYonetici, "suleyman", "suleyman", "duzenleyici");
    expect(r).toMatchObject({ ok: false, code: "son_yonetici" });
  });

  it("başka yönetici varken yönetici kendini indirebilir", () => {
    expect(checkRoleChange(members, "suleyman", "suleyman", "duzenleyici")).toEqual({ ok: true });
  });

  it("yönetici başka üyeyi yükseltip indirebilir", () => {
    expect(checkRoleChange(members, "suleyman", "can", "duzenleyici")).toEqual({ ok: true });
    expect(checkRoleChange(members, "suleyman", "ayse", "goruntuleyici")).toEqual({ ok: true });
  });

  it("yönetici olmayan rol veremez", () => {
    expect(checkRoleChange(members, "mehmet", "can", "duzenleyici")).toMatchObject({
      ok: false,
      code: "yetki_yok",
    });
  });

  it("üye olmayana rol verilemez", () => {
    expect(checkRoleChange(members, "suleyman", "zeynep", "duzenleyici")).toMatchObject({
      ok: false,
      code: "uye_yok",
    });
  });

  it("son yönetici projeden ayrılamaz; tasarımdaki metin döner", () => {
    const r = checkLeave(tekYonetici, "suleyman");
    expect(r).toEqual({
      ok: false,
      code: "son_yonetici",
      message:
        "Projenin son yöneticisi sensin; bu yüzden ayrılamazsın. Önce Proje ayarlarında başka bir üyeyi yönetici yap ya da projeyi sil.",
    });
  });

  it("diğer üyeler ayrılabilir; üye olmayan ayrılamaz", () => {
    expect(checkLeave(tekYonetici, "ayse")).toEqual({ ok: true });
    expect(checkLeave(members, "suleyman")).toEqual({ ok: true });
    expect(checkLeave(members, "zeynep")).toMatchObject({ ok: false, code: "uye_yok" });
  });

  it("üye çıkarma: yalnızca yönetici, kendini değil, yalnızca üyeyi", () => {
    expect(checkRemoveMember(members, "suleyman", "can")).toEqual({ ok: true });
    expect(checkRemoveMember(members, "suleyman", "ayse")).toEqual({ ok: true });
    expect(checkRemoveMember(members, "mehmet", "can")).toMatchObject({ code: "yetki_yok" });
    expect(checkRemoveMember(members, "suleyman", "suleyman")).toMatchObject({
      code: "kendini_cikaramaz",
    });
    expect(checkRemoveMember(members, "suleyman", "zeynep")).toMatchObject({ code: "uye_yok" });
  });
});

describe("davet edilebilirlik", () => {
  const hesap = { name: "Emre Kaya", emailVerified: true };
  const base = {
    actorRole: "yonetici" as ProjectRole,
    email: "  Emre@Ornek.com ",
    account: hesap,
    isMember: false,
    pendingInvite: null,
    now: NOW,
  };

  it("geçerli davet normalize adres ve 14 gün sonrasını döner", () => {
    expect(checkInvite(base)).toEqual({
      ok: true,
      email: "emre@ornek.com",
      expiresAt: new Date(NOW.getTime() + 14 * DAY),
    });
    expect(INVITE_TTL_MS).toBe(14 * DAY);
  });

  it("yalnızca yönetici davet gönderebilir", () => {
    for (const actorRole of ["duzenleyici", "goruntuleyici"] as ProjectRole[]) {
      expect(checkInvite({ ...base, actorRole })).toMatchObject({ ok: false, code: "yetki_yok" });
    }
  });

  it("geçersiz e-posta reddedilir", () => {
    expect(checkInvite({ ...base, email: "emre@" })).toMatchObject({
      ok: false,
      code: "gecersiz_eposta",
    });
  });

  it("hesap yoksa: önce hesap açması gerekiyor", () => {
    expect(checkInvite({ ...base, account: null })).toEqual({
      ok: false,
      code: "hesap_yok",
      message:
        "Bu adresle bir Sukano hesabı yok. Davet edebilmen için önce hesap açması gerekiyor.",
    });
  });

  it("doğrulanmamış hesap davet alamaz; adın ilk sözcüğüyle söylenir", () => {
    expect(checkInvite({ ...base, account: { ...hesap, emailVerified: false } })).toEqual({
      ok: false,
      code: "dogrulanmamis",
      message: "Emre henüz e-postasını doğrulamadı. Doğrulayınca davet edilebilir.",
    });
  });

  it("zaten üye olan davet edilemez", () => {
    expect(
      checkInvite({
        ...base,
        account: { name: "Mehmet Kaya", emailVerified: true },
        isMember: true,
      }),
    ).toEqual({ ok: false, code: "zaten_uye", message: "Mehmet Kaya zaten bu projenin üyesi." });
  });

  it("geçerli bekleyen daveti olana ikinci davet gönderilemez", () => {
    const r = checkInvite({
      ...base,
      pendingInvite: { expiresAt: new Date(NOW.getTime() + DAY) },
    });
    expect(r).toMatchObject({ ok: false, code: "bekleyen_davet" });
    expect(r.ok ? "" : r.message).toBe("Emre Kaya için bekleyen bir davet zaten var.");
  });

  it("süresi dolmuş bekleyen davet yeni daveti engellemez", () => {
    expect(
      checkInvite({ ...base, pendingInvite: { expiresAt: new Date(NOW.getTime() - 1) } }),
    ).toMatchObject({ ok: true });
  });

  it("kontrol sırası: yetki → adres → hesap → doğrulama → üyelik → bekleyen davet", () => {
    expect(
      checkInvite({ ...base, actorRole: "duzenleyici", email: "x", account: null }),
    ).toMatchObject({ code: "yetki_yok" });
    expect(checkInvite({ ...base, email: "x", account: null })).toMatchObject({
      code: "gecersiz_eposta",
    });
    expect(
      checkInvite({
        ...base,
        account: { ...hesap, emailVerified: false },
        isMember: true,
      }),
    ).toMatchObject({ code: "dogrulanmamis" });
  });
});

describe("davet durumu ve yanıt", () => {
  const davet = {
    email: "ayse@test.sukano",
    status: "beklemede" as const,
    expiresAt: new Date(NOW.getTime() + DAY),
  };

  it("bekleyen ama süresi geçmiş davet 'süresi doldu' sayılır", () => {
    expect(invitationStatus(davet, NOW)).toBe("beklemede");
    expect(invitationStatus({ ...davet, expiresAt: NOW }, NOW)).toBe("suresi_doldu");
    expect(invitationStatus({ ...davet, status: "reddedildi" }, NOW)).toBe("reddedildi");
  });

  it("davet edilen kişi geçerli daveti yanıtlayabilir", () => {
    expect(checkRespond(davet, "AYSE@test.sukano", NOW)).toEqual({ ok: true });
  });

  it("başkasının daveti bulunamadı sayılır", () => {
    expect(checkRespond(davet, "mehmet@test.sukano", NOW)).toMatchObject({
      ok: false,
      code: "davet_yok",
    });
  });

  it("süresi dolan ya da yanıtlanmış davet yanıtlanamaz", () => {
    expect(checkRespond({ ...davet, expiresAt: NOW }, davet.email, NOW)).toMatchObject({
      code: "suresi_doldu",
      message: "Bu davetin süresi doldu.",
    });
    expect(checkRespond({ ...davet, status: "geri_cekildi" }, davet.email, NOW)).toMatchObject({
      code: "gecersiz_davet",
    });
  });
});

describe("hesap silme", () => {
  const uyelikler = [
    { projectId: "ev", projectName: "Ev Taşınma", role: "yonetici" as const, managerCount: 1 },
    { projectId: "web", projectName: "Web", role: "yonetici" as const, managerCount: 2 },
    { projectId: "kitap", projectName: "Kitap", role: "goruntuleyici" as const, managerCount: 1 },
  ];

  it("tek yönetici olunan projeler listelenir", () => {
    expect(soleManagerProjects(uyelikler)).toEqual([{ id: "ev", name: "Ev Taşınma" }]);
  });

  it("tek yönetici olunan proje varsa silme engellenir ve projeler adıyla söylenir", () => {
    expect(
      checkAccountDeletion({
        email: "s@x.com",
        typedEmail: "s@x.com",
        blockers: [{ id: "ev", name: "Ev Taşınma" }],
      }),
    ).toEqual({
      ok: false,
      code: "tek_yonetici",
      message: "Tek yönetici olduğun projeleri önce devretmen ya da silmen gerekir: Ev Taşınma.",
    });
  });

  it("onay için yazılan e-posta eşleşmeli (büyük/küçük harf ve boşluk önemsiz)", () => {
    expect(
      checkAccountDeletion({ email: "s@x.com", typedEmail: "t@x.com", blockers: [] }),
    ).toMatchObject({ ok: false, code: "eposta_uyusmuyor" });
    expect(
      checkAccountDeletion({ email: "s@x.com", typedEmail: " S@X.com ", blockers: [] }),
    ).toEqual({ ok: true });
  });
});

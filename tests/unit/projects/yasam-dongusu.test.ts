import { describe, expect, it } from "vitest";
import {
  canUndoMove,
  inviteExpiryLabel,
  isPurgeDue,
  MOVE_UNDO_GRACE_MS,
  MOVE_UNDO_MS,
  PROJECT_RETENTION_MS,
  purgeDaysLeft,
  purgeLabel,
} from "~/domain/projects/lifecycle";
import { orderProjects, reorderIds, sortMembers } from "~/domain/projects/members";

const DAY = 86_400_000;
const NOW = new Date("2026-11-07T10:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("silinmiş proje bekleme süresi", () => {
  it("proje 7 gün bekler; süre dolunca kalıcı silinir", () => {
    expect(PROJECT_RETENTION_MS).toBe(7 * DAY);
    expect(isPurgeDue(ago(7 * DAY), NOW)).toBe(true);
    expect(isPurgeDue(ago(7 * DAY - 1), NOW)).toBe(false);
  });

  it("kalan gün yukarı yuvarlanır ve 0–7 arasında kalır", () => {
    expect(purgeDaysLeft(NOW, NOW)).toBe(7);
    expect(purgeDaysLeft(ago(2 * DAY), NOW)).toBe(5);
    expect(purgeDaysLeft(ago(6 * DAY + 1), NOW)).toBe(1);
    expect(purgeDaysLeft(ago(30 * DAY), NOW)).toBe(0);
    expect(purgeDaysLeft(new Date(NOW.getTime() + DAY), NOW)).toBe(7);
  });

  it("kalan gün metni: 'n gün kaldı', 'yarın silinecek', 'bugün silinecek'", () => {
    expect(purgeLabel(5)).toBe("5 gün kaldı");
    expect(purgeLabel(2)).toBe("2 gün kaldı");
    expect(purgeLabel(1)).toBe("yarın silinecek");
    expect(purgeLabel(0)).toBe("bugün silinecek");
  });
});

describe("davet geçerlilik metni", () => {
  it("kalan güne göre metin", () => {
    expect(inviteExpiryLabel(new Date(NOW.getTime() + 13 * DAY), NOW)).toBe(
      "13 gün sonra geçersiz",
    );
    expect(inviteExpiryLabel(new Date(NOW.getTime() + 20 * 3_600_000), NOW)).toBe("yarın geçersiz");
    expect(inviteExpiryLabel(NOW, NOW)).toBe("süresi doldu");
  });
});

describe("taşımayı geri alma", () => {
  it("taşıma 10 sn içinde (ağ payıyla) geri alınabilir, sonra kesinleşir", () => {
    expect(MOVE_UNDO_MS).toBe(10_000);
    expect(canUndoMove(ago(9_000), NOW)).toBe(true);
    expect(canUndoMove(ago(MOVE_UNDO_MS + MOVE_UNDO_GRACE_MS), NOW)).toBe(true);
    expect(canUndoMove(ago(MOVE_UNDO_MS + MOVE_UNDO_GRACE_MS + 1), NOW)).toBe(false);
  });
});

describe("üye listesi sırası", () => {
  const uyeler = [
    { userId: "c", name: "Can Yılmaz", role: "goruntuleyici" as const },
    { userId: "z", name: "Zeynep Arslan", role: "duzenleyici" as const },
    { userId: "m", name: "Mehmet Kaya", role: "duzenleyici" as const },
    { userId: "s", name: "Süleyman Kara", role: "yonetici" as const },
    { userId: "a", name: "Ayşe Demir", role: "yonetici" as const },
  ];

  it("sen önce, sonra role göre (yönetici → düzenleyici → görüntüleyici), sonra ada göre", () => {
    expect(sortMembers(uyeler, "z").map((u) => u.userId)).toEqual(["z", "a", "s", "m", "c"]);
  });

  it("Türkçe harfler doğru sıralanır", () => {
    const list = [
      { userId: "1", name: "Şule", role: "duzenleyici" as const },
      { userId: "2", name: "Sena", role: "duzenleyici" as const },
      { userId: "3", name: "Çağla", role: "duzenleyici" as const },
      { userId: "4", name: "Cem", role: "duzenleyici" as const },
    ];
    expect(sortMembers(list, "yok").map((u) => u.name)).toEqual(["Cem", "Çağla", "Sena", "Şule"]);
  });
});

describe("kişiye özel proje sırası", () => {
  const projeler = [
    { id: "a", name: "Ağaç" },
    { id: "b", name: "Bahçe" },
    { id: "c", name: "Çatı" },
    { id: "d", name: "Duvar" },
  ];

  it("sıradakiler o sırayla önce, kalanlar ada göre sonra", () => {
    expect(orderProjects(projeler, ["c", "a", "silinmis"]).map((p) => p.id)).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("sürükleme yeni sırayı verir (arrayMove anlamı)", () => {
    expect(reorderIds(["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(reorderIds(["a", "b", "c", "d"], "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(reorderIds(["a", "b"], "x", 0)).toEqual(["a", "b"]);
    expect(reorderIds(["a", "b", "c"], "a", 99)).toEqual(["b", "c", "a"]);
  });
});

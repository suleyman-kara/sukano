import { describe, expect, it } from "vitest";
import type { ChannelEvent } from "~/domain/realtime/grid-events";
import {
  actorName,
  presenceLabel,
  projectChannelOutcome,
  remoteNoteOutcome,
  stackPeers,
  syncLabel,
  syncLabelRefreshMs,
  taskFocusLabel,
} from "~/domain/realtime/live-ui";

const NOW = Date.parse("2026-11-07T11:30:00Z"); // İstanbul 14:30
const MIN = 60_000;

describe("son eşitleme metni", () => {
  it("zaman yoksa metin yoktur", () => {
    expect(syncLabel(null, NOW)).toBeNull();
    expect(syncLabelRefreshMs(null, NOW)).toBeNull();
  });

  it("bir dakikadan yeni eşitleme 'az önce' yazar, saat ileri kaymışsa da", () => {
    expect(syncLabel(NOW - 20_000, NOW)).toBe("Son eşitleme: az önce");
    expect(syncLabel(NOW + 5_000, NOW)).toBe("Son eşitleme: az önce");
  });

  it("bir saatten yeni eşitleme dakika olarak yazılır", () => {
    expect(syncLabel(NOW - 5 * MIN, NOW)).toBe("Son eşitleme: 5 dk önce");
    expect(syncLabel(NOW - 59 * MIN, NOW)).toBe("Son eşitleme: 59 dk önce");
  });

  it("aynı gün saatle, önceki gün 'dün', daha eskisi tarihle yazılır (İstanbul saati)", () => {
    expect(syncLabel(Date.parse("2026-11-07T08:02:00Z"), NOW)).toBe("Son eşitleme: bugün 11:02");
    expect(syncLabel(Date.parse("2026-11-06T06:30:00Z"), NOW)).toBe("Son eşitleme: dün 09:30");
    expect(syncLabel(Date.parse("2026-11-04T11:02:00Z"), NOW)).toBe("Son eşitleme: 4 Kas 14:02");
  });

  it("ilk saatte sık, sonra seyrek yenilenir", () => {
    expect(syncLabelRefreshMs(NOW - MIN, NOW)).toBe(15_000);
    expect(syncLabelRefreshMs(NOW - 2 * 60 * MIN, NOW)).toBe(5 * MIN);
  });
});

describe("varlık avatarları", () => {
  const people = ["Ayşe", "Can", "Mehmet", "Zeynep", "Süleyman"].map((name) => ({ name }));

  it("sınır kadar kişi varsa hepsi gösterilir, fazlası yoktur", () => {
    expect(stackPeers(people.slice(0, 3), 3)).toEqual({ shown: people.slice(0, 3), extra: 0 });
  });

  it("sınırı aşınca son yer '+n' için ayrılır", () => {
    expect(stackPeers(people, 3)).toEqual({ shown: people.slice(0, 2), extra: 3 });
    expect(stackPeers(people.slice(0, 4), 3).extra).toBe(2);
  });

  it("ekran okuyucu metni adları Türkçe bağlaçla sıralar", () => {
    expect(presenceLabel([])).toBe("Notu başka kimse açık tutmuyor");
    expect(presenceLabel(people.slice(0, 1))).toBe("Ayşe bu notu açık tutuyor");
    expect(presenceLabel(people.slice(0, 3))).toBe("Ayşe, Can ve Mehmet bu notu açık tutuyor");
  });

  it("görev odağı metni kişiyi ya da kişileri söyler", () => {
    expect(taskFocusLabel([{ name: "Mehmet" }])).toBe("Mehmet bu görevde");
    expect(taskFocusLabel([{ name: "Mehmet" }, { name: "Can" }])).toBe("Mehmet ve Can bu görevde");
    expect(taskFocusLabel([])).toBe("Biri bu görevde");
  });

  it("olayı yapan bilinmiyorsa 'Başka biri' yazılır", () => {
    expect(actorName("u2", [{ id: "u2", name: "Mehmet Kaya" }])).toBe("Mehmet Kaya");
    expect(actorName("yok")).toBe("Başka biri");
  });
});

describe("açık nota başka yerden gelen değişiklik", () => {
  const people = [{ id: "mehmet", name: "Mehmet Kaya" }];
  const ctx = { me: "ayse", people };

  it("başkası çöpe atınca not kapanır, toast kişiyi söyler ve geri yükleme önerir", () => {
    expect(remoteNoteOutcome({ by: "mehmet", trashed: true }, ctx)).toEqual({
      close: true,
      toast: {
        title: "Mehmet Kaya bu notu çöpe attı",
        description: "Not 7 gün Çöp'te kalır.",
        undo: "restore",
      },
    });
  });

  it("kendi başka sekmende çöpe atılınca metin buna göre değişir", () => {
    expect(remoteNoteOutcome({ by: "ayse", trashed: true }, ctx).toast?.title).toBe(
      "Not başka bir sekmede çöpe atıldı",
    );
  });

  it("arşivlenince kapanır; arşivden açılan not arşivlenince açık kalır", () => {
    expect(remoteNoteOutcome({ by: "mehmet", archived: true }, ctx)).toMatchObject({
      close: true,
      toast: { title: "Mehmet Kaya bu notu arşivledi", undo: "unarchive" },
    });
    expect(remoteNoteOutcome({ by: "mehmet", archived: true }, { ...ctx, view: "arsiv" })).toEqual({
      close: false,
      toast: null,
    });
    expect(remoteNoteOutcome({ by: "ayse", archived: true }, ctx).toast?.title).toBe(
      "Not başka bir sekmede arşivlendi",
    );
  });

  it("arşivden açılan not arşivden çıkarılınca kapanır", () => {
    expect(
      remoteNoteOutcome({ by: "mehmet", archived: false }, { ...ctx, view: "arsiv" }).toast?.title,
    ).toBe("Mehmet Kaya bu notu arşivden çıkardı");
    expect(
      remoteNoteOutcome({ by: "ayse", archived: false }, { ...ctx, view: "arsiv" }).toast?.title,
    ).toBe("Not arşivden çıkarıldı");
  });

  it("taşınınca kapanır", () => {
    expect(remoteNoteOutcome({ by: "x", moved: true }, ctx).toast?.title).toBe(
      "Başka biri bu notu başka bir alana taşıdı",
    );
    expect(remoteNoteOutcome({ by: "ayse", moved: true }, ctx).toast?.title).toBe(
      "Not başka bir sekmede taşındı",
    );
  });

  it("başlık, renk, sabitleme ve geri yükleme notu kapatmaz", () => {
    for (const meta of [{ title: "x" }, { color: "mavi" }, { pinned: true }, { trashed: false }])
      expect(remoteNoteOutcome({ by: "mehmet", ...meta }, ctx).close).toBe(false);
  });
});

describe("proje kanalında beni ilgilendiren olaylar", () => {
  const ev = (e: Record<string, unknown>) => ({ by: "mehmet", at: 1, ...e }) as ChannelEvent;
  const ctx = {
    me: "ayse",
    projectName: "Web Sitesi Yenileme",
    people: [{ id: "mehmet", name: "Mehmet Kaya" }],
  };

  it("başkası projeyi silince yönlendirme ve toast", () => {
    expect(projectChannelOutcome(ev({ type: "proje-silindi" }), ctx)).toEqual({
      kind: "deleted",
      title: "Web Sitesi Yenileme silindi",
      description: "Mehmet Kaya bu projeyi sildi. Notlarım'a döndün.",
    });
  });

  it("kendi silmem ve başkasının üyeliği beni ilgilendirmez", () => {
    expect(projectChannelOutcome(ev({ type: "proje-silindi", by: "ayse" }), ctx)).toBeNull();
    expect(projectChannelOutcome(ev({ type: "uyelik", userId: "can" }), ctx)).toBeNull();
    expect(projectChannelOutcome(ev({ type: "renk", noteId: "n", color: "mavi" }), ctx)).toBeNull();
  });

  it("üyeliğim değişince sunucuya sorulur", () => {
    expect(projectChannelOutcome(ev({ type: "uyelik", userId: "ayse" }), ctx)).toEqual({
      kind: "membership",
    });
  });
});

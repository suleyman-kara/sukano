import { describe, expect, it } from "vitest";
import {
  notificationTimeLabel,
  pushPayloadFor,
  renderNotification,
  type NotificationRow,
} from "~/domain/notifications/copy";
import {
  DEFAULT_PREFS,
  inviteEmailEnabled,
  normalizePrefs,
  pushEnabledFor,
  updatePrefs,
} from "~/domain/notifications/prefs";

const IST = "Europe/Istanbul";
/** Cuma, 6 Kasım 2026, 10:00 İstanbul. */
const NOW = Date.UTC(2026, 10, 6, 7, 0);
const MIN = 60_000;

const row = (over: Partial<NotificationRow>): NotificationRow => ({
  id: "n1",
  type: "davet",
  data: {},
  createdAt: NOW - 25 * MIN,
  readAt: null,
  projectId: "p1",
  noteId: null,
  actorName: "Ayşe Demir",
  projectName: "Fotoğraf Arşivi",
  ...over,
});

const ctx = { now: NOW, timeZone: IST };
const text = (v: ReturnType<typeof renderNotification>) => v.segments.map((s) => s.text).join("");
const strong = (v: ReturnType<typeof renderNotification>) =>
  v.segments.filter((s) => s.strong).map((s) => s.text);

describe("bildirim zamanı", () => {
  it("şimdi, dakika önce, bugün, dün, gün ay, başka yıl", () => {
    expect(notificationTimeLabel(NOW - 20_000, NOW, IST)).toBe("şimdi");
    expect(notificationTimeLabel(NOW - 25 * MIN, NOW, IST)).toBe("25 dk önce");
    expect(notificationTimeLabel(NOW - 3 * 60 * MIN, NOW, IST)).toBe("bugün 07:00");
    expect(notificationTimeLabel(Date.UTC(2026, 10, 5, 15, 40), NOW, IST)).toBe("dün 18:40");
    expect(notificationTimeLabel(Date.UTC(2026, 10, 3, 9, 0), NOW, IST)).toBe("3 Kas");
    expect(notificationTimeLabel(Date.UTC(2025, 10, 3, 9, 0), NOW, IST)).toBe("3 Kas 2025");
  });
});

describe("bildirim metinleri (Notifications tasarımı)", () => {
  it("göreve atanma: kişi, görev, proje ve not", () => {
    const v = renderNotification(
      row({
        type: "goreve_atandi",
        actorName: "Zeynep Arslan",
        projectName: "Web Sitesi Yenileme",
        noteId: "lansman",
        data: { taskId: "t1", taskTitle: "Ürün sayfası", noteTitle: "Lansman hazırlığı" },
      }),
      ctx,
    );
    expect(text(v)).toBe('Zeynep Arslan seni "Ürün sayfası" görevine atadı.');
    expect(strong(v)).toEqual(["Zeynep Arslan"]);
    expect(v.meta).toEqual(["Web Sitesi Yenileme", "Lansman hazırlığı", "25 dk önce"]);
    expect(v.href).toBe("/proje/p1/not/lansman");
    expect(v.tone).toBe("atama");
    expect(v.unread).toBe(true);
    expect(v.action).toBeNull();
  });

  it("kişisel not hatırlatıcısı: başlık, Kişisel not, hatırlatıcı anı ve Notu aç", () => {
    const v = renderNotification(
      row({
        type: "hatirlatici",
        projectId: null,
        projectName: null,
        actorName: null,
        noteId: "market",
        data: { targetType: "note", noteTitle: "Market", at: Date.UTC(2026, 10, 6, 6, 0) },
      }),
      ctx,
    );
    expect(text(v)).toBe("Hatırlatıcı: Market");
    expect(strong(v)).toEqual(["Market"]);
    expect(v.meta).toEqual(["Kişisel not", "bugün 09:00"]);
    expect(v.action).toBe("Notu aç");
    expect(v.href).toBe("/not/market");
    expect(v.tone).toBe("hatirlatici");
  });

  it("proje görevi hatırlatıcısı: görev başlığı, proje ve not adı", () => {
    const v = renderNotification(
      row({
        type: "hatirlatici",
        projectName: "Web Sitesi Yenileme",
        noteId: "lansman",
        data: {
          targetType: "task",
          noteTitle: "Lansman hazırlığı",
          taskTitle: "Ürün sayfası",
          at: Date.UTC(2026, 10, 6, 14, 0),
        },
      }),
      ctx,
    );
    expect(text(v)).toBe("Hatırlatıcı: Ürün sayfası");
    expect(v.meta).toEqual(["Web Sitesi Yenileme", "Lansman hazırlığı", "bugün 17:00"]);
    expect(v.href).toBe("/proje/p1/not/lansman");
  });

  it("başlıksız not ve silinmiş not için yedek metin ve adres", () => {
    const v = renderNotification(
      row({ type: "hatirlatici", projectId: null, projectName: null, noteId: null, data: {} }),
      ctx,
    );
    expect(text(v)).toBe("Hatırlatıcı: Başlıksız not");
    expect(v.href).toBe("/");
    expect(v.action).toBeNull();
  });

  it("davet: kişi, proje, rol küçük harfle ve Davetleri gör", () => {
    const v = renderNotification(
      row({
        type: "davet",
        createdAt: Date.UTC(2026, 10, 5, 15, 40),
        data: { role: "duzenleyici", projectName: "Fotoğraf Arşivi" },
      }),
      ctx,
    );
    expect(text(v)).toBe(
      "Ayşe Demir seni Fotoğraf Arşivi projesine düzenleyici olarak davet etti.",
    );
    expect(strong(v)).toEqual(["Ayşe Demir", "Fotoğraf Arşivi"]);
    expect(v.meta).toEqual(["dün 18:40"]);
    expect(v.action).toBe("Davetleri gör");
    expect(v.href).toBe("/davetler");
    expect(v.tone).toBe("davet");
  });

  it("rol değişikliği: proje ve yeni rol, yapan kişi ve tarih", () => {
    const v = renderNotification(
      row({
        type: "rol_degisti",
        projectName: null,
        createdAt: Date.UTC(2026, 10, 3, 9, 0),
        readAt: NOW,
        data: { role: "yonetici", projectName: "Web Sitesi Yenileme" },
      }),
      ctx,
    );
    expect(text(v)).toBe("Web Sitesi Yenileme projesindeki rolün yönetici olarak değişti.");
    expect(strong(v)).toEqual(["Web Sitesi Yenileme", "yönetici"]);
    expect(v.meta).toEqual(["Ayşe Demir", "3 Kas"]);
    expect(v.href).toBe("/proje/p1");
    expect(v.unread).toBe(false);
  });

  it("proje silindi: geri getirme son günü (7 gün) yazar", () => {
    const v = renderNotification(
      row({
        type: "proje_silindi",
        actorName: "Deniz Öztürk",
        projectName: null,
        createdAt: Date.UTC(2026, 10, 4, 9, 0),
        data: { projectName: "Bütçe 2026" },
      }),
      ctx,
    );
    expect(text(v)).toBe(
      "Bütçe 2026 projesi silindi. Proje 11 Kasım'a kadar geri getirilebilir; sonra notlar kalıcı olarak silinir.",
    );
    expect(v.meta).toEqual(["Deniz Öztürk", "4 Kas"]);
    expect(v.href).toBe("/silinmis-projeler");
    expect(v.tone).toBe("silindi");
  });

  it("projeden çıkarılma ve silinmiş kişi", () => {
    const v = renderNotification(
      row({
        type: "projeden_cikarildi",
        actorName: null,
        projectName: null,
        data: { projectName: "Ev Taşınma" },
      }),
      ctx,
    );
    expect(text(v)).toBe("Ev Taşınma projesinden çıkarıldın.");
    expect(v.meta).toEqual(["Silinmiş kullanıcı", "25 dk önce"]);
    expect(v.href).toBe("/");
    expect(v.tone).toBe("cikarildi");
  });

  it("davet bildiriminde yapan silinmişse yedek ad kullanılır", () => {
    const v = renderNotification(row({ actorName: null, data: { role: "goruntuleyici" } }), ctx);
    expect(text(v)).toBe(
      "Silinmiş kullanıcı seni Fotoğraf Arşivi projesine görüntüleyici olarak davet etti.",
    );
  });
});

describe("push yükü (States2 tasarımı)", () => {
  it("hatırlatıcı: başlık, alt satır ve notun adresi", () => {
    expect(
      pushPayloadFor(
        row({
          type: "hatirlatici",
          projectId: null,
          projectName: null,
          noteId: "market",
          data: { targetType: "note", noteTitle: "Market", at: Date.UTC(2026, 10, 6, 6, 0) },
        }),
        ctx,
      ),
    ).toEqual({
      title: "Hatırlatıcı: Market",
      body: "Kişisel not · bugün 09:00",
      url: "/not/market",
      tag: "n1",
      action: "Notu aç",
    });
  });

  it("göreve atanma: kişi seni bir göreve atadı, görev ve proje", () => {
    expect(
      pushPayloadFor(
        row({
          type: "goreve_atandi",
          actorName: "Zeynep Arslan",
          projectName: "Web Sitesi Yenileme",
          noteId: "lansman",
          data: { taskTitle: "Ürün sayfası", noteTitle: "Lansman hazırlığı" },
        }),
        ctx,
      ),
    ).toMatchObject({
      title: "Zeynep Arslan seni bir göreve atadı",
      body: "Ürün sayfası · Web Sitesi Yenileme",
      url: "/proje/p1/not/lansman",
    });
  });

  it("davet: proje adı ve davet eden · rol", () => {
    expect(pushPayloadFor(row({ data: { role: "duzenleyici" } }), ctx)).toMatchObject({
      title: "Fotoğraf Arşivi projesine davet",
      body: "Ayşe Demir · Düzenleyici",
      url: "/davetler",
    });
  });

  it("push'u olmayan türlerde yük yoktur", () => {
    expect(pushPayloadFor(row({ type: "rol_degisti" }), ctx)).toBeNull();
  });
});

describe("bildirim tercihleri", () => {
  it("eksik ya da bozuk tercih varsayılanlarla tamamlanır", () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs("x")).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs({ push: { davet: false } })).toEqual({
      push: { hatirlatici: true, goreveAtandi: true, davet: false },
      email: { davet: true },
    });
    expect(normalizePrefs({ push: { davet: "evet" }, email: { davet: false } }).email.davet).toBe(
      false,
    );
  });

  it("push yalnızca hatırlatıcı, atanma ve davette ve açıksa gider", () => {
    const prefs = normalizePrefs({ push: { goreveAtandi: false } });
    expect(pushEnabledFor(prefs, "hatirlatici")).toBe(true);
    expect(pushEnabledFor(prefs, "goreve_atandi")).toBe(false);
    expect(pushEnabledFor(prefs, "davet")).toBe(true);
    expect(pushEnabledFor(prefs, "rol_degisti")).toBe(false);
    expect(pushEnabledFor(prefs, "proje_silindi")).toBe(false);
  });

  it("davet e-postası ayrı kapatılır", () => {
    expect(inviteEmailEnabled(DEFAULT_PREFS)).toBe(true);
    expect(inviteEmailEnabled(normalizePrefs({ email: { davet: false } }))).toBe(false);
  });

  it("ayar anahtarı tek değeri değiştirir; bilinmeyen anahtar yok sayılır", () => {
    expect(updatePrefs(DEFAULT_PREFS, "push.davet", false)!.push.davet).toBe(false);
    expect(updatePrefs(DEFAULT_PREFS, "email.davet", false)!.email.davet).toBe(false);
    expect(updatePrefs(DEFAULT_PREFS, "push.hatirlatici", false)!.push).toEqual({
      hatirlatici: false,
      goreveAtandi: true,
      davet: true,
    });
    expect(updatePrefs(DEFAULT_PREFS, "yok", false)).toBeNull();
  });
});

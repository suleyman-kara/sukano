import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "~/components/notifications/notification-bell";
import { ReminderChip } from "~/components/reminders/reminder-chip";
import { ReminderPicker } from "~/components/reminders/reminder-picker";
import { NotificationSettings } from "~/components/settings/notification-settings";
import { DatePicker, type DatePickerProps } from "~/components/tasks/date-picker";
import type { NotificationView } from "~/domain/notifications/copy";
import { DEFAULT_PREFS } from "~/domain/notifications/prefs";
import type { DateSlot } from "~/domain/tasks/dates";
import { setMedia } from "../../helpers/media";

const IST = "Europe/Istanbul";
/** Cuma, 6 Kasım 2026, 10:00 İstanbul. */
const NOW = Date.UTC(2026, 10, 6, 7, 0);

function inRouter(ui: React.ReactNode) {
  const Stub = createRoutesStub([
    { path: "/", Component: () => <>{ui}</> },
    { path: "*", Component: () => <p>başka sayfa</p> },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReminderPicker (Forms · Not hatırlatıcısı)", () => {
  const members = [
    { id: "a", name: "Ayşe Demir", color: "#B25D49" },
    { id: "m", name: "Mehmet Kaya", color: "#4976B4" },
    { id: "z", name: "Zeynep Arslan", color: "#7A5FB8" },
    { id: "s", name: "Süleyman Kara", color: "#597895" },
    { id: "c", name: "Can Yılmaz", color: "#398264" },
  ];

  it("hızlı seçenekler tarih ve saati doldurur, Kaydet yerel tarih ve saatle çağrılır", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => true);
    render(
      <ReminderPicker
        noteTitle="Lansman hazırlığı"
        value={null}
        timeZone={IST}
        audience={{ kind: "project", members }}
        onSave={onSave}
        onClear={vi.fn()}
        onCancel={vi.fn()}
        now={NOW}
      />,
    );
    expect(screen.getByRole("heading", { name: "Hatırlatıcı" })).toBeInTheDocument();
    expect(screen.getByText("Lansman hazırlığı")).toBeInTheDocument();
    // Varsayılan: ilk seçenek (Bugün 18:00) seçili.
    expect(screen.getByRole("button", { name: /Bugün/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /Yarın/ }));
    expect(screen.getByRole("button", { name: /Yarın/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Tarih")).toHaveValue("2026-11-07");
    expect(screen.getByLabelText("Saat")).toHaveValue("09:00");
    expect(screen.getByText(/Projedeki herkese gider/)).toHaveTextContent(
      "Projedeki herkese gider · 5 üye",
    );
    expect(screen.getByText("Bir kez çalar. Saat dilimi: İstanbul (tarayıcıdan).")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Kaldır" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(onSave).toHaveBeenCalledWith("2026-11-07", "09:00");
  });

  it("kişisel notta kime gideceği satırı yoktur; kurulu hatırlatıcı Kaldır ile kalkar", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn(() => true);
    const onCancel = vi.fn();
    render(
      <ReminderPicker
        noteTitle=""
        value={Date.UTC(2026, 10, 9, 6, 0)}
        timeZone={IST}
        audience={{ kind: "personal" }}
        onSave={vi.fn()}
        onClear={onClear}
        onCancel={onCancel}
        now={NOW}
      />,
    );
    expect(screen.getByText("Başlıksız not")).toBeInTheDocument();
    expect(screen.queryByText(/Projedeki herkese gider/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tarih")).toHaveValue("2026-11-09");
    expect(screen.getByRole("button", { name: /Gelecek hafta/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Kaldır" }));
    expect(onClear).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("geçmiş zaman seçilemez: hata metni ve Kaydet kapalı", async () => {
    const user = userEvent.setup();
    render(
      <ReminderPicker
        noteTitle="Market"
        value={null}
        timeZone={IST}
        audience={{ kind: "personal" }}
        onSave={vi.fn()}
        onClear={vi.fn()}
        onCancel={vi.fn()}
        now={NOW}
      />,
    );
    const time = screen.getByLabelText("Saat");
    await user.clear(time);
    await user.type(time, "08:00");
    const date = screen.getByLabelText("Tarih");
    await user.clear(date);
    await user.type(date, "2026-11-06");
    expect(screen.getByRole("alert")).toHaveTextContent("Geçmiş bir zaman seçilemez.");
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeDisabled();
  });

  it("çip: Yarın, 09:00; tıklanabilir sürümü düğmedir", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ReminderChip at={Date.UTC(2026, 10, 7, 6, 0)} timeZone={IST} now={NOW} onClick={onClick} />,
    );
    await user.click(screen.getByRole("button", { name: "Hatırlatıcı: Yarın, 09:00" }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe("Görev tarih seçicisinde Hatırlat", () => {
  function Harness(props: Partial<DatePickerProps>) {
    const [slot, setSlot] = useState<DateSlot>("due");
    return (
      <DatePicker
        startDate={null}
        dueDate={null}
        dueTime={null}
        today="2026-11-06"
        slot={slot}
        onSlot={setSlot}
        timeOpen={false}
        onToggleTime={vi.fn()}
        onTime={vi.fn()}
        warning={null}
        text=""
        textError={false}
        onText={vi.fn()}
        onTextSubmit={vi.fn()}
        onPick={vi.fn()}
        onClear={vi.fn()}
        {...props}
      />
    );
  }

  it("bitiş tarihi yokken kapalı; tarih varken açılır ve kime gittiğini söyler", async () => {
    const user = userEvent.setup();
    const onRemind = vi.fn();
    const { rerender } = render(<Harness onRemind={onRemind} />);
    expect(screen.getByRole("switch", { name: "Hatırlat" })).toBeDisabled();
    rerender(<Harness onRemind={onRemind} dueDate="2026-11-12" remindTo="Atananlara gider" />);
    const sw = screen.getByRole("switch", { name: "Hatırlat" });
    expect(sw).toBeEnabled();
    expect(sw).toHaveAccessibleDescription("Atananlara gider");
    await user.click(sw);
    expect(onRemind).toHaveBeenCalledWith(true);
    rerender(<Harness onRemind={onRemind} dueDate="2026-11-12" remind />);
    expect(screen.getByRole("switch", { name: "Hatırlat" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Hatırlat" })).toHaveAccessibleDescription(
      "Sana gider",
    );
  });
});

const item = (over: Partial<NotificationView> = {}): NotificationView => ({
  id: "n1",
  type: "hatirlatici",
  tone: "hatirlatici",
  unread: true,
  href: "/not/market",
  segments: [{ text: "Hatırlatıcı: " }, { text: "Market", strong: true }],
  meta: ["Kişisel not", "bugün 09:00"],
  action: "Notu aç",
  createdAt: NOW,
  ...over,
});

function fakeApi(unread: number, items: NotificationView[]) {
  const posts: Record<string, string>[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      const fields = Object.fromEntries(new URLSearchParams(String(init.body)));
      posts.push(fields);
      if (fields.intent === "read-all") unread = 0;
      if (fields.intent === "read") unread = Math.max(0, unread - 1);
      return Response.json({ ok: true, changed: 1, unread });
    }
    if (url.includes("sayi=1")) return Response.json({ unread });
    return Response.json({ items, unread, hasMore: false, cursor: null });
  });
  vi.stubGlobal("fetch", impl);
  return { impl, posts };
}

describe("Zil ve bildirim paneli", () => {
  it("okunmamış varsa rozet ve 'Bildirimler, 2 yeni'; panel listeyi ve tasarım metnini gösterir", async () => {
    const user = userEvent.setup();
    fakeApi(2, [
      item(),
      item({
        id: "n2",
        type: "goreve_atandi",
        tone: "atama",
        href: "/proje/p/not/lansman",
        segments: [
          { text: "Zeynep Arslan", strong: true },
          { text: ' seni "Ürün sayfası" görevine atadı.' },
        ],
        meta: ["Web Sitesi Yenileme", "Lansman hazırlığı", "25 dk önce"],
        action: null,
      }),
      item({ id: "n3", unread: false, action: "Davetleri gör", tone: "davet", type: "davet" }),
    ]);
    inRouter(<NotificationBell initialUnread={2} />);
    const bell = screen.getAllByRole("button", { name: "Bildirimler, 2 yeni" })[0]!;
    expect(screen.getAllByTestId("bildirim-rozeti").length).toBeGreaterThan(0);
    await user.click(bell);
    const panel = await screen.findByRole("dialog", { name: "Bildirimler" });
    await within(panel).findByText(/görevine atadı/);
    const links = within(panel).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/ayarlar#bildirim",
      "/not/market",
      "/proje/p/not/lansman",
      "/not/market",
    ]);
    expect(links[2]).toHaveTextContent(
      'Okunmadı: Zeynep Arslan seni "Ürün sayfası" görevine atadı.Web Sitesi Yenileme · Lansman hazırlığı · 25 dk önce',
    );
    expect(links[1]).toHaveTextContent("Kişisel not · bugün 09:00 · Notu aç");
    expect(links[3]).not.toHaveTextContent("Okunmadı");
  });

  it("Tümünü okundu say: istek gider, rozet kalkar, satırlar okunmuş olur", async () => {
    const user = userEvent.setup();
    const api = fakeApi(1, [item()]);
    inRouter(<NotificationBell initialUnread={1} />);
    await user.click(screen.getAllByRole("button", { name: "Bildirimler, 1 yeni" })[0]!);
    const panel = await screen.findByRole("dialog", { name: "Bildirimler" });
    await within(panel).findByText("Market");
    await user.click(within(panel).getByRole("button", { name: "Tümünü okundu say" }));
    await waitFor(() => expect(api.posts).toContainEqual({ intent: "read-all" }));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Bildirimler" }).length).toBeGreaterThan(0),
    );
    expect(screen.queryByTestId("bildirim-rozeti")).not.toBeInTheDocument();
    expect(within(panel).queryByText(/Okunmadı/)).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Tümünü okundu say" })).toBeDisabled();
  });

  it("bildirime tıklayınca okundu sayılır ve sayfaya gider", async () => {
    const user = userEvent.setup();
    const api = fakeApi(1, [item()]);
    inRouter(<NotificationBell initialUnread={1} />);
    await user.click(screen.getAllByRole("button", { name: "Bildirimler, 1 yeni" })[0]!);
    const panel = await screen.findByRole("dialog", { name: "Bildirimler" });
    await user.click(await within(panel).findByText("Market"));
    await waitFor(() => expect(api.posts).toContainEqual({ intent: "read", id: "n1" }));
    expect(await screen.findByText("başka sayfa")).toBeInTheDocument();
  });

  it("bildirim yoksa boş durum; mobilde zil sayfaya bağlantıdır", async () => {
    const user = userEvent.setup();
    setMedia({ width: 390 });
    fakeApi(0, []);
    inRouter(<NotificationBell initialUnread={0} />);
    expect(screen.getByRole("link", { name: "Bildirimler" })).toHaveAttribute(
      "href",
      "/bildirimler",
    );
    setMedia({ width: 1440 });
    await user.click(screen.getByRole("button", { name: "Bildirimler" }));
    expect(await screen.findByText("Henüz bildirimin yok.")).toBeInTheDocument();
  });
});

describe("Ayarlar → Bildirimler", () => {
  it("tarayıcı desteklemiyorsa durum metni; anahtarlar tercihi hemen kaydeder", async () => {
    const user = userEvent.setup();
    const api = fakeApi(0, []);
    render(<NotificationSettings prefs={DEFAULT_PREFS} fetchImpl={api.impl} />);
    expect(await screen.findByText(/Bu tarayıcı bildirimleri desteklemiyor/)).toBeInTheDocument();
    const rows = [
      "Hatırlatıcı bildirimleri",
      "Atanma bildirimleri",
      "Davet bildirimleri",
      "Davet e-postası",
    ];
    for (const name of rows) expect(screen.getByRole("switch", { name })).toBeChecked();
    await user.click(screen.getByRole("switch", { name: "Davet e-postası" }));
    expect(screen.getByRole("switch", { name: "Davet e-postası" })).not.toBeChecked();
    expect(api.posts).toEqual([{ intent: "pref", key: "email.davet", value: "0" }]);
  });

  it("kaydedilemezse anahtar eski haline döner", async () => {
    const user = userEvent.setup();
    const failing = vi.fn(
      async () => new Response("hata", { status: 500 }),
    ) as unknown as typeof fetch;
    render(<NotificationSettings prefs={DEFAULT_PREFS} fetchImpl={failing} />);
    await user.click(screen.getByRole("switch", { name: "Atanma bildirimleri" }));
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Atanma bildirimleri" })).toBeChecked(),
    );
  });

  it("izin verilmiş ve abone olunmuşsa 'açık' metni ve Bu cihazda kapat", async () => {
    const user = userEvent.setup();
    const unsubscribe = vi.fn(async () => true);
    const sub = { endpoint: "https://push.example/1", unsubscribe };
    vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn() });
    vi.stubGlobal("PushManager", class {});
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn(async () => ({
          pushManager: { getSubscription: vi.fn(async () => sub) },
        })),
      },
    });
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${String(input)}`);
        return Response.json({ publicKey: "B", subscribed: true, ok: true, removed: true });
      }),
    );
    render(<NotificationSettings prefs={DEFAULT_PREFS} />);
    expect(await screen.findByText(/Tarayıcı bildirimleri bu cihazda açık/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bu cihazda kapat" }));
    expect(await screen.findByText(/Tarayıcı bildirimleri bu cihazda kapalı/)).toBeInTheDocument();
    expect(unsubscribe).toHaveBeenCalled();
    expect(calls).toContain("DELETE /api/push/abonelik");
    // @ts-expect-error test temizliği
    delete navigator.serviceWorker;
  });
});

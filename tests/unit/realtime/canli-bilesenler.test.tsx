import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as encoding from "lib0/encoding";
import { createRoutesStub } from "react-router";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteAccessInfo } from "~/components/notes/note-access";
import { NoteDialog } from "~/components/notes/note-dialog";
import { LiveConfigProvider } from "~/components/realtime/live-context";
import {
  GridLiveStatus,
  OFFLINE_GRACE_MS,
  OfflineBanner,
  SyncStatus,
} from "~/components/realtime/live-status";
import { PresenceAvatars } from "~/components/realtime/presence-avatars";
import type { LiveChannelState } from "~/components/realtime/use-live-channel";
import { useProjectChannelGuard } from "~/components/realtime/use-project-guard";
import { TooltipProvider } from "~/components/ui/tooltip";
import type { ChannelEvent } from "~/domain/realtime/grid-events";
import { encodeAwarenessUpdate, mergePresence, type Peer } from "~/domain/realtime/presence";
import { MESSAGE_AWARENESS } from "~/domain/realtime/protocol";
import { makeTask } from "~/domain/tasks/model";
import type { NoteDetail } from "~/lib/notes.server";
import { FakeSocket } from "./sahte-soket";

/**
 * Aşama 4b canlı arayüz: varlık avatarları, çevrimdışı bandı ve "Yeniden dene", son
 * eşitleme metni, açık nota başka yerden gelen yıkıcı olaylar, proje kanalı yönlendirmesi.
 */

const peer = (userId: string, name: string, color = "#4976B4", focus: string[] = []): Peer => ({
  userId,
  name,
  color,
  avatarUrl: null,
  clientIds: [userId.length],
  focusTaskIds: focus,
});

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ tasks: [] }), { status: 200 })),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("varlık avatarları", () => {
  const withTooltip = (ui: React.ReactNode) =>
    render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);

  it("notu başka kimse açık tutmuyorsa hiçbir şey çizilmez", () => {
    const { container } = withTooltip(<PresenceAvatars peers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("en çok üç yer: fazlası '+n' olur, ekran okuyucu herkesi duyar", () => {
    const peers = [
      peer("a", "Ayşe Demir"),
      peer("c", "Can Yılmaz"),
      peer("m", "Mehmet Kaya"),
      peer("z", "Zeynep Arslan"),
    ];
    withTooltip(<PresenceAvatars peers={peers} />);
    const stack = screen.getByRole("button", {
      name: "Ayşe Demir, Can Yılmaz, Mehmet Kaya ve Zeynep Arslan bu notu açık tutuyor",
    });
    expect(stack).toHaveAttribute("data-kisi", "4");
    expect(stack.querySelectorAll("[data-kisi-id]")).toHaveLength(2);
    expect(within(stack).getByText("+2")).toBeInTheDocument();
    expect(within(stack).getByText("AD")).toBeInTheDocument();
  });

  it("odaklanınca ipucunda adlar listelenir", async () => {
    const user = userEvent.setup();
    withTooltip(<PresenceAvatars peers={[peer("m", "Mehmet Kaya"), peer("c", "Can Yılmaz")]} />);
    await user.tab();
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Şu an bu notta");
    expect(tip).toHaveTextContent("Mehmet Kaya");
    expect(tip).toHaveTextContent("Can Yılmaz");
  });

  it("kendin (bu ve diğer sekmelerin) listede görünmezsin", () => {
    const states: [number, unknown][] = [
      [1, { user: { id: "ben", name: "Ayşe Demir", color: "#B25D49" } }],
      [2, { user: { id: "ben", name: "Ayşe Demir", color: "#B25D49" } }],
      [3, { user: { id: "m", name: "Mehmet Kaya", color: "#4976B4" } }],
    ];
    withTooltip(
      <PresenceAvatars peers={mergePresence(states, { selfClientId: 1, selfUserId: "ben" })} />,
    );
    expect(screen.getByRole("button")).toHaveAccessibleName("Mehmet Kaya bu notu açık tutuyor");
    expect(screen.queryByText("AD")).not.toBeInTheDocument();
  });
});

describe("çevrimdışı bandı ve son eşitleme", () => {
  it("bant durumu söyler; 'Yeniden dene' bağlanmayı hemen dener", async () => {
    const retry = vi.fn();
    render(<OfflineBanner onRetry={retry} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Çevrimdışısın. Not okunabilir, düzenleme bağlantı gelince açılır.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("sayfa bandı tasarım metnini yazar; deneme işlevi yoksa düğme yoktur", () => {
    render(<OfflineBanner variant="page" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Çevrimdışısın. Notlar okunabilir, düzenleme bağlantı gelince açılır.",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("son eşitleme göreli yazılır ve zamanla yenilenir; zaman yoksa çizilmez", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-11-07T11:30:00Z"));
    const { rerender } = render(<SyncStatus at={Date.now() - 5 * 60_000} />);
    expect(screen.getByTestId("son-esitleme")).toHaveTextContent("Son eşitleme: 5 dk önce");
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByTestId("son-esitleme")).toHaveTextContent("Son eşitleme: 6 dk önce");
    rerender(<SyncStatus at={null} />);
    expect(screen.queryByTestId("son-esitleme")).not.toBeInTheDocument();
  });

  it("alan sayfasında kısa kopmada bant hemen çıkmaz, sürerse çıkar", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const live: LiveChannelState = { status: "cevrimdisi", lastEventAt: Date.now() - 1000 };
    render(
      <>
        <GridLiveStatus live={live} part="banner" />
        <GridLiveStatus live={live} part="sync" />
      </>,
    );
    expect(screen.queryByTestId("cevrimdisi")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(OFFLINE_GRACE_MS + 10));
    expect(screen.getByTestId("cevrimdisi")).toBeInTheDocument();
    expect(screen.getByTestId("son-esitleme")).toHaveTextContent("Son eşitleme: az önce");
  });

  it("tarayıcı çevrimdışıysa bant hemen çıkar; bağlıyken bant yoktur", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { rerender } = render(
      <GridLiveStatus live={{ status: "cevrimdisi", lastEventAt: null }} part="banner" />,
    );
    expect(screen.getByTestId("cevrimdisi")).toBeInTheDocument();
    rerender(<GridLiveStatus live={{ status: "bagli", lastEventAt: null }} part="banner" />);
    expect(screen.queryByTestId("cevrimdisi")).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* Açık not: canlı olaylar                                              */
/* ------------------------------------------------------------------ */

const ME = { id: "ayse", name: "Ayşe Demir", color: "#B25D49" };
const MEMBERS = [
  { id: "ayse", name: "Ayşe Demir", color: "#B25D49", isMe: true, viewer: false },
  { id: "zeynep", name: "Zeynep Arslan", color: "#7A5FB8", isMe: false, viewer: false },
];
const PROJECT = { id: "foto", name: "Fotoğraf Arşivi", color: "pembe" as const };
const EDITOR: NoteAccessInfo = {
  kind: "project",
  project: PROJECT,
  role: "duzenleyici",
  members: MEMBERS,
};

const NOTE: NoteDetail = {
  id: "album",
  kind: "todo",
  title: "Albüm seçimi",
  color: "default",
  pinned: false,
  bodyHtml: "",
  tasks: [],
  todoTasks: [
    makeTask("g1", null, 0, { title: "2019–2023 arası" }),
    makeTask("g2", null, 1, { title: "Kapak" }),
  ],
  attachmentCount: 0,
  projectId: PROJECT.id,
  createdBy: null,
  updatedBy: null,
  assignees: {},
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-07T10:00:00.000Z",
  archivedAt: null,
  trashedAt: null,
};

async function openLive(access: NoteAccessInfo = EDITOR) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <NoteDialog note={NOTE} access={access} targets={[]} closeTo="/proje/foto" />
      ),
    },
    { path: "/proje/foto", Component: () => <p>Proje ızgarası</p> },
  ]);
  render(
    <LiveConfigProvider enabled me={ME}>
      <TooltipProvider>
        <Stub initialEntries={["/"]} />
      </TooltipProvider>
      <Toaster />
    </LiveConfigProvider>,
  );
  // Sağlayıcı (Yjs) tembel yüklenir.
  await waitFor(() => expect(FakeSocket.all).toHaveLength(1), { timeout: 5000 });
  const socket = FakeSocket.last;
  act(() => socket.open());
  act(() =>
    socket.receive(
      JSON.stringify({
        t: "hosgeldin",
        docId: "d",
        kind: "todo",
        readOnly: false,
        user: ME,
        seq: 0,
      }),
    ),
  );
  const dialog = screen.getByRole("dialog", { name: NOTE.title });
  await waitFor(() => expect(dialog).toHaveAttribute("data-canli", "bagli"));
  return { socket, dialog };
}

function awareness(entries: { clientID: number; clock: number; state: unknown }[]) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(entries));
  return encoding.toUint8Array(encoder);
}

describe("açık not: canlı olaylar", () => {
  it("varlık köşede avatarla, odaklanılan görev satırda kişinin halkasıyla görünür", async () => {
    const { socket, dialog } = await openLive();
    act(() =>
      socket.receive(
        awareness([
          {
            clientID: 4242,
            clock: 1,
            state: {
              user: { id: "zeynep", name: "Zeynep Arslan", color: "#7A5FB8" },
              focus: { taskId: "g1" },
            },
          },
        ]),
      ),
    );
    expect(
      within(dialog).getByRole("button", { name: "Zeynep Arslan bu notu açık tutuyor" }),
    ).toBeInTheDocument();
    expect(dialog).toHaveAttribute("data-canli-kisi", "1");
    expect(within(dialog).getByRole("img", { name: "Zeynep Arslan bu görevde" })).toBeVisible();
    // Ayrılınca kaybolur.
    act(() => socket.receive(awareness([{ clientID: 4242, clock: 2, state: null }])));
    expect(within(dialog).queryByRole("button", { name: /açık tutuyor/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("img", { name: /bu görevde/ })).not.toBeInTheDocument();
  });

  it("başkası çöpe atınca not kapanır, toast kişiyi söyler ve geri yükleme önerir", async () => {
    const { socket } = await openLive();
    act(() => socket.receive(JSON.stringify({ t: "not", by: "zeynep", trashed: true })));
    expect(await screen.findByText("Proje ızgarası")).toBeInTheDocument();
    expect(await screen.findByText("Zeynep Arslan bu notu çöpe attı")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Geri yükle" })).toBeInTheDocument();
  });

  it("başkası arşivleyince not kapanır ve toast söyler", async () => {
    const { socket } = await openLive();
    act(() => socket.receive(JSON.stringify({ t: "not", by: "zeynep", archived: true })));
    expect(await screen.findByText("Zeynep Arslan bu notu arşivledi")).toBeInTheDocument();
    expect(screen.getByText("Proje ızgarası")).toBeInTheDocument();
  });

  it("başlık ve renk değişikliği notu kapatmaz", async () => {
    const { socket, dialog } = await openLive();
    act(() => socket.receive(JSON.stringify({ t: "not", by: "zeynep", title: "Yeni ad" })));
    expect(within(dialog).getByLabelText("Not başlığı")).toHaveValue("Yeni ad");
    expect(screen.queryByText("Proje ızgarası")).not.toBeInTheDocument();
  });

  it("erişim kalkınca (4404) not kapanır ve toast nedenini söyler", async () => {
    const { socket } = await openLive();
    act(() => socket.serverClose(4404, "Erişim yok"));
    expect(await screen.findByText("Bu nota artık erişemiyorsun")).toBeInTheDocument();
    expect(screen.getByText("Proje ızgarası")).toBeInTheDocument();
  });

  it("sunucu düzenlemeyi reddedince salt okunur toast'ı çıkar", async () => {
    const { socket } = await openLive();
    act(() =>
      socket.receive(
        JSON.stringify({
          t: "hata",
          code: "salt_okunur",
          message: "Salt okunur: düzenlemen kaydedilmedi.",
        }),
      ),
    );
    expect(await screen.findByText("Salt okunur: düzenlemen kaydedilmedi.")).toBeInTheDocument();
  });

  it("rol düşürülünce düzenleme kapanır ve toast söyler", async () => {
    const { socket, dialog } = await openLive();
    const title = within(dialog).getByLabelText("Not başlığı");
    expect(title).not.toHaveAttribute("readonly");
    act(() => socket.receive(JSON.stringify({ t: "rol", readOnly: true })));
    expect(await screen.findByText("Rolün değişti")).toBeInTheDocument();
    expect(title).toHaveAttribute("readonly");
    expect(dialog).toHaveAttribute("data-salt-okunur");
  });

  it("bağlantı kopunca düzenleme kapanır, bant çıkar; 'Yeniden dene' hemen bağlanır", async () => {
    const { socket, dialog } = await openLive();
    act(() => socket.serverClose(1006));
    expect(dialog).toHaveAttribute("data-canli", "cevrimdisi");
    expect(within(dialog).getByLabelText("Not başlığı")).toHaveAttribute("readonly");
    const banner = await within(dialog).findByTestId(
      "cevrimdisi",
      {},
      { timeout: OFFLINE_GRACE_MS + 1500 },
    );
    expect(banner).toHaveTextContent("Çevrimdışısın.");
    const before = FakeSocket.all.length;
    await userEvent.click(within(banner).getByRole("button", { name: "Yeniden dene" }));
    expect(FakeSocket.all.length).toBe(before + 1);
    // Yeniden bağlanana kadar bant kalır; bağlanınca kalkar, düzenleme açılır.
    act(() => FakeSocket.last.open());
    act(() =>
      FakeSocket.last.receive(
        JSON.stringify({
          t: "hosgeldin",
          docId: "d",
          kind: "todo",
          readOnly: false,
          user: ME,
          seq: 0,
        }),
      ),
    );
    expect(dialog).toHaveAttribute("data-canli", "bagli");
    expect(within(dialog).getByLabelText("Not başlığı")).not.toHaveAttribute("readonly");
    expect(within(dialog).queryByTestId("cevrimdisi")).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* Proje kanalı yönlendirmesi                                           */
/* ------------------------------------------------------------------ */

function renderGuard(fetchImpl: typeof fetch) {
  let fire: (e: ChannelEvent) => void = () => {};
  function Page() {
    fire = useProjectChannelGuard(
      { id: "web", name: "Web Sitesi Yenileme" },
      [{ id: "mehmet", name: "Mehmet Kaya" }],
      fetchImpl,
    );
    return <p>Proje sayfası</p>;
  }
  const Stub = createRoutesStub([
    { path: "/proje/web", Component: Page },
    { path: "/", Component: () => <p>Notlarım</p> },
  ]);
  render(
    <LiveConfigProvider enabled me={ME}>
      <Stub initialEntries={["/proje/web"]} />
      <Toaster />
    </LiveConfigProvider>,
  );
  return (e: Record<string, unknown>) =>
    act(() => fire({ by: "mehmet", at: 1, ...e } as ChannelEvent));
}

describe("proje kanalı: silme ve üyelik", () => {
  it("başkası projeyi silince Notlarım'a dönülür ve toast söyler", async () => {
    const send = renderGuard(vi.fn());
    send({ type: "proje-silindi" });
    expect(await screen.findByText("Notlarım")).toBeInTheDocument();
    expect(await screen.findByText("Web Sitesi Yenileme silindi")).toBeInTheDocument();
    expect(
      screen.getByText("Mehmet Kaya bu projeyi sildi. Notlarım'a döndün."),
    ).toBeInTheDocument();
  });

  it("projeden çıkarılınca (sunucu 404) Notlarım'a dönülür", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    const send = renderGuard(fetchImpl);
    send({ type: "uyelik", userId: "ayse" });
    expect(await screen.findByText("Notlarım")).toBeInTheDocument();
    expect(await screen.findByText("Projeden çıkarıldın")).toBeInTheDocument();
    expect(fetchImpl).toHaveBeenCalledWith("/api/projeler/web", expect.anything());
  });

  it("rolü değişince sayfada kalınır, toast yeni rolü söyler", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ myRole: "goruntuleyici" }), { status: 200 }),
    );
    const send = renderGuard(fetchImpl);
    send({ type: "uyelik", userId: "ayse" });
    expect(await screen.findByText("Rolün değişti")).toBeInTheDocument();
    expect(
      screen.getByText("Web Sitesi Yenileme projesinde artık görüntüleyici rolündesin."),
    ).toBeInTheDocument();
    expect(screen.getByText("Proje sayfası")).toBeInTheDocument();
  });

  it("başkasının üyeliği ve kendi silmem yönlendirmez", async () => {
    const fetchImpl = vi.fn();
    const send = renderGuard(fetchImpl);
    send({ type: "uyelik", userId: "can" });
    send({ type: "proje-silindi", by: "ayse" });
    expect(screen.getByText("Proje sayfası")).toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

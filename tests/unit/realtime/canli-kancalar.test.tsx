import { act, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveConfigProvider } from "~/components/realtime/live-context";
import {
  GRID_REVALIDATE_MS,
  PERSONAL_CHANNEL,
  useLiveGrid,
} from "~/components/realtime/use-live-channel";
import { useLiveNote } from "~/components/realtime/use-live-note";
import type { NoteCardData } from "~/domain/notes/optimistic";
import { FakeSocket } from "./sahte-soket";

const me = { id: "u1", name: "Ayşe", color: "#123456" };

const card = (id: string, color: NoteCardData["color"] = "default"): NoteCardData => ({
  id,
  kind: "text",
  title: id,
  color,
  pinned: false,
  position: id.charCodeAt(0),
  preview: "",
  tasks: [],
  moreTasks: 0,
  updatedAt: "2026-11-07T10:00:00.000Z",
  archivedAt: null,
  trashedAt: null,
});

beforeEach(() => {
  FakeSocket.reset();
  vi.stubGlobal("WebSocket", FakeSocket);
});
afterEach(() => {
  vi.useRealTimers();
});

const event = (seq: number, e: Record<string, unknown>) =>
  JSON.stringify({ t: "olay", seq, event: { by: "u2", at: 1, ...e } });

function Grid({ notes }: { notes: NoteCardData[] }) {
  const { notes: live, live: state } = useLiveGrid(notes, "notlar", PERSONAL_CHANNEL);
  return (
    <div>
      <p data-testid="durum">{state?.status ?? "kapali"}</p>
      <ul>
        {live.map((n) => (
          <li key={n.id} data-color={n.color}>
            {n.id}
          </li>
        ))}
      </ul>
    </div>
  );
}

function renderGrid(enabled: boolean, loader = vi.fn(() => ({ notes: [card("a"), card("b")] }))) {
  const Stub = createRoutesStub([
    {
      path: "/",
      loader,
      Component: () => {
        return (
          <LiveConfigProvider enabled={enabled} me={me}>
            <Grid notes={[card("a"), card("b")]} />
          </LiveConfigProvider>
        );
      },
    },
  ]);
  return { ...render(<Stub initialEntries={["/"]} />), loader };
}

describe("useLiveGrid", () => {
  it("canlı katman kapalıyken bağlanmaz", async () => {
    renderGrid(false);
    expect(await screen.findByTestId("durum")).toHaveTextContent("kapali");
    expect(FakeSocket.all).toHaveLength(0);
  });

  it("kişisel kanala bağlanır; olayları ızgaraya uygular, gerekince yeniden doğrular", async () => {
    const { loader } = renderGrid(true);
    await screen.findByTestId("durum");
    await vi.waitFor(() => expect(FakeSocket.last).toBeDefined());
    const ws = FakeSocket.last;
    expect(ws.url).toMatch(/\/api\/kanal\/kisisel$/);
    act(() => ws.open());
    expect(screen.getByTestId("durum")).toHaveTextContent("bagli");
    act(() => ws.receive(JSON.stringify({ t: "hosgeldin", seq: 0 })));
    act(() => ws.receive(event(1, { type: "renk", noteId: "a", color: "mavi" })));
    expect(screen.getByText("a")).toHaveAttribute("data-color", "mavi");
    act(() => ws.receive(event(2, { type: "arsivlendi", noteId: "b" })));
    expect(screen.queryByText("b")).toBeNull();
    const calls = loader.mock.calls.length;
    vi.useFakeTimers();
    act(() => ws.receive(event(3, { type: "olusturuldu", noteId: "c" })));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GRID_REVALIDATE_MS);
    });
    vi.useRealTimers();
    await vi.waitFor(() => expect(loader.mock.calls.length).toBeGreaterThan(calls));
  });

  it("yeniden bağlanınca sıra numarası atladıysa yeniden doğrular", async () => {
    const { loader } = renderGrid(true);
    await screen.findByTestId("durum");
    await vi.waitFor(() => expect(FakeSocket.last).toBeDefined());
    const first = FakeSocket.last;
    act(() => first.open());
    act(() => first.receive(JSON.stringify({ t: "hosgeldin", seq: 4 })));
    const calls = loader.mock.calls.length;
    act(() => first.serverClose(4000));
    await vi.waitFor(() => expect(FakeSocket.last).not.toBe(first), { timeout: 5000 });
    act(() => FakeSocket.last.open());
    act(() => FakeSocket.last.receive(JSON.stringify({ t: "hosgeldin", seq: 6 })));
    await vi.waitFor(() => expect(loader.mock.calls.length).toBeGreaterThan(calls), {
      timeout: 2000,
    });
  });
});

function Note({ readOnly = false }: { readOnly?: boolean }) {
  const live = useLiveNote({ noteId: "n1", kind: "todo", readOnly });
  if (!live) return <p data-testid="not">kapali</p>;
  return (
    <p data-testid="not">
      {live.status}:{String(live.canWrite)}:{String(live.canEdit)}:{live.peers.length}
    </p>
  );
}

describe("useLiveNote", () => {
  it("sağlayıcı yoksa null (eski HTTP davranışı)", () => {
    render(<Note />);
    expect(screen.getByTestId("not")).toHaveTextContent("kapali");
  });

  it("bağlanır; durum, yazma bayrakları ve görev yayını", async () => {
    const seen: number[] = [];
    function WithTasks() {
      const live = useLiveNote({ noteId: "n1", kind: "todo" });
      if (live) live.tasks.subscribe((s) => seen.push(s.seq));
      return <Note />;
    }
    render(
      <LiveConfigProvider enabled me={me}>
        <WithTasks />
      </LiveConfigProvider>,
    );
    // Sağlayıcı (Yjs) tembel yüklenir.
    await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(2), { timeout: 5000 });
    expect(FakeSocket.all[0]!.url).toMatch(/\/api\/notlar\/n1\/canli$/);
    // Tembel yüklemeden sonra yeni soket açılabilir; selamlanmamış her soketi aç ve selamla.
    const greeted = new Set<unknown>();
    const greetAll = () =>
      act(() =>
        FakeSocket.all.forEach((s) => {
          if (greeted.has(s)) return;
          greeted.add(s);
          s.open();
          s.receive(
            JSON.stringify({
              t: "hosgeldin",
              docId: "d",
              kind: "todo",
              readOnly: false,
              user: me,
              seq: 0,
            }),
          );
        }),
      );
    await vi.waitFor(
      () => {
        greetAll();
        expect(screen.getByTestId("not")).toHaveTextContent("bagli:true:true:0");
      },
      { timeout: 5000 },
    );
    act(() =>
      FakeSocket.all.forEach((s) =>
        s.receive(JSON.stringify({ t: "gorevler", seq: 1, tasks: [], assignees: {}, by: "u2" })),
      ),
    );
    expect(seen).toContain(1);
    act(() => FakeSocket.all.forEach((s) => s.serverClose(1006)));
    expect(screen.getByTestId("not")).toHaveTextContent("cevrimdisi:false:false:0");
  });

  it("salt okunur ipucu yazmayı kapatır", () => {
    render(
      <LiveConfigProvider enabled me={me}>
        <Note readOnly />
      </LiveConfigProvider>,
    );
    expect(screen.getByTestId("not")).toHaveTextContent("baglaniyor:false:false:0");
  });
});

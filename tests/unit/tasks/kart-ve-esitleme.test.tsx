import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { Toaster } from "sonner";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "~/components/notes/composer";
import { NoteCard } from "~/components/notes/note-card";
import type { NoteActions } from "~/components/notes/use-note-actions";
import { APPEND, projectDrop, withoutDescendants, type DragRow } from "~/components/tasks/drag";
import { createTaskSync, mergeOps } from "~/components/tasks/task-sync";
import { changedByCompletion } from "~/components/tasks/use-card-task-toggle";
import type { NoteCardData } from "~/domain/notes/optimistic";
import { makeTask, type Task } from "~/domain/tasks/model";
import type { TaskOp } from "~/domain/tasks/ops";
import { fakeServer } from "./editor-yardimci";
import { initial } from "./ornek";

const todoCard = (): NoteCardData => ({
  id: "n1",
  kind: "todo",
  title: "Market",
  color: "default",
  pinned: false,
  position: 0,
  preview: "",
  tasks: [
    { id: "g1", title: "Süt", done: false },
    { id: "g2", title: "Ekmek", done: false },
    { id: null, title: "Gönderiliyor", done: false },
  ],
  moreTasks: 0,
  updatedAt: "2026-11-05T11:20:00.000Z",
  archivedAt: null,
  trashedAt: null,
});

function inRouter(ui: React.ReactNode) {
  const Stub = createRoutesStub([{ path: "/", Component: () => <>{ui}</> }]);
  return render(
    <>
      <Stub initialEntries={["/"]} />
      <Toaster />
    </>,
  );
}

describe("kartta görev işaretleme", () => {
  it("kutucuk görevi tamamlar, karttan kaldırır; toast'taki Geri al yeniden açar", async () => {
    const server = fakeServer([
      makeTask("g1", null, 0, { title: "Süt" }),
      makeTask("g2", null, 1, { title: "Ekmek" }),
    ]);
    const user = userEvent.setup();
    inRouter(
      <NoteCard
        note={todoCard()}
        view="notlar"
        href="/not/n1"
        actions={{} as NoteActions}
        onVersions={vi.fn()}
      />,
    );
    // İyimser (henüz kimliği olmayan) görevin kutucuğu yoktur.
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    await user.click(screen.getByRole("checkbox", { name: "Süt tamamlandı olarak işaretle" }));
    expect(screen.queryByText("Süt")).toBeNull();
    await waitFor(() => expect(server.calls[0]).toEqual([{ op: "complete", id: "g1" }]));
    const toast = await screen.findByText("Süt tamamlandı");
    await user.click(
      toast
        .closest("[data-sonner-toast]")!
        .querySelector<HTMLButtonElement>("button[data-button]")!,
    );
    await waitFor(() => expect(screen.getByText("Süt")).toBeInTheDocument());
    await waitFor(() => expect(server.calls[1]).toEqual([{ op: "reopen", ids: ["g1"] }]));
  });

  it("geri al yalnızca aynı anda tamamlananları açar", () => {
    const tasks: Task[] = [
      makeTask("a", null, 0, { completedAt: 500 }),
      makeTask("b", "a", 0, { completedAt: 100 }),
      makeTask("c", "a", 1, { completedAt: 500 }),
      makeTask("d", null, 1),
    ];
    expect(changedByCompletion(tasks, "a")).toEqual(["a", "c"]);
    expect(changedByCompletion(tasks, "d")).toEqual(["d"]);
  });
});

describe("görev eşitleme kuyruğu", () => {
  const ok = (tasks: Task[]) => Promise.resolve({ ok: true as const, tasks });

  it("ardışık güncellemeler aynı görevdeyse birleşir", () => {
    const ops: TaskOp[] = mergeOps(
      [{ op: "update", id: "a", title: "S" }],
      [
        { op: "update", id: "a", title: "Sü" },
        { op: "update", id: "a", description: "x" },
        { op: "update", id: "b", title: "B" },
      ],
    );
    expect(ops).toEqual([
      { op: "update", id: "a", title: "Sü", description: "x" },
      { op: "update", id: "b", title: "B" },
    ]);
  });

  it("aynı anda tek istek uçar; uçarken gelenler sonraki istekte, yanıt üstüne yeniden uygulanır", async () => {
    let release: (v: { ok: true; tasks: Task[] }) => void = () => {};
    const send = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (release = r)))
      .mockImplementation((ops: TaskOp[]) =>
        ok([makeTask("x", null, 0, { title: String(ops.length) })]),
      );
    const seen: Task[][] = [];
    const sync = createTaskSync({ send, reload: vi.fn(), onTasks: (t) => seen.push(t) });
    sync.push([
      { op: "create", id: "11111111-1111-4111-8111-111111111111", parentId: null, position: 0 },
    ]);
    sync.push([{ op: "update", id: "11111111-1111-4111-8111-111111111111", title: "a" }]);
    sync.push([{ op: "update", id: "11111111-1111-4111-8111-111111111111", title: "ab" }]);
    expect(send).toHaveBeenCalledTimes(1);
    const idle = sync.whenIdle();
    release({ ok: true, tasks: [makeTask("11111111-1111-4111-8111-111111111111", null, 0)] });
    await idle;
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0]).toEqual([
      { op: "update", id: "11111111-1111-4111-8111-111111111111", title: "ab" },
    ]);
    // İlk yanıt, kuyruktaki güncelleme yeniden uygulanarak gösterildi.
    expect(seen[0]![0]!.title).toBe("ab");
  });

  it("409 yanıtında liste yeniden yüklenir ve kuyruk boşalır", async () => {
    const fresh = [makeTask("s", null, 0, { title: "sunucu" })];
    const onTasks = vi.fn();
    const onConflict = vi.fn();
    const sync = createTaskSync({
      send: () => Promise.resolve({ ok: false, status: 409 }),
      reload: () => Promise.resolve(fresh),
      onTasks,
      onConflict,
    });
    sync.push([{ op: "complete", id: "yok" }]);
    await sync.whenIdle();
    expect(onConflict).toHaveBeenCalledWith(409);
    expect(onTasks).toHaveBeenCalledWith(fresh);
    expect(sync.pending).toBe(false);
  });

  it("yazım güncellemesi gecikmeli gönderilir; çıkarken kuyruk yanıt beklemeden boşaltılır", () => {
    vi.useFakeTimers();
    const send = vi.fn(() => ok([]));
    const sync = createTaskSync({ send, reload: vi.fn(), onTasks: vi.fn(), typingDelay: 300 });
    sync.push([{ op: "update", id: "a", title: "x" }]);
    expect(send).not.toHaveBeenCalled();
    const sendNow = vi.fn();
    sync.drain(sendNow);
    expect(sendNow).toHaveBeenCalledWith([{ op: "update", id: "a", title: "x" }]);
    vi.advanceTimersByTime(500);
    expect(send).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("sürükle-bırak hedefi", () => {
  const rows: DragRow[] = [
    { id: "a", parentId: null, depth: 0, expanded: true },
    { id: "a1", parentId: "a", depth: 1, expanded: false },
    { id: "b", parentId: null, depth: 0, expanded: false },
    { id: "c", parentId: null, depth: 0, expanded: false },
  ];

  it("sürüklenenin görünür alt satırları hedeften çıkar", () => {
    expect(withoutDescendants(rows, "a").map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("aynı seviyede aşağı taşıma", () => {
    expect(projectDrop(rows, "b", "c", 0, 28)).toEqual({
      depth: 0,
      parentId: null,
      index: 2,
      expand: null,
    });
  });

  it("sağa çekince başka görevin altına (kapalıysa sona) bırakılır ve üst açılır", () => {
    expect(projectDrop(rows, "c", "c", 40, 28)).toEqual({
      depth: 1,
      parentId: "b",
      index: APPEND,
      expand: "b",
    });
  });

  it("alt görevi sola çekince üst seviyeye çıkar; derinlik komşularla sınırlanır", () => {
    expect(projectDrop(rows, "a1", "a1", -40, 28)).toMatchObject({
      depth: 0,
      parentId: null,
      index: 1,
    });
    expect(projectDrop(rows, "b", "b", 200, 28)).toMatchObject({ depth: 2, parentId: "a1" });
    expect(projectDrop(rows, "a", "a", 100, 28)).toMatchObject({ depth: 0 });
    expect(projectDrop(rows, "x", "a", 0, 28)).toBeNull();
  });
});

describe("not al: yapılacaklar modu", () => {
  it("iki boş görev satırıyla açılır; Enter yeni satır, boşlar atılarak kaydedilir", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<Composer onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: "Yeni yapılacaklar notu" }));
    const form = screen.getByRole("form", { name: "Yeni yapılacaklar notu" });
    const rows = () => screen.getAllByRole("textbox", { name: "Görev başlığı" });
    expect(rows()).toHaveLength(2);
    await user.type(screen.getByLabelText("Not başlığı"), "Market{Enter}");
    expect(document.activeElement).toBe(rows()[0]);
    await user.keyboard("Süt{Enter}Ekmek{Enter}");
    expect(rows()).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "Görev ekle" }));
    expect(rows()).toHaveLength(5);
    await user.keyboard("{Backspace}");
    expect(rows()).toHaveLength(4);
    await user.click(form.querySelector<HTMLButtonElement>("button[type=submit]")!);
    expect(onSave).toHaveBeenCalledWith({
      kind: "todo",
      title: "Market",
      bodyHtml: "",
      tasks: ["Süt", "Ekmek"],
      color: "default",
      pinned: false,
    });
  });

  it("metin ↔ yapılacaklar arasında geçer", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<Composer onSave={onSave} defaultOpen defaultMode="todo" />);
    await user.type(screen.getAllByRole("textbox", { name: "Görev başlığı" })[0]!, "Bir");
    await user.click(screen.getByRole("button", { name: "Metin notuna dönüştür" }));
    expect(screen.queryByRole("textbox", { name: "Görev başlığı" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Yapılacaklar notuna dönüştür" }));
    expect(screen.getAllByRole("textbox", { name: "Görev başlığı" })[0]).toHaveValue("Bir");
  });
});

it("örnek ağaç 15 görev içerir (yardımcı veri)", () => {
  expect(initial()).toHaveLength(15);
});

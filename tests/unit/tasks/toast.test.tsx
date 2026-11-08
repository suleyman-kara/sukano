import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoEditorHandle } from "~/components/tasks/todo-editor";
import { viewStateKey } from "~/components/tasks/use-task-view-state";
import { TOAST_MIN_LEFT, TOAST_MS } from "~/domain/tasks/undo";
import { initial } from "./ornek";
import { caretAt, fakeServer, renderEditor, titleInput, visibleTitles } from "./editor-yardimci";

/** Not içi toast yığını, Ctrl+Z ve üzerine gelince durma (PLAN §10). */

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-06T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const toasts = () => [...document.querySelectorAll("[data-todo-toast] > span:first-child")];
const stack = () => document.querySelector("[data-todo-toast]")!.parentElement!;
const advance = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

async function complete(user: ReturnType<typeof setup>, title: string) {
  caretAt(titleInput(title), "end");
  await user.keyboard("{Control>}{Enter}{/Control}");
}

describe("toast yığını ve geri al", () => {
  it("en çok iki toast yığılır, en yeni üstte; zincirde üst görev adı yazar", async () => {
    localStorage.setItem(viewStateKey("not-1"), JSON.stringify({ acik: ["t1"] }));
    fakeServer(initial());
    const user = setup();
    renderEditor(initial());
    await waitFor(() => titleInput("Ürün sayfası"));
    await complete(user, "SEO kontrolleri");
    await complete(user, "Ürün sayfası");
    await complete(user, "Mobil görünüm");
    expect(toasts().map((t) => t.textContent)).toEqual([
      "Tasarım onayı da tamamlandı",
      "Ürün sayfası tamamlandı",
    ]);
  });

  it("toast 8 sn sonra kalkar; üzerine gelince süre durur, çıkınca en az 2 sn daha kalır", async () => {
    fakeServer(initial());
    const user = setup();
    renderEditor(initial());
    await complete(user, "SEO kontrolleri");
    const toast = screen.getByText("SEO kontrolleri tamamlandı").closest("[data-todo-toast]")!;
    await advance(TOAST_MS - 500);
    fireEvent.mouseEnter(stack());
    await advance(10_000);
    expect(screen.getByText("SEO kontrolleri tamamlandı")).toBeInTheDocument();
    fireEvent.mouseLeave(toast.parentElement!);
    await advance(TOAST_MIN_LEFT - 100);
    expect(toast).toBeInTheDocument();
    await advance(200);
    expect(screen.queryByText("SEO kontrolleri tamamlandı")).toBeNull();
  });

  it("odak toast'tayken süre durur", async () => {
    fakeServer(initial());
    const user = setup();
    renderEditor(initial());
    await complete(user, "SEO kontrolleri");
    act(() => screen.getByRole("button", { name: "Geri al: SEO kontrolleri tamamlandı" }).focus());
    await advance(TOAST_MS + 1000);
    expect(screen.getByText("SEO kontrolleri tamamlandı")).toBeInTheDocument();
  });

  it("toast'taki Geri al tam olarak değişen görevleri açar (reopen)", async () => {
    const server = fakeServer(initial());
    const user = setup();
    const { container } = renderEditor(initial());
    await complete(user, "SEO kontrolleri");
    await user.click(screen.getByRole("button", { name: "Geri al: SEO kontrolleri tamamlandı" }));
    expect(container.querySelector('[data-task-row="t3"]')).not.toHaveAttribute("data-done");
    expect(screen.queryByText("SEO kontrolleri tamamlandı")).toBeNull();
    await waitFor(() => expect(server.calls.flat()).toContainEqual({ op: "reopen", ids: ["t3"] }));
    expect(server.tasks().find((t) => t.id === "t3")!.completedAt).toBeNull();
  });

  it("Ctrl+Z son tamamlamayı geri alır; başlık yazıldıktan sonra Ctrl+Z metne kalır", async () => {
    const server = fakeServer(initial());
    const user = setup();
    const { container } = renderEditor(initial());
    await complete(user, "SEO kontrolleri");
    await user.keyboard("{Control>}z{/Control}");
    expect(container.querySelector('[data-task-row="t3"]')).not.toHaveAttribute("data-done");
    expect(document.activeElement).toHaveValue("SEO kontrolleri");

    await complete(user, "SEO kontrolleri");
    caretAt(titleInput("Lansman duyurusu"), "end");
    await user.keyboard("!");
    await user.keyboard("{Control>}z{/Control}");
    await advance(1300);
    expect(container.querySelector('[data-task-row="t3"]')).toBeNull();
    // Toast'taki Geri al yine çalışır.
    await user.click(screen.getByRole("button", { name: "Geri al: SEO kontrolleri tamamlandı" }));
    expect(visibleTitles(container)).toContain("SEO kontrolleri");
    await waitFor(() => expect(server.tasks().find((t) => t.id === "t3")!.completedAt).toBeNull());
  });

  it("Ctrl+Z liste dışında (kutucukta) da son tamamlamayı geri alır", async () => {
    fakeServer(initial());
    const user = setup();
    const { container } = renderEditor(initial());
    await user.click(
      screen.getByRole("checkbox", { name: "SEO kontrolleri tamamlandı olarak işaretle" }),
    );
    expect(container.querySelector('[data-task-row="t3"]')).toHaveAttribute("data-done");
    await user.keyboard("{Control>}z{/Control}");
    expect(container.querySelector('[data-task-row="t3"]')).not.toHaveAttribute("data-done");
  });

  it("Tamamlananları sil geri alınabilir toast gösterir", async () => {
    const server = fakeServer(initial());
    const ref = createRef<TodoEditorHandle>();
    const user = setup();
    renderEditor(initial(), { ref });
    act(() => ref.current!.clearCompleted());
    expect(screen.queryByRole("button", { name: /Tamamlananlar/ })).toBeNull();
    const toast = screen.getByText("5 tamamlanan görev silindi");
    await waitFor(() => expect(server.calls.flat()).toContainEqual({ op: "clearCompleted" }));
    await user.click(
      within(toast.closest("[data-todo-toast]") as HTMLElement).getByRole("button", {
        name: /^Geri al/,
      }),
    );
    expect(screen.getByRole("button", { name: "Tamamlananlar (2)" })).toBeInTheDocument();
    await waitFor(() => expect(server.tasks()).toHaveLength(15));
  });

  it("Tümünü aç / Tümünü kapat", async () => {
    fakeServer(initial());
    const ref = createRef<TodoEditorHandle>();
    const { container } = renderEditor(initial(), { ref });
    act(() => ref.current!.expandAll());
    expect(visibleTitles(container)).toContain("    Kargo soruları");
    act(() => ref.current!.collapseAll());
    expect(visibleTitles(container)).not.toContain("  Ürün sayfası");
  });
});

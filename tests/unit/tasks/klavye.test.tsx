import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_ROW_PLACEHOLDER } from "~/components/tasks/task-row";
import { viewStateKey } from "~/components/tasks/use-task-view-state";
import { SETTLE_MS } from "~/domain/tasks/undo";
import { fromSpec, initial } from "./ornek";
import { caretAt, fakeServer, renderEditor, titleInput, visibleTitles } from "./editor-yardimci";

/**
 * Yapılacaklar notu klavye akışı (PLAN §3 tablo, prototip TodoNote `key()`): her tuş,
 * odak geçişleri ve katmanlı Esc. Global dinleyici yok; tuşlar editörün içindedir.
 */

const NOW = new Date("2026-11-06T09:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const openT1 = () => localStorage.setItem(viewStateKey("not-1"), JSON.stringify({ acik: ["t1"] }));

describe("klavye akışı", () => {
  it("ilk açılışta yalnızca üst seviye görünür; tamamlananlar grupta", () => {
    fakeServer(initial());
    const { container } = renderEditor(initial());
    expect(visibleTitles(container)).toEqual([
      "Tasarım onayı",
      "İçerik yazımı",
      "SEO kontrolleri",
      "Lansman duyurusu",
    ]);
    expect(screen.getByRole("button", { name: "Tamamlananlar (2)" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("Enter sonda aynı seviyede yeni görev açar; boş satırda ipucu yer tutucusu görünür", async () => {
    const server = fakeServer(initial());
    const user = userEvent.setup();
    const { container } = renderEditor(initial());
    caretAt(titleInput("SEO kontrolleri"), "end");
    await user.keyboard("{Enter}");
    const fresh = document.activeElement as HTMLInputElement;
    expect(fresh.value).toBe("");
    expect(fresh).toHaveAttribute("placeholder", EMPTY_ROW_PLACEHOLDER);
    expect(visibleTitles(container)).toEqual([
      "Tasarım onayı",
      "İçerik yazımı",
      "SEO kontrolleri",
      "",
      "Lansman duyurusu",
    ]);
    await user.keyboard("Yeni iş");
    await waitFor(() =>
      expect(server.tasks().some((t) => t.title === "Yeni iş" && t.parentId === null)).toBe(true),
    );
  });

  it("Enter başlığın ortasında metni böler; imleç baştaysa üste boş satır ekler", async () => {
    fakeServer(initial());
    const user = userEvent.setup();
    const { container } = renderEditor(initial());
    caretAt(titleInput("SEO kontrolleri"), 3);
    await user.keyboard("{Enter}");
    expect(visibleTitles(container).slice(2, 4)).toEqual(["SEO", " kontrolleri"]);
    expect(document.activeElement).toHaveValue(" kontrolleri");
    expect((document.activeElement as HTMLInputElement).selectionStart).toBe(0);

    caretAt(titleInput("Lansman duyurusu"), 0);
    await user.keyboard("{Enter}");
    expect(visibleTitles(container).slice(4, 6)).toEqual(["", "Lansman duyurusu"]);
    expect(document.activeElement).toHaveValue("Lansman duyurusu");
  });

  it("boş alt görevde Enter girintiyi azaltır", async () => {
    fakeServer(initial());
    openT1();
    const user = userEvent.setup();
    const { container } = renderEditor(initial());
    await waitFor(() => expect(visibleTitles(container)).toContain("  Mobil görünüm"));
    caretAt(titleInput("Mobil görünüm"), "end");
    await user.keyboard("{Enter}");
    expect(visibleTitles(container)).toContain("  ");
    await user.keyboard("{Enter}");
    const rows = visibleTitles(container);
    expect(rows.indexOf("")).toBeGreaterThan(rows.indexOf("  Mobil görünüm"));
    expect(document.activeElement).toHaveValue("");
  });

  it("Tab girintiler (üst açılır), Shift+Tab girintiyi azaltır; odak satırda kalır", async () => {
    const server = fakeServer(initial());
    const user = userEvent.setup();
    const { container } = renderEditor(initial());
    caretAt(titleInput("SEO kontrolleri"), "end");
    await user.keyboard("{Tab}");
    expect(visibleTitles(container)).toContain("  SEO kontrolleri");
    expect(document.activeElement).toHaveValue("SEO kontrolleri");
    await waitFor(() => expect(server.tasks().find((t) => t.id === "t3")!.parentId).toBe("t2"));
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(visibleTitles(container)).toContain("SEO kontrolleri");
    expect(document.activeElement).toHaveValue("SEO kontrolleri");
    await waitFor(() => expect(server.tasks().find((t) => t.id === "t3")!.parentId).toBeNull());
  });

  it("boş satırda Backspace satırı siler ve odağı üst satıra verir", async () => {
    fakeServer(initial());
    const user = userEvent.setup();
    const { container } = renderEditor(initial());
    caretAt(titleInput("SEO kontrolleri"), "end");
    await user.keyboard("{Enter}");
    await user.keyboard("{Backspace}");
    expect(visibleTitles(container)).toEqual([
      "Tasarım onayı",
      "İçerik yazımı",
      "SEO kontrolleri",
      "Lansman duyurusu",
    ]);
    expect(document.activeElement).toHaveValue("SEO kontrolleri");
  });

  it("alt görevi olan boş satır silinmez, sallanır", async () => {
    const tasks = fromSpec([{ id: "a", title: "", kids: [{ id: "b", title: "Alt" }] }]);
    fakeServer(tasks);
    const user = userEvent.setup();
    const { container } = renderEditor(tasks);
    const input = container.querySelector<HTMLInputElement>('[data-task-input="a"]')!;
    caretAt(input, 0);
    await user.keyboard("{Backspace}");
    expect(container.querySelector('[data-task-row="a"]')).toBeInTheDocument();
    expect(container.querySelector('[data-task-row="a"] .task-line')).toHaveClass("task-nodel");
  });

  it("Alt+↑ / Alt+↓ görevi kardeşleri arasında taşır", async () => {
    const server = fakeServer(initial());
    const user = userEvent.setup();
    const { container } = renderEditor(initial());
    caretAt(titleInput("Lansman duyurusu"), "end");
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(visibleTitles(container).slice(2)).toEqual(["Lansman duyurusu", "SEO kontrolleri"]);
    expect(document.activeElement).toHaveValue("Lansman duyurusu");
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(visibleTitles(container).slice(2)).toEqual(["SEO kontrolleri", "Lansman duyurusu"]);
    await waitFor(() => expect(server.calls.length).toBeGreaterThan(0));
  });

  it("↑ / ↓ satırlar arasında gezer ve imleç sütununu korur", async () => {
    fakeServer(initial());
    const user = userEvent.setup();
    renderEditor(initial());
    caretAt(titleInput("İçerik yazımı"), 3);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toHaveValue("SEO kontrolleri");
    expect((document.activeElement as HTMLInputElement).selectionStart).toBe(3);
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(document.activeElement).toHaveValue("Tasarım onayı");
  });

  it("→ sondayken alt görevleri açar, ← baştayken kapatır; durum cihazda saklanır", async () => {
    fakeServer(initial());
    const user = userEvent.setup();
    const { container, unmount } = renderEditor(initial());
    caretAt(titleInput("Tasarım onayı"), "end");
    await user.keyboard("{ArrowRight}");
    expect(visibleTitles(container)).toContain("  Ürün sayfası");
    expect(JSON.parse(localStorage.getItem(viewStateKey("not-1"))!).acik).toEqual(["t1"]);
    unmount();

    const again = renderEditor(initial());
    await waitFor(() => expect(visibleTitles(again.container)).toContain("  Ürün sayfası"));
    caretAt(titleInput("Tasarım onayı"), 0);
    await user.keyboard("{ArrowLeft}");
    expect(visibleTitles(again.container)).not.toContain("  Ürün sayfası");
    expect(localStorage.getItem(viewStateKey("not-1"))).toBeNull();
  });

  it("ok düğmesi ve 'Tamamlananlar' grubu aç/kapa", async () => {
    fakeServer(initial());
    const user = userEvent.setup();
    const { container } = renderEditor(initial());
    const row = container.querySelector<HTMLElement>('[data-task-row="t1"]')!;
    await user.click(within(row).getByRole("button", { name: "Alt görevleri aç veya kapat" }));
    expect(visibleTitles(container)).toContain("  Mobil görünüm");
    await user.click(screen.getByRole("button", { name: "Tamamlananlar (2)" }));
    expect(visibleTitles(container)).toContain("Barındırma kurulumu");
    expect(JSON.parse(localStorage.getItem(viewStateKey("not-1"))!)).toEqual({
      acik: ["t1"],
      tamamlananlar: ["root"],
    });
  });

  it("Ctrl+Enter tamamlar, odak sonraki satıra geçer; satır 1,2 sn yerinde kalıp gruba iner", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    const server = fakeServer(initial());
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = renderEditor(initial());
    caretAt(titleInput("SEO kontrolleri"), "end");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(document.activeElement).toHaveValue("Lansman duyurusu");
    expect(container.querySelector('[data-task-row="t3"]')).toHaveAttribute("data-done");
    expect(screen.getByText("SEO kontrolleri tamamlandı")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(SETTLE_MS + 50);
    });
    expect(container.querySelector('[data-task-row="t3"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Tamamlananlar (3)" })).toBeInTheDocument();
    await waitFor(() => expect(server.calls.flat()).toContainEqual({ op: "complete", id: "t3" }));
  });

  it("son açık satırı tamamlayınca odak 'Görev ekle' düğmesine gider", async () => {
    const tasks = fromSpec([{ id: "a", title: "Tek görev" }]);
    fakeServer(tasks);
    const user = userEvent.setup();
    renderEditor(tasks);
    caretAt(titleInput("Tek görev"), "end");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(document.activeElement).toHaveTextContent("Görev ekle");
  });

  it("Shift+Enter ayrıntıyı açar ve odağı açıklamaya verir; Esc kapatır, odak satıra döner", async () => {
    fakeServer(initial());
    const user = userEvent.setup();
    renderEditor(initial());
    caretAt(titleInput("İçerik yazımı"), "end");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    const detail = await screen.findByRole("group", { name: "İçerik yazımı: ayrıntılar" });
    expect(within(detail).getByRole("button", { name: "Tarih: 3 → 12 Kas, 17:00" })).toBeVisible();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(detail).getByRole("textbox", { name: "Açıklama" }),
      ),
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "İçerik yazımı: ayrıntılar" })).toBeNull();
    expect(document.activeElement).toHaveValue("İçerik yazımı");
  });

  it("'Alt görev ekle' üstü açar ve yeni alt göreve odaklanır", async () => {
    const server = fakeServer(initial());
    const user = userEvent.setup();
    const { container } = renderEditor(initial());
    const row = container.querySelector<HTMLElement>('[data-task-row="t3"]')!;
    await user.click(within(row).getByRole("button", { name: "Ayrıntılar" }));
    await user.click(screen.getByRole("button", { name: "Alt görev ekle" }));
    expect(visibleTitles(container)).toContain("  ");
    await user.keyboard("Robots.txt");
    await waitFor(() =>
      expect(server.tasks().find((t) => t.title === "Robots.txt")?.parentId).toBe("t3"),
    );
  });

  it("Ctrl+D tarih seçiciyi açar, odak doğal yazım alanına gelir; bitişte Enter kapatıp satıra döner", async () => {
    const server = fakeServer(initial());
    const user = userEvent.setup();
    const { container } = renderEditor(initial());
    caretAt(titleInput("Lansman duyurusu"), "end");
    await user.keyboard("{Control>}d{/Control}");
    const field = await screen.findByRole("textbox", { name: "Bitiş tarihini yaz" });
    await waitFor(() => expect(document.activeElement).toBe(field));
    await user.keyboard("yarın 17:00{Enter}");
    expect(screen.queryByRole("dialog", { name: "Tarih" })).toBeNull();
    expect(document.activeElement).toHaveValue("Lansman duyurusu");
    expect(container.querySelector('[data-task-row="t6"]')).toHaveTextContent("7 Kas");
    await waitFor(() =>
      expect(server.tasks().find((t) => t.id === "t6")).toMatchObject({
        dueDate: "2026-11-07",
        dueTime: "17:00",
      }),
    );
  });

  it("Ctrl+Shift+A (kişi seçici) kişisel notta yok sayılır", async () => {
    fakeServer(initial());
    const user = userEvent.setup();
    renderEditor(initial());
    caretAt(titleInput("Lansman duyurusu"), "end");
    await user.keyboard("{Control>}{Shift>}a{/Shift}{/Control}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toHaveValue("Lansman duyurusu");
  });

  it("Esc katmanlıdır: seçici → ayrıntı → listeden çık ('Görev ekle')", async () => {
    fakeServer(initial());
    const user = userEvent.setup();
    renderEditor(initial());
    caretAt(titleInput("İçerik yazımı"), "end");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await screen.findByRole("group", { name: "İçerik yazımı: ayrıntılar" });
    caretAt(titleInput("İçerik yazımı"), "end");
    await user.keyboard("{Control>}d{/Control}");
    await screen.findByRole("dialog", { name: "Tarih" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Tarih" })).toBeNull());
    expect(document.activeElement).toHaveValue("İçerik yazımı");
    expect(screen.getByRole("group", { name: "İçerik yazımı: ayrıntılar" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "İçerik yazımı: ayrıntılar" })).toBeNull();
    expect(document.activeElement).toHaveValue("İçerik yazımı");
    await user.keyboard("{Escape}");
    expect(document.activeElement).toHaveTextContent("Görev ekle");
  });

  it("Ctrl+/ kısayol kartını açar; Esc ya da yeniden Ctrl+/ kapatır", async () => {
    fakeServer(initial());
    const user = userEvent.setup();
    renderEditor(initial());
    caretAt(titleInput("SEO kontrolleri"), "end");
    await user.keyboard("{Control>}/{/Control}");
    const card = await screen.findByRole("dialog", { name: "Klavye kısayolları" });
    expect(within(card).getByText("Son tamamlamayı geri al")).toBeInTheDocument();
    expect(within(card).getByText("Üst seviye (boş alt görevde Enter da)")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Klavye kısayolları" })).toBeNull(),
    );
    expect(document.activeElement).toHaveValue("SEO kontrolleri");
    await user.keyboard("{Control>}/{/Control}");
    await screen.findByRole("dialog", { name: "Klavye kısayolları" });
    await user.keyboard("{Control>}/{/Control}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Klavye kısayolları" })).toBeNull(),
    );
  });

  it("'Görev ekle' üst seviyenin sonuna boş görev ekler ve odaklanır", async () => {
    fakeServer(initial());
    const user = userEvent.setup();
    const { container } = renderEditor(initial());
    await user.click(screen.getByRole("button", { name: "Görev ekle" }));
    expect(visibleTitles(container).at(-1)).toBe("");
    expect(document.activeElement).toHaveValue("");
  });

  it("kutucuğun erişilebilir adı görev adını söyler", () => {
    fakeServer(initial());
    renderEditor(initial());
    expect(
      screen.getByRole("checkbox", { name: "SEO kontrolleri tamamlandı olarak işaretle" }),
    ).not.toBeChecked();
  });
});

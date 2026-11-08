import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_BLOCK_MESSAGE,
  canConvertToTodo,
  linesToTasks,
  tasksToHtml,
  textToTaskLines,
  todoSnapshot,
} from "~/domain/tasks/convert";
import { MAX_TASK_TITLE_LENGTH } from "~/domain/tasks/ops";
import { fromSpec, initial } from "./ornek";

describe("metin → yapılacaklar", () => {
  it("her satır üst seviye görev olur; boş satırlar atlanır", () => {
    expect(textToTaskLines("<p>Süt</p><p></p><p>Ekmek<br>Peynir</p>")).toEqual([
      { title: "Süt", done: false },
      { title: "Ekmek", done: false },
      { title: "Peynir", done: false },
    ]);
  });

  it("madde listesi (iç içe dahil) üst seviye görevlere düzleşir", () => {
    const html =
      "<h2>Başlık</h2><ul><li><p>Bir</p><ul><li><p>İki</p></li></ul></li><li><p>Üç</p></li></ul>";
    expect(textToTaskLines(html).map((l) => l.title)).toEqual(["Başlık", "Bir", "İki", "Üç"]);
  });

  it("elle yazılmış madde ve kutucuk işaretleri temizlenir; [x] tamamlanmış sayılır", () => {
    const html =
      "<p>- Süt</p><p>* Ekmek</p><p>• Çay</p><p>1. Kahve</p><p>[ ] Un</p><p>[x] Tuz</p><p>-</p>";
    expect(textToTaskLines(html)).toEqual([
      { title: "Süt", done: false },
      { title: "Ekmek", done: false },
      { title: "Çay", done: false },
      { title: "Kahve", done: false },
      { title: "Un", done: false },
      { title: "Tuz", done: true },
    ]);
  });

  it("çok uzun satır başlık sınırına kısaltılır; boş gövde görev üretmez", () => {
    const [line] = textToTaskLines(`<p>${"a".repeat(MAX_TASK_TITLE_LENGTH + 10)}</p>`);
    expect(line!.title).toHaveLength(MAX_TASK_TITLE_LENGTH);
    expect(textToTaskLines("")).toEqual([]);
    expect(textToTaskLines(null)).toEqual([]);
  });

  it("satırlardan sıralı üst seviye görevler", () => {
    let n = 0;
    const tasks = linesToTasks(
      [
        { title: "A", done: false },
        { title: "B", done: true },
      ],
      () => `g${++n}`,
      7,
      "ben",
    );
    expect(
      tasks.map((t) => [t.id, t.parentId, t.position, t.title, t.completedAt, t.completedBy]),
    ).toEqual([
      ["g1", null, 0, "A", null, null],
      ["g2", null, 1, "B", 7, "ben"],
    ]);
  });

  it("eki olan metin notu dönüştürülemez", () => {
    expect(canConvertToTodo(0)).toEqual({ ok: true });
    expect(canConvertToTodo(2)).toEqual({ ok: false, error: ATTACHMENT_BLOCK_MESSAGE });
    expect(ATTACHMENT_BLOCK_MESSAGE).toBe(
      "Eki olan metin notu önce ekler kaldırılmadan yapılacaklara dönüştürülemez.",
    );
  });
});

describe("yapılacaklar → metin", () => {
  it("görevler madde listesi olur, girinti iç içe listeyle korunur", () => {
    const tasks = fromSpec([
      {
        id: "a",
        title: "Bir",
        kids: [{ id: "b", title: "İki", kids: [{ id: "c", title: "Üç" }] }],
      },
      { id: "d", title: "Dört", done: true },
    ]);
    expect(tasksToHtml(tasks)).toBe(
      "<ul><li><p>Bir</p><ul><li><p>İki</p><ul><li><p>Üç</p></li></ul></li></ul></li><li><p>Dört</p></li></ul>",
    );
  });

  it("HTML kaçışlanır; başlıksız yaprak görevler atlanır, başlıksız üst korunur", () => {
    const tasks = fromSpec([
      { id: "a", title: "<b>&\"'" },
      { id: "b", title: "  " },
      { id: "c", title: "", kids: [{ id: "d", title: "Alt" }] },
    ]);
    expect(tasksToHtml(tasks)).toBe(
      "<ul><li><p>&lt;b&gt;&amp;&quot;&#39;</p></li><li><p></p><ul><li><p>Alt</p></li></ul></li></ul>",
    );
    expect(tasksToHtml([])).toBe("");
  });

  it("sürüm anlık görüntüsü: düz görev listesi, önizleme HTML'i ve arama metni", () => {
    const snap = todoSnapshot(initial());
    expect(snap.tasks).toHaveLength(15);
    expect(snap.html.startsWith("<ul><li><p>Tasarım onayı</p>")).toBe(true);
    expect(snap.text.split("\n").slice(0, 3)).toEqual([
      "Tasarım onayı",
      "Ana sayfa taslağı",
      "Ürün sayfası",
    ]);
  });
});
